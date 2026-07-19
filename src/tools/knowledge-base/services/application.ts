import type { ToolContext } from "@/services/types";
import {
  KnowledgeAccessError,
  assertKnowledgeLibraryAvailable,
  listAuthorizedKnowledgeLibraries,
  resolveAuthorizedLibraryIds,
} from "./access";
import { listKnowledgeChunks, searchKnowledgeDetailed } from "./service";
import type {
  AgentKnowledgeAccess,
  KnowledgeChunk,
  KnowledgeLibrarySummary,
  KnowledgeResult,
  KnowledgeSearchFilters,
  KnowledgeSearchStrategy,
  KnowledgeToolHit,
  KnowledgeToolReadRequest,
  KnowledgeToolReadResponse,
  KnowledgeToolSearchRequest,
  KnowledgeToolSearchResponse,
} from "../types";

const SEARCH_STRATEGIES = new Set<KnowledgeSearchStrategy>([
  "auto",
  "keyword",
  "semantic",
  "hybrid",
]);

export interface KnowledgeApplicationContext {
  agentId: string;
  access: AgentKnowledgeAccess;
}

export function resolveKnowledgeApplicationContext(
  context?: ToolContext
): KnowledgeApplicationContext {
  const agent = context?.agent;
  if (!agent?.id || !agent.knowledgeAccess) {
    throw new KnowledgeAccessError(
      "KNOWLEDGE_DISABLED",
      "Knowledge 工具只能在带有 Agent 权限上下文的会话中执行"
    );
  }
  return { agentId: agent.id, access: agent.knowledgeAccess };
}

export async function listKnowledgeForAgent(
  applicationContext: KnowledgeApplicationContext
): Promise<KnowledgeLibrarySummary[]> {
  return listAuthorizedKnowledgeLibraries(applicationContext.access);
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }
  if (typeof value !== "string") {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      "资料库 ID 必须是字符串数组"
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("[")) {
    try {
      return parseStringArray(JSON.parse(trimmed));
    } catch {
      throw new KnowledgeAccessError(
        "INVALID_REQUEST",
        "资料库 ID 必须是 JSON 字符串数组或逗号分隔文本"
      );
    }
  }
  return parseStringArray(trimmed.split(","));
}

function parseInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      `${label} 必须在 ${minimum} 到 ${maximum} 之间`
    );
  }
  return Math.trunc(parsed);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  throw new KnowledgeAccessError(
    "INVALID_REQUEST",
    "布尔参数必须是 true 或 false"
  );
}

function parseSearchFilters(
  value: unknown
): KnowledgeSearchFilters | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new KnowledgeAccessError(
        "INVALID_REQUEST",
        "filters 必须是 JSON 对象"
      );
    }
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new KnowledgeAccessError("INVALID_REQUEST", "filters 必须是对象");
  }
  const filters = parsed as Record<string, unknown>;
  return {
    documentIds: parseStringArray(filters.documentIds),
    sourceTypes: parseStringArray(filters.sourceTypes),
    pathPrefixes: parseStringArray(filters.pathPrefixes),
    tags: parseStringArray(filters.tags),
  };
}

export function parseKnowledgeToolSearchRequest(
  args: Record<string, unknown>
): KnowledgeToolSearchRequest {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    throw new KnowledgeAccessError("QUERY_REQUIRED", "Knowledge 查询不能为空");
  }
  const strategy = (args.strategy || "auto") as KnowledgeSearchStrategy;
  if (!SEARCH_STRATEGIES.has(strategy)) {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      `Knowledge strategy 无效: ${String(args.strategy)}`
    );
  }
  return {
    query,
    libraryIds: parseStringArray(args.libraryIds),
    strategy,
    topK: parseInteger(args.topK, 8, 1, 50, "topK"),
    filters: parseSearchFilters(args.filters),
    includeAdjacent: parseBoolean(args.includeAdjacent),
    maxChars: parseInteger(args.maxChars, 12000, 1000, 50000, "maxChars"),
  };
}

