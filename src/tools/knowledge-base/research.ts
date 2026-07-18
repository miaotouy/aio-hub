import {
  authorizeKnowledgeLibraryScope,
  readKnowledgeForAgent,
  searchKnowledgeForAgent,
  type KnowledgeApplicationContext,
} from "./application";
import { KnowledgeAccessError } from "./access";
import type {
  KnowledgeToolHit,
  KnowledgeToolReadResponse,
  KnowledgeToolSearchResponse,
} from "./types";

export type KnowledgeResearchOutput = "brief" | "report" | "comparison";
export type KnowledgeResearchStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface KnowledgeResearchRequest {
  question: string;
  libraryIds?: string[];
  maxRounds?: number;
  maxToolCalls?: number;
  evidenceBudget?: number;
  timeoutMs?: number;
  output?: KnowledgeResearchOutput;
}

export interface KnowledgeResearchQuery {
  query: string;
  round: number;
  reason: "initial" | "gap" | "conflict";
}

export interface KnowledgeResearchCitation {
  libraryId: string;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  title: string;
  sourcePath: string;
  excerpt: string;
}

export interface KnowledgeResearchResult {
  question: string;
  output: KnowledgeResearchOutput;
  conclusion: string;
  citations: KnowledgeResearchCitation[];
  queries: KnowledgeResearchQuery[];
  libraries: string[];
  conflicts: string[];
  gaps: string[];
  uncertainties: string[];
  rounds: number;
  toolCalls: number;
  evidenceChars: number;
  durationMs: number;
  terminationReason: "completed" | "budget" | "timeout" | "cancelled" | "failed";
  failureStage?: KnowledgeResearchProgress["phase"];
}

export interface KnowledgeResearchProgress {
  taskId?: string;
  status: KnowledgeResearchStatus;
  phase: "planning" | "search" | "read" | "synthesis" | "done";
  round: number;
  maxRounds: number;
  toolCalls: number;
  evidenceChars: number;
  message: string;
}

export interface KnowledgeResearchTask {
  id: string;
  status: KnowledgeResearchStatus;
  request: KnowledgeResearchRequest;
  progress: KnowledgeResearchProgress;
  result?: KnowledgeResearchResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeResearchTaskHandle {
  task: Promise<KnowledgeResearchTask>;
  cancel: () => void;
}

const MAX_QUERY_LENGTH = 500;
const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_MAX_TOOL_CALLS = 12;
const DEFAULT_EVIDENCE_BUDGET = 24000;
const DEFAULT_TIMEOUT_MS = 120000;

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string
): number {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      `${label} 必须在 ${min} 到 ${max} 之间`
    );
  }
  return Math.trunc(parsed);
}