function matchesFilters(
  result: KnowledgeResult,
  filters?: KnowledgeSearchFilters
): boolean {
  if (
    filters?.documentIds?.length &&
    !filters.documentIds.includes(result.documentId)
  ) {
    return false;
  }
  if (
    filters?.pathPrefixes?.length &&
    !filters.pathPrefixes.some((prefix) => result.sourcePath.startsWith(prefix))
  ) {
    return false;
  }
  if (
    filters?.sourceTypes?.length &&
    !filters.sourceTypes.includes(result.sourceType)
  ) {
    return false;
  }
  if (
    filters?.tags?.length &&
    !filters.tags.every((tag) =>
      result.tags.some(
        (candidate) => candidate.toLocaleLowerCase() === tag.toLocaleLowerCase()
      )
    )
  ) {
    return false;
  }
  return true;
}

async function assertLibrariesAvailable(
  access: AgentKnowledgeAccess,
  libraryIds: string[]
): Promise<void> {
  const summaries = await listAuthorizedKnowledgeLibraries(access);
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  for (const libraryId of libraryIds) {
    const summary = byId.get(libraryId);
    if (!summary) {
      throw new KnowledgeAccessError(
        "LIBRARY_UNAUTHORIZED",
        `当前 Agent 未获授权访问资料库: ${libraryId}`,
        libraryId
      );
    }
    assertKnowledgeLibraryAvailable(summary);
  }
}

export async function authorizeKnowledgeLibraryScope(
  applicationContext: KnowledgeApplicationContext,
  requestedLibraryIds?: string[]
): Promise<string[]> {
  const libraryIds = resolveAuthorizedLibraryIds(
    applicationContext.access,
    requestedLibraryIds
  );
  await assertLibrariesAvailable(applicationContext.access, libraryIds);
  return libraryIds;
}

interface RankedCandidate {
  result: KnowledgeResult;
  rankScore: number;
}

function toHit(candidate: RankedCandidate, snippet: string): KnowledgeToolHit {
  const result = candidate.result;
  return {
    libraryId: result.libraryId,
    documentId: result.documentId,
    chunkId: result.chunkId,
    chunkIndex: result.chunkIndex,
    title: result.title,
    tags: result.tags,
    heading: result.heading,
    sourcePath: result.sourcePath,
    snippet,
    score: result.score,
    rankScore: candidate.rankScore,
    signals: result.signals,
  };
}

async function addAdjacentCandidates(
  candidates: RankedCandidate[]
): Promise<RankedCandidate[]> {
  const seen = new Set(candidates.map((candidate) => candidate.result.chunkId));
  const additions: RankedCandidate[] = [];
  const documentCache = new Map<string, Promise<KnowledgeChunk[]>>();
  for (const candidate of candidates) {
    const result = candidate.result;
    const key = `${result.libraryId}\u0000${result.documentId}`;
    let chunks = documentCache.get(key);
    if (!chunks) {
      chunks = listKnowledgeChunks(result.libraryId, result.documentId);
      documentCache.set(key, chunks);
    }
    for (const chunk of await chunks) {
      if (
        Math.abs(chunk.chunkIndex - result.chunkIndex) !== 1 ||
        seen.has(chunk.id)
      ) {
        continue;
      }
      seen.add(chunk.id);
      additions.push({
        rankScore: candidate.rankScore / 2,
        result: {
          sourceType: "knowledge",
          libraryId: chunk.libraryId,
          libraryName: result.libraryName,
          documentId: chunk.documentId,
          sourcePath: chunk.sourcePath,
          title: chunk.title,
          tags: result.tags,
          chunkId: chunk.id,
          chunkIndex: chunk.chunkIndex,
          heading: chunk.heading,
          content: chunk.content,
          score: 0,
          signals: [{ signalType: "knowledge-graph", score: 0 }],
        },
      });
    }
  }
  return [...candidates, ...additions].sort(compareRankedCandidates);
}

function compareRankedCandidates(
  left: RankedCandidate,
  right: RankedCandidate
): number {
  return (
    right.rankScore - left.rankScore ||
    left.result.libraryId.localeCompare(right.result.libraryId) ||
    left.result.chunkId.localeCompare(right.result.chunkId)
  );
}

export async function searchKnowledgeForAgent(
  applicationContext: KnowledgeApplicationContext,
  request: KnowledgeToolSearchRequest
): Promise<KnowledgeToolSearchResponse> {
  const strategy = request.strategy ?? "auto";
  const topK = request.topK ?? 8;
  const maxChars = request.maxChars ?? 12000;
  const libraryIds = await authorizeKnowledgeLibraryScope(
    applicationContext,
    request.libraryIds
  );

  const traces: KnowledgeToolSearchResponse["traces"] = [];
  const ranked: RankedCandidate[] = [];
  for (const libraryId of libraryIds) {
    const execution = await searchKnowledgeDetailed({
      query: request.query,
      libraryIds: [libraryId],
      strategy,
      limit: Math.min(100, Math.max(topK * 2, topK)),
      minScore: 0,
    });
    traces.push(...execution.traces);
    execution.results
      .filter((result) => matchesFilters(result, request.filters))
      .forEach((result, index) => {
        ranked.push({ result, rankScore: 1 / (60 + index + 1) });
      });
  }

  const deduplicated = Array.from(
    new Map(
      ranked
        .sort(compareRankedCandidates)
        .map((candidate) => [candidate.result.chunkId, candidate])
    ).values()
  );
  const candidates = request.includeAdjacent
    ? await addAdjacentCandidates(deduplicated.slice(0, topK))
    : deduplicated;

  const hits: KnowledgeToolHit[] = [];
  let remaining = maxChars;
  let truncated = candidates.length > topK;
  for (const candidate of candidates.slice(0, topK)) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const content = candidate.result.content;
    const snippet = content.slice(0, remaining);
    if (snippet.length < content.length) truncated = true;
    hits.push(toHit(candidate, snippet));
    remaining -= snippet.length;
  }

  return {
    query: request.query,
    requestedStrategy: strategy,
    traces,
    hits,
    totalCandidates: candidates.length,
    truncated,
  };
}

export function parseKnowledgeToolReadRequest(
  args: Record<string, unknown>
): KnowledgeToolReadRequest {
  const libraryId =
    typeof args.libraryId === "string" ? args.libraryId.trim() : "";
  if (!libraryId) {
    throw new KnowledgeAccessError("INVALID_REQUEST", "libraryId 不能为空");
  }
  const optionalNumber = (value: unknown, label: string) =>
    value === undefined || value === ""
      ? undefined
      : parseInteger(value, 0, 0, Number.MAX_SAFE_INTEGER, label);
  const maxChars = parseInteger(args.maxChars, 0, 1, 50000, "maxChars");
  const request: KnowledgeToolReadRequest = {
    libraryId,
    chunkId:
      typeof args.chunkId === "string"
        ? args.chunkId.trim() || undefined
        : undefined,
    documentId:
      typeof args.documentId === "string"
        ? args.documentId.trim() || undefined
        : undefined,
    chunkIndex: optionalNumber(args.chunkIndex, "chunkIndex"),
    neighborCount:
      args.neighborCount === undefined
        ? 0
        : parseInteger(args.neighborCount, 0, 0, 3, "neighborCount"),
    heading:
      typeof args.heading === "string"
        ? args.heading.trim() || undefined
        : undefined,
    startOffset: optionalNumber(args.startOffset, "startOffset"),
    endOffset: optionalNumber(args.endOffset, "endOffset"),
    maxChars,
  };
  if (
    !request.chunkId &&
    (!request.documentId ||
      (request.chunkIndex === undefined &&
        !request.heading &&
        request.startOffset === undefined))
  ) {
    throw new KnowledgeAccessError(
      "READ_TARGET_REQUIRED",
      "read 必须指定 chunkId，或 documentId + chunkIndex/heading/字符范围"
    );
  }
  if (
    request.startOffset !== undefined &&
    request.endOffset !== undefined &&
    request.endOffset <= request.startOffset
  ) {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      "endOffset 必须大于 startOffset"
    );
  }
  return request;
}