export function parseKnowledgeResearchRequest(
  value: Record<string, unknown>
): KnowledgeResearchRequest {
  const question = typeof value.question === "string" ? value.question.trim() : "";
  if (!question) {
    throw new KnowledgeAccessError("QUERY_REQUIRED", "研究问题不能为空");
  }
  if (question.length > MAX_QUERY_LENGTH) {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      `研究问题不能超过 ${MAX_QUERY_LENGTH} 个字符`
    );
  }
  const libraryIds = value.libraryIds;
  let parsedLibraries: string[] | undefined;
  if (Array.isArray(libraryIds)) {
    parsedLibraries = Array.from(
      new Set(
        libraryIds.filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }
  const output = value.output === undefined ? "report" : value.output;
  if (output !== "brief" && output !== "report" && output !== "comparison") {
    throw new KnowledgeAccessError("INVALID_REQUEST", "研究输出形态无效");
  }
  return {
    question,
    libraryIds: parsedLibraries,
    maxRounds: boundedInteger(value.maxRounds, DEFAULT_MAX_ROUNDS, 1, 8, "maxRounds"),
    maxToolCalls: boundedInteger(
      value.maxToolCalls,
      DEFAULT_MAX_TOOL_CALLS,
      1,
      40,
      "maxToolCalls"
    ),
    evidenceBudget: boundedInteger(
      value.evidenceBudget,
      DEFAULT_EVIDENCE_BUDGET,
      1000,
      100000,
      "evidenceBudget"
    ),
    timeoutMs: boundedInteger(
      value.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      5000,
      600000,
      "timeoutMs"
    ),
    output,
  };
}

function splitResearchQueries(question: string): string[] {
  const parts = question
    .split(/[，。；;!?！？\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
  return Array.from(new Set([question, ...parts])).slice(0, 4);
}

function toCitation(hit: KnowledgeToolHit, excerpt: string): KnowledgeResearchCitation {
  return {
    libraryId: hit.libraryId,
    documentId: hit.documentId,
    chunkId: hit.chunkId,
    chunkIndex: hit.chunkIndex,
    title: hit.title,
    sourcePath: hit.sourcePath,
    excerpt,
  };
}

function contradicts(left: string, right: string): boolean {
  const negative = /(不|未|无|禁止|不得|否认)/;
  const normalize = (value: string) =>
    value
      .replace(/(不|未|无|禁止|不得|否认)/g, "")
      .replace(/[\s，。；;!?！？]/g, "")
      .toLocaleLowerCase();
  return (
    negative.test(left) !== negative.test(right) &&
    normalize(left) === normalize(right)
  );
}

function formatConclusion(
  question: string,
  citations: KnowledgeResearchCitation[],
  output: KnowledgeResearchOutput,
  gaps: string[],
  conflicts: string[]
): string {
  const heading = output === "brief" ? "证据摘要" : output === "comparison" ? "对比证据摘要" : "研究证据摘要";
  const terms = Array.from(
    new Set(question.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])
  );
  const ranked = citations
    .map((citation, index) => ({
      citation,
      index,
      overlap: terms.filter((term) => citation.excerpt.toLocaleLowerCase().includes(term)).length,
    }))
    .sort((left, right) => right.overlap - left.overlap || left.index - right.index)
    .map(({ citation }) => citation);
  const lines = ranked.slice(0, output === "brief" ? 5 : 12).map(
    (citation, index) => `${index + 1}. ${citation.excerpt.replace(/\s+/g, " ").trim()}`
  );
  const notes = [
    gaps.length ? `证据空缺：${gaps.join("；")}` : "证据空缺：未发现明确空缺",
    conflicts.length ? `潜在冲突：${conflicts.join("；")}` : "潜在冲突：未发现相互矛盾的命中",
  ];
  return [`问题：${question}`, heading, ...(lines.length ? lines : ["未找到可用证据"]), ...notes].join("\n");
}

export async function runKnowledgeResearch(
  context: KnowledgeApplicationContext,
  request: KnowledgeResearchRequest,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: KnowledgeResearchProgress) => void;
    taskId?: string;
  } = {}
): Promise<KnowledgeResearchResult> {
  const startedAt = Date.now();
  const maxRounds = request.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxToolCalls = request.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const evidenceBudget = request.evidenceBudget ?? DEFAULT_EVIDENCE_BUDGET;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const output = request.output ?? "report";
  let activePhase: KnowledgeResearchProgress["phase"] = "planning";
  const withinBudget = <T>(operation: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
      const timer = setTimeout(
        () => reject(new DOMException("研究超时", "TimeoutError")),
        remaining
      );
      const abort = () => reject(new DOMException("研究已取消", "AbortError"));
      options.signal?.addEventListener("abort", abort, { once: true });
      operation.then(resolve, reject).finally(() => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      });
    });
  let libraries: string[] = [];
  const queries: KnowledgeResearchQuery[] = splitResearchQueries(request.question).map(
    (query, index) => ({ query, round: index === 0 ? 1 : 2, reason: index === 0 ? "initial" : "gap" })
  );
  const citations: KnowledgeResearchCitation[] = [];
  const conflicts: string[] = [];
  const gaps: string[] = [];
  let toolCalls = 0;
  let evidenceChars = 0;
  let rounds = 0;
  let forcedTermination: "timeout" | "cancelled" | "failed" | undefined;
  let failureStage: KnowledgeResearchProgress["phase"] | undefined;
  const seenChunks = new Set<string>();
  const excerptsByTitle = new Map<string, string>();

  const emit = (progress: Omit<KnowledgeResearchProgress, "taskId">) =>
    options.onProgress?.({ ...progress, taskId: options.taskId });
  const ensureBudget = () => {
    if (options.signal?.aborted) throw new DOMException("研究已取消", "AbortError");
    if (Date.now() - startedAt > timeoutMs) throw new DOMException("研究超时", "TimeoutError");
    if (toolCalls >= maxToolCalls || evidenceChars >= evidenceBudget) return false;
    return true;
  };

  emit({ status: "running", phase: "planning", round: 0, maxRounds, toolCalls, evidenceChars, message: "正在拆分研究问题" });
  try {
    libraries = await withinBudget(
      authorizeKnowledgeLibraryScope(context, request.libraryIds)
    );
    for (const planned of queries) {
      if (rounds >= maxRounds || !ensureBudget()) break;
      rounds = Math.max(rounds, planned.round);
      activePhase = "search";
      emit({ status: "running", phase: "search", round: rounds, maxRounds, toolCalls, evidenceChars, message: `正在检索：${planned.query}` });
      const search: KnowledgeToolSearchResponse = await withinBudget(
        searchKnowledgeForAgent(context, {
          query: planned.query,
          libraryIds: libraries,
          strategy: "auto",
          topK: Math.min(8, Math.max(2, maxToolCalls - toolCalls)),
          includeAdjacent: true,
          maxChars: Math.min(12000, evidenceBudget - evidenceChars),
        })
      );
      toolCalls += 1;
      if (!search.hits.length && queries.length < maxRounds) {
        queries.push({
          query: `${planned.query} 相关依据与例外`,
          round: Math.min(maxRounds, rounds + 1),
          reason: "gap",
        });
      }
      for (const hit of search.hits) {
        if (!ensureBudget() || seenChunks.has(hit.chunkId)) continue;
        seenChunks.add(hit.chunkId);
        const remaining = evidenceBudget - evidenceChars;
        const excerpt = hit.snippet.slice(0, remaining);
        if (!excerpt) break;
        evidenceChars += excerpt.length;
        const previous = excerptsByTitle.get(hit.title);
        if (previous && contradicts(previous, excerpt)) {
          conflicts.push(`《${hit.title}》存在互相否定的证据片段`);
          if (queries.length < maxRounds) {
            queries.push({
              query: `${hit.title} 冲突来源与适用条件`,
              round: Math.min(maxRounds, rounds + 1),
              reason: "conflict",
            });
          }
        }
        excerptsByTitle.set(hit.title, excerpt);
        citations.push(toCitation(hit, excerpt));
        if (toolCalls >= maxToolCalls || evidenceChars >= evidenceBudget) break;
        activePhase = "read";
        emit({ status: "running", phase: "read", round: rounds, maxRounds, toolCalls, evidenceChars, message: `正在读取：${hit.title}` });
        try {
          const read: KnowledgeToolReadResponse = await withinBudget(
            readKnowledgeForAgent(context, {
              libraryId: hit.libraryId,
              chunkId: hit.chunkId,
              maxChars: Math.min(4000, evidenceBudget - evidenceChars),
            })
          );
          toolCalls += 1;
          const readText = read.chunks.map((chunk) => chunk.content).join("\n");
          const readExcerpt = readText.slice(0, evidenceBudget - evidenceChars);
          if (readExcerpt && readExcerpt !== excerpt) {
            evidenceChars += readExcerpt.length;
            citations[citations.length - 1].excerpt = readExcerpt;
          }
        } catch (error) {
          if (options.signal?.aborted) throw error;
          gaps.push(`无法继续读取《${hit.title}》`);
        }
      }
    }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      forcedTermination = "cancelled";
    } else if (error instanceof DOMException && error.name === "TimeoutError") {
      forcedTermination = "timeout";
    } else if (error instanceof KnowledgeAccessError) {
      throw error;
    } else {
      forcedTermination = "failed";
      failureStage = activePhase;
      gaps.push(
        `${activePhase} 阶段失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (!citations.length) gaps.push("没有检索到可引用的资料片段");
  const terminationReason = forcedTermination ?? (Date.now() - startedAt > timeoutMs
      ? "timeout"
      : toolCalls >= maxToolCalls || evidenceChars >= evidenceBudget
        ? "budget"
        : "completed");
  activePhase = "synthesis";
  emit({ status: "running", phase: "synthesis", round: rounds, maxRounds, toolCalls, evidenceChars, message: "正在整理证据与限制说明" });
  const result: KnowledgeResearchResult = {
    question: request.question,
    output,
    conclusion: formatConclusion(request.question, citations, output, gaps, conflicts),
    citations,
    queries,
    libraries,
    conflicts,
    gaps,
    uncertainties: terminationReason === "completed" ? [] : ["研究受预算、时间或取消信号限制，结论不代表资料全集"],
    rounds,
    toolCalls,
    evidenceChars,
    durationMs: Date.now() - startedAt,
    terminationReason,
    ...(failureStage ? { failureStage } : {}),
  };
  emit({ status: terminationReason === "cancelled" ? "cancelled" : terminationReason === "failed" ? "failed" : "completed", phase: "done", round: rounds, maxRounds, toolCalls, evidenceChars, message: terminationReason === "completed" ? "研究完成" : `研究结束：${terminationReason}` });
  return result;
}

export function createKnowledgeResearchTask(
  context: KnowledgeApplicationContext,
  request: KnowledgeResearchRequest,
  onProgress?: (progress: KnowledgeResearchProgress) => void
): KnowledgeResearchTaskHandle {
  const controller = new AbortController();
  const id = `knowledge-research-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  const task: KnowledgeResearchTask = {
    id,
    status: "queued",
    request,
    progress: {
      taskId: id,
      status: "queued",
      phase: "planning",
      round: 0,
      maxRounds: request.maxRounds ?? DEFAULT_MAX_ROUNDS,
      toolCalls: 0,
      evidenceChars: 0,
      message: "研究任务已排队",
    },
    createdAt,
    updatedAt: createdAt,
  };
  const taskPromise = (async () => {
    task.status = "running";
    task.updatedAt = Date.now();
    try {
      const result = await runKnowledgeResearch(context, request, {
        signal: controller.signal,
        taskId: id,
        onProgress: (progress) => {
          task.progress = progress;
          task.updatedAt = Date.now();
          onProgress?.(progress);
        },
      });
      task.status = result.terminationReason === "cancelled"
        ? "cancelled"
        : result.terminationReason === "failed"
          ? "failed"
          : "completed";
      task.result = result;
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        task.status = "cancelled";
        task.error = "研究已取消";
      } else {
        task.status = "failed";
        task.error = error instanceof Error ? error.message : String(error);
      }
    }
    task.updatedAt = Date.now();
    return task;
  })();
  return { task: taskPromise, cancel: () => controller.abort() };
}