function selectReadChunks(
  chunks: KnowledgeChunk[],
  request: KnowledgeToolReadRequest
): KnowledgeChunk[] {
  if (request.chunkId) {
    const chunk = chunks.find((item) => item.id === request.chunkId);
    if (!chunk) {
      throw new KnowledgeAccessError(
        "CHUNK_NOT_FOUND",
        `找不到 Knowledge chunk: ${request.chunkId}`,
        request.libraryId
      );
    }
    return [chunk];
  }
  if (!chunks.length) {
    throw new KnowledgeAccessError(
      "DOCUMENT_NOT_FOUND",
      `找不到 Knowledge document: ${request.documentId}`,
      request.libraryId
    );
  }
  if (request.chunkIndex !== undefined) {
    const radius = request.neighborCount ?? 0;
    const selected = chunks.filter(
      (chunk) => Math.abs(chunk.chunkIndex - request.chunkIndex!) <= radius
    );
    if (!selected.some((chunk) => chunk.chunkIndex === request.chunkIndex)) {
      throw new KnowledgeAccessError(
        "CHUNK_NOT_FOUND",
        `找不到 chunk index: ${request.chunkIndex}`,
        request.libraryId
      );
    }
    return selected;
  }
  if (request.heading) {
    const heading = request.heading.toLocaleLowerCase();
    return chunks.filter(
      (chunk) => chunk.heading?.toLocaleLowerCase() === heading
    );
  }
  const start = request.startOffset ?? 0;
  const end = request.endOffset ?? Number.MAX_SAFE_INTEGER;
  return chunks.filter(
    (chunk) => chunk.endOffset > start && chunk.startOffset < end
  );
}

export async function readKnowledgeForAgent(
  applicationContext: KnowledgeApplicationContext,
  request: KnowledgeToolReadRequest
): Promise<KnowledgeToolReadResponse> {
  if (!applicationContext.access.allowDocumentRead) {
    throw new KnowledgeAccessError(
      "DOCUMENT_READ_FORBIDDEN",
      "当前 Agent 未获授权继续读取 Knowledge 文档",
      request.libraryId
    );
  }
  await authorizeKnowledgeLibraryScope(applicationContext, [request.libraryId]);

  const chunks = await listKnowledgeChunks(
    request.libraryId,
    request.documentId
  );
  const selected = selectReadChunks(chunks, request).sort(
    (left, right) => left.chunkIndex - right.chunkIndex
  );
  if (!selected.length) {
    throw new KnowledgeAccessError(
      "CHUNK_NOT_FOUND",
      "指定范围没有可读取的 Knowledge chunk",
      request.libraryId
    );
  }

  let remaining = request.maxChars;
  let truncated = false;
  const output = [];
  for (const chunk of selected) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    let content = chunk.content;
    if (request.startOffset !== undefined || request.endOffset !== undefined) {
      const start = Math.max(
        0,
        (request.startOffset ?? chunk.startOffset) - chunk.startOffset
      );
      const end = Math.min(
        content.length,
        (request.endOffset ?? chunk.endOffset) - chunk.startOffset
      );
      content = content.slice(start, Math.max(start, end));
    }
    const limited = content.slice(0, remaining);
    if (limited.length < content.length) truncated = true;
    output.push({
      libraryId: chunk.libraryId,
      documentId: chunk.documentId,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      heading: chunk.heading,
      sourcePath: chunk.sourcePath,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      content: limited,
    });
    remaining -= limited.length;
  }

  const first = output[0];
  const last = output[output.length - 1];
  const allIndices = new Set(
    chunks
      .filter((chunk) => chunk.documentId === first.documentId)
      .map((chunk) => chunk.chunkIndex)
  );
  return {
    libraryId: first.libraryId,
    documentId: first.documentId,
    sourcePath: first.sourcePath,
    title: first.title,
    chunks: output,
    previousChunkIndex: allIndices.has(first.chunkIndex - 1)
      ? first.chunkIndex - 1
      : undefined,
    nextChunkIndex: allIndices.has(last.chunkIndex + 1)
      ? last.chunkIndex + 1
      : undefined,
    truncated,
  };
}
