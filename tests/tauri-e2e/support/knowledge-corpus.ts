// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import {
  KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT,
  KNOWLEDGE_CORPUS_DOCUMENT_DIR,
  KNOWLEDGE_CORPUS_MANIFEST_FILE,
  KNOWLEDGE_CORPUS_NOTICE_FILE,
  KNOWLEDGE_CORPUS_QRELS_FILE,
  KNOWLEDGE_CORPUS_QUERY_FILE,
  KNOWLEDGE_CORPUS_RELATIVE_DIR,
  KNOWLEDGE_CORPUS_SOURCE_DIR,
  knowledgeCorpusSlice,
  knowledgeCorpusSource,
  type KnowledgeCorpusSlice,
  type KnowledgeCorpusSource,
  type KnowledgeCorpusSourceFile,
} from "../fixtures/knowledge-corpus";

export const KNOWLEDGE_CORPUS_MANIFEST_SCHEMA_VERSION = 1;

export const KNOWLEDGE_CORPUS_ENV_DIR = "AIO_E2E_KNOWLEDGE_CORPUS";
export const KNOWLEDGE_CORPUS_ENV_REQUIRE = "AIO_E2E_REQUIRE_KNOWLEDGE_CORPUS";

/** 下载用的代理；未显式指定时沿用标准代理环境变量。 */
export const KNOWLEDGE_CORPUS_ENV_PROXY = "AIO_E2E_KNOWLEDGE_CORPUS_PROXY";

export function resolveKnowledgeCorpusProxy(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return (
    env[KNOWLEDGE_CORPUS_ENV_PROXY]?.trim() ||
    env.HTTPS_PROXY?.trim() ||
    env.https_proxy?.trim() ||
    env.HTTP_PROXY?.trim() ||
    env.http_proxy?.trim() ||
    undefined
  );
}

export interface KnowledgeCorpusManifestFile {
  path: string;
  sizeBytes: number;
  sha256: string;
  purpose: "source" | "document" | "query" | "qrels" | "notice";
}

export interface KnowledgeCorpusManifestCounts {
  documents: number;
  queries: number;
  qrelsPairs: number;
  distractors: number;
}

export interface KnowledgeCorpusManifest {
  schemaVersion: number;
  id: string;
  dataset: string;
  revision: string;
  license: string;
  homepage: string;
  attribution: string;
  endpoint: string;
  preparedAt: string;
  slice: KnowledgeCorpusSlice;
  counts: KnowledgeCorpusManifestCounts;
  files: KnowledgeCorpusManifestFile[];
  /** corpus id -> 派生产物相对路径。 */
  documents: Record<string, string>;
}

export interface KnowledgeCorpusQueryExpectation {
  id: string;
  query: string;
  /** 相关段落 corpus id，按稳定顺序；首个为 primary。 */
  relevantDocumentIds: string[];
  /** 检索命中断言的正文标记。 */
  marker: string;
  /**
   * 与产品 FTS5 `unicode61` 分词器兼容的关键词查询。
   *
   * unicode61 把中日韩文本按标点/空白切成整段 token，整句中文问题无法命中；
   * 这里从 primary 正文里选一个“整段且全语料唯一”的片段，保证 keyword 策略
   * 的命中是可断言的产品行为，而不是依赖分词巧合。
   */
  keywordQuery: string;
}

export interface KnowledgeCorpusDerived {
  queries: KnowledgeCorpusQueryExpectation[];
  documents: Map<string, string>;
  qrelsPairs: Array<{ queryId: string; corpusId: string; score: number }>;
  distractorIds: string[];
}

export function defaultKnowledgeCorpusDir(projectRoot: string): string {
  return path.resolve(projectRoot, ...KNOWLEDGE_CORPUS_RELATIVE_DIR);
}

export function resolveKnowledgeCorpusDir(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = env[KNOWLEDGE_CORPUS_ENV_DIR]?.trim();
  return explicit
    ? path.resolve(projectRoot, explicit)
    : defaultKnowledgeCorpusDir(projectRoot);
}

/** 清洗 T2Retrieval 正文里的 HTML 碎片为可检索的纯文本。 */
export function normalizePassageText(text: string): string {
  const withoutTags = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;/gi, "'");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function numericKey(id: string): bigint {
  const value = BigInt(id);
  if (value < 0n) throw new Error(`Unsupported corpus/query id: ${id}`);
  return value;
}

function compareNumeric(a: string, b: string): number {
  const diff = numericKey(a) - numericKey(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

interface NormalizedPassage {
  corpusId: string;
  text: string;
  chars: number;
}

interface SelectedQuery {
  id: string;
  query: string;
  relevantDocumentIds: string[];
  primaryText: string;
}

/**
 * 从 primary 段落里挑一个在全部入选文档中唯一的短片段，作为“检索命中了这篇”
 * 的断言标记。同一语料 + 同一参数必然得到同一标记。
 */
function uniqueMarker(
  primaryText: string,
  primaryId: string,
  documents: Map<string, string>,
  markerChars: number
): string {
  const others = [...documents.entries()]
    .filter(([id]) => id !== primaryId)
    .map(([, text]) => text);
  const step = Math.max(1, Math.floor(markerChars / 2));
  for (
    let start = 0;
    start + markerChars <= primaryText.length;
    start += step
  ) {
    const candidate = primaryText.slice(start, start + markerChars);
    if (!candidate.trim()) continue;
    if (others.some((text) => text.includes(candidate))) continue;
    return candidate;
  }
  throw new Error(
    `Knowledge corpus slice found no unique marker in document ${primaryId}; ` +
      "the upstream dataset or slice parameters changed."
  );
}

/**
 * 选一个与 FTS5 `unicode61` 兼容、且只在 primary 段落出现的整段 token。
 * keywordQuery 必须是产品仓库里 keyword_candidates 会按整段引用命中的片段。
 */
function keywordQueryFor(
  primaryText: string,
  primaryId: string,
  documents: Map<string, string>
): string {
  const others = [...documents.entries()]
    .filter(([id]) => id !== primaryId)
    .map(([, text]) => text);
  const runs = primaryText
    .split(/[\s,，.。;；:：!！?？、()（）"'“”‘’《》【】]+/)
    .map((run) => run.trim())
    .filter((run) => run.length >= 6 && run.length <= 40);
  for (const run of runs) {
    if (others.some((text) => text.includes(run))) continue;
    return run;
  }
  throw new Error(
    `Knowledge corpus slice found no keyword query in document ${primaryId}; ` +
      "the upstream dataset or slice parameters changed."
  );
}

/**
 * 纯函数切片：同一份语料 + 同一参数必然得到同一结果。
 * 参数不满足时抛错，作为“上游或切片参数需要人工复核”的确定性信号。
 */
export function selectKnowledgeCorpusSlice(
  corpusRows: Array<{ _id: string; text: string }>,
  queryRows: Array<{ _id: string; text: string }>,
  qrelsRows: Array<{ "query-id": string; "corpus-id": string; score: number }>,
  slice: KnowledgeCorpusSlice
): KnowledgeCorpusDerived {
  const passages = new Map<string, NormalizedPassage>();
  for (const row of corpusRows) {
    const corpusId = String(row._id);
    const normalized = normalizePassageText(row.text);
    if (!normalized) continue;
    passages.set(corpusId, {
      corpusId,
      text: normalized,
      chars: normalized.length,
    });
  }

  const qrelsByQuery = new Map<string, string[]>();
  for (const row of qrelsRows) {
    const queryId = String(row["query-id"]);
    const corpusId = String(row["corpus-id"]);
    const list = qrelsByQuery.get(queryId) ?? [];
    if (!list.includes(corpusId)) list.push(corpusId);
    qrelsByQuery.set(queryId, list);
  }
  for (const list of qrelsByQuery.values()) list.sort(compareNumeric);

  const queryById = new Map<string, string>();
  for (const row of queryRows) {
    const id = String(row._id);
    const text = String(row.text ?? "").trim();
    if (text) queryById.set(id, text);
  }

  const queryIds = [...qrelsByQuery.keys()].sort(compareNumeric);
  const selected: SelectedQuery[] = [];
  const usedDocumentIds = new Set<string>();

  for (const queryId of queryIds) {
    if (selected.length >= slice.queryCount) break;
    const query = queryById.get(queryId);
    if (!query) continue;

    const relevantAll = qrelsByQuery.get(queryId)!;
    if (relevantAll.length < slice.minRelevantPerQuery) continue;
    const relevant = relevantAll.slice(0, slice.relevantPerQuery);
    if (relevant.some((id) => usedDocumentIds.has(id))) continue;

    const inBand = relevant.map((id) => passages.get(id));
    if (
      inBand.some(
        (passage) =>
          !passage ||
          passage.chars < slice.minPassageChars ||
          passage.chars > slice.maxPassageChars
      )
    ) {
      continue;
    }

    const selectedDocs = inBand as Array<NormalizedPassage>;
    if (new Set(selectedDocs.map((p) => p.text)).size !== selectedDocs.length) {
      continue;
    }

    const dedupedRelevant = relevant.slice(0, inBand.length);
    selected.push({
      id: queryId,
      query,
      relevantDocumentIds: dedupedRelevant,
      primaryText: selectedDocs[0]!.text,
    });
    for (const id of dedupedRelevant) usedDocumentIds.add(id);
  }

  if (selected.length < slice.queryCount) {
    throw new Error(
      `Knowledge corpus slice produced ${selected.length}/${slice.queryCount} queries. ` +
        "The upstream dataset or slice parameters changed; review before continuing."
    );
  }

  const documents = new Map<string, string>();
  const relevantIds = new Set<string>();
  for (const item of selected) {
    for (const id of item.relevantDocumentIds) {
      relevantIds.add(id);
      documents.set(id, passages.get(id)!.text);
    }
  }

  const distractorIds: string[] = [];
  for (const corpusId of [...passages.keys()].sort(compareNumeric)) {
    if (distractorIds.length >= slice.distractorCount) break;
    if (relevantIds.has(corpusId)) continue;
    const passage = passages.get(corpusId)!;
    if (
      passage.chars < slice.minPassageChars ||
      passage.chars > slice.maxPassageChars
    ) {
      continue;
    }
    distractorIds.push(corpusId);
    documents.set(corpusId, passage.text);
  }
  if (distractorIds.length < slice.distractorCount) {
    throw new Error(
      `Knowledge corpus slice has ${distractorIds.length}/${slice.distractorCount} distractors.`
    );
  }

  const queries: KnowledgeCorpusQueryExpectation[] = selected.map((item) => {
    const primaryId = item.relevantDocumentIds[0];
    return {
      id: item.id,
      query: item.query,
      relevantDocumentIds: item.relevantDocumentIds,
      marker: uniqueMarker(
        item.primaryText,
        primaryId,
        documents,
        slice.markerChars
      ),
      keywordQuery: keywordQueryFor(item.primaryText, primaryId, documents),
    };
  });

  const qrelsPairs: Array<{
    queryId: string;
    corpusId: string;
    score: number;
  }> = [];
  for (const item of selected) {
    for (const corpusId of qrelsByQuery.get(item.id)!) {
      qrelsPairs.push({ queryId: item.id, corpusId, score: 1 });
    }
  }

  return { queries, documents, qrelsPairs, distractorIds };
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function writeFileAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

export interface KnowledgeCorpusVerification {
  ok: boolean;
  dir: string;
  problems: string[];
  manifest: KnowledgeCorpusManifest | null;
}

export function validateKnowledgeCorpusManifest(
  value: unknown
): KnowledgeCorpusManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Knowledge corpus manifest must be an object.");
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== KNOWLEDGE_CORPUS_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Knowledge corpus manifest schema: ${String(
        manifest.schemaVersion
      )}.`
    );
  }
  if (manifest.id !== knowledgeCorpusSource.id) {
    throw new Error(
      `Knowledge corpus manifest id mismatch: ${String(manifest.id)}.`
    );
  }
  if (manifest.revision !== knowledgeCorpusSource.revision) {
    throw new Error(
      `Knowledge corpus manifest revision mismatch: ${String(
        manifest.revision
      )}.`
    );
  }
  const files = manifest.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Knowledge corpus manifest has no file entries.");
  }
  for (const file of files) {
    const candidate = file as Record<string, unknown>;
    if (
      typeof candidate.path !== "string" ||
      typeof candidate.sha256 !== "string" ||
      typeof candidate.sizeBytes !== "number"
    ) {
      throw new Error("Knowledge corpus manifest has an invalid file entry.");
    }
  }
  return manifest as unknown as KnowledgeCorpusManifest;
}

export function readKnowledgeCorpusManifest(
  dir: string
): KnowledgeCorpusManifest | null {
  const manifestPath = path.join(dir, KNOWLEDGE_CORPUS_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return validateKnowledgeCorpusManifest(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown
    );
  } catch {
    return null;
  }
}

export async function verifyKnowledgeCorpus(
  dir: string
): Promise<KnowledgeCorpusVerification> {
  const problems: string[] = [];
  const manifest = readKnowledgeCorpusManifest(dir);

  if (!manifest) {
    return {
      ok: false,
      dir,
      problems: ["manifest missing or invalid"],
      manifest: null,
    };
  }

  const sourceByRole = new Map(
    knowledgeCorpusSource.files.map((file) => [file.role, file])
  );
  for (const role of ["corpus", "queries", "qrels"] as const) {
    const expected = sourceByRole.get(role)!;
    const target = path.join(
      dir,
      KNOWLEDGE_CORPUS_SOURCE_DIR,
      `${role}.parquet`
    );
    if (
      !fs.existsSync(target) ||
      fs.statSync(target).size !== expected.sizeBytes
    ) {
      problems.push(`source ${role}.parquet missing or wrong size`);
      continue;
    }
    if ((await sha256OfFile(target)) !== expected.sha256) {
      problems.push(`source ${role}.parquet sha256 mismatch`);
    }
  }

  for (const file of manifest.files) {
    const target = path.join(dir, file.path);
    if (!fs.existsSync(target) || fs.statSync(target).size !== file.sizeBytes) {
      problems.push(`derived ${file.path} missing or wrong size`);
      continue;
    }
    if ((await sha256OfFile(target)) !== file.sha256) {
      problems.push(`derived ${file.path} sha256 mismatch`);
    }
  }

  if (manifest.counts.documents <= 0 || manifest.counts.queries <= 0) {
    problems.push("manifest counts are empty");
  }

  return { ok: problems.length === 0, dir, problems, manifest };
}

export interface PrepareKnowledgeCorpusOptions {
  dir: string;
  endpoint?: string;
  /** 显式代理地址；省略时沿用 HTTPS_PROXY / HTTP_PROXY 等标准环境变量。 */
  proxy?: string;
  force?: boolean;
  /** 用于下载进度的可选回调（增量字节数）。 */
  onProgress?: (fileRole: string, receivedBytes: number) => void;
}

function sourceFileUrl(
  endpoint: string,
  file: KnowledgeCorpusSourceFile
): string {
  const dataset = knowledgeCorpusSource.dataset;
  const revision = knowledgeCorpusSource.revision;
  return `${endpoint.replace(/\/+$/, "")}/datasets/${dataset}/resolve/${revision}/${file.path}`;
}

async function downloadFile(
  url: string,
  targetPath: string,
  expectedBytes: number,
  expectedSha256: string,
  proxy: string | undefined,
  onProgress?: (receivedBytes: number) => void
): Promise<void> {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const response = await fetch(url, {
    redirect: "follow",
    ...(proxy ? { proxy } : {}),
  });
  if (!response.ok) {
    throw new Error(
      `Download failed for ${url}: HTTP ${response.status}. ` +
        "Set a proxy (--proxy or HTTPS_PROXY) or use --endpoint with a reachable mirror."
    );
  }
  if (!response.body) {
    throw new Error(`Download response has no body: ${url}`);
  }

  const hash = createHash("sha256");
  let received = 0;
  const writeStream = fs.createWriteStream(targetPath);
  await new Promise<void>((resolve, reject) => {
    const reader = Readable.fromWeb(
      response.body as import("node:stream/web").ReadableStream
    );
    reader.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      onProgress?.(received);
    });
    writeStream.on("error", reject);
    reader.on("error", reject);
    writeStream.on("finish", resolve);
    reader.pipe(writeStream);
  });

  if (received !== expectedBytes) {
    throw new Error(
      `Download size mismatch for ${url}: got ${received}, expected ${expectedBytes}.`
    );
  }
  const digest = hash.digest("hex");
  if (digest !== expectedSha256) {
    throw new Error(
      `Download sha256 mismatch for ${url}: got ${digest}, expected ${expectedSha256}.`
    );
  }
}

function buildNotice(source: KnowledgeCorpusSource): string {
  return [
    `# ${source.id}`,
    "",
    `- Dataset: ${source.dataset} (revision \`${source.revision}\`)`,
    `- License: ${source.license}`,
    `- Homepage: ${source.homepage}`,
    "",
    "## Attribution",
    "",
    source.attribution,
    "",
    "This directory is a derived test fixture generated by the AIO Hub E2E",
    "prepare script. It is cached outside version control and must not be",
    "uploaded as a CI artifact.",
    "",
  ].join("\n");
}

function toManifestPath(dir: string, target: string): string {
  return path.relative(dir, target).replace(/\\/g, "/");
}

function buildManifest(
  dir: string,
  options: PrepareKnowledgeCorpusOptions,
  derived: KnowledgeCorpusDerived,
  documentEntries: Array<{
    corpusId: string;
    filePath: string;
    sizeBytes: number;
    sha256: string;
  }>
): KnowledgeCorpusManifest {
  const files: KnowledgeCorpusManifestFile[] = [
    ...knowledgeCorpusSource.files.map((file) => ({
      path: toManifestPath(
        dir,
        path.join(dir, KNOWLEDGE_CORPUS_SOURCE_DIR, `${file.role}.parquet`)
      ),
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      purpose: "source" as const,
    })),
    ...documentEntries.map((entry) => ({
      path: toManifestPath(dir, entry.filePath),
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256,
      purpose: "document" as const,
    })),
    {
      path: KNOWLEDGE_CORPUS_QUERY_FILE,
      sizeBytes: fs.statSync(path.join(dir, KNOWLEDGE_CORPUS_QUERY_FILE)).size,
      sha256: "", // filled below
      purpose: "query" as const,
    },
    {
      path: KNOWLEDGE_CORPUS_QRELS_FILE,
      sizeBytes: fs.statSync(path.join(dir, KNOWLEDGE_CORPUS_QRELS_FILE)).size,
      sha256: "",
      purpose: "qrels" as const,
    },
  ];

  const documents: Record<string, string> = {};
  for (const entry of documentEntries) {
    documents[entry.corpusId] = toManifestPath(dir, entry.filePath);
  }

  return {
    schemaVersion: KNOWLEDGE_CORPUS_MANIFEST_SCHEMA_VERSION,
    id: knowledgeCorpusSource.id,
    dataset: knowledgeCorpusSource.dataset,
    revision: knowledgeCorpusSource.revision,
    license: knowledgeCorpusSource.license,
    homepage: knowledgeCorpusSource.homepage,
    attribution: knowledgeCorpusSource.attribution,
    endpoint: options.endpoint ?? KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT,
    preparedAt: new Date().toISOString(),
    slice: { ...knowledgeCorpusSlice },
    counts: {
      documents: derived.documents.size,
      queries: derived.queries.length,
      qrelsPairs: derived.qrelsPairs.length,
      distractors: derived.distractorIds.length,
    },
    files,
    documents,
  };
}

export interface PreparedKnowledgeCorpus {
  dir: string;
  manifest: KnowledgeCorpusManifest;
  derived: KnowledgeCorpusDerived;
}

export async function prepareKnowledgeCorpus(
  options: PrepareKnowledgeCorpusOptions
): Promise<PreparedKnowledgeCorpus> {
  const { dir } = options;
  const endpoint =
    options.endpoint?.trim() || KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT;

  const existing = readKnowledgeCorpusManifest(dir);
  if (existing && !options.force) {
    const verification = await verifyKnowledgeCorpus(dir);
    if (verification.ok) {
      const derived = readDerivedKnowledgeCorpus(dir, existing);
      return { dir, manifest: existing, derived };
    }
  }

  const sourceDir = path.join(dir, KNOWLEDGE_CORPUS_SOURCE_DIR);
  fs.mkdirSync(sourceDir, { recursive: true });

  const proxy = options.proxy ?? resolveKnowledgeCorpusProxy(process.env);
  for (const file of knowledgeCorpusSource.files) {
    const targetPath = path.join(sourceDir, `${file.role}.parquet`);
    const url = sourceFileUrl(endpoint, file);
    try {
      await downloadFile(
        url,
        targetPath,
        file.sizeBytes,
        file.sha256,
        proxy,
        (received) => options.onProgress?.(file.role, received)
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
          `Source: ${url}\nProxy: ${proxy ?? "(none)"}`
      );
    }
  }

  const corpus = (await parquetReadObjects({
    file: await asyncBufferFromFile(path.join(sourceDir, "corpus.parquet")),
  })) as unknown as Array<{ _id: string; text: string; title: string }>;
  const queries = (await parquetReadObjects({
    file: await asyncBufferFromFile(path.join(sourceDir, "queries.parquet")),
  })) as unknown as Array<{ _id: string; text: string }>;
  const qrels = (await parquetReadObjects({
    file: await asyncBufferFromFile(path.join(sourceDir, "qrels.parquet")),
  })) as unknown as Array<{
    "query-id": string;
    "corpus-id": string;
    score: number;
  }>;

  const derived = selectKnowledgeCorpusSlice(corpus, queries, qrels, {
    ...knowledgeCorpusSlice,
  });

  const documentDir = path.join(dir, KNOWLEDGE_CORPUS_DOCUMENT_DIR);
  fs.mkdirSync(documentDir, { recursive: true });
  const documentEntries: Array<{
    corpusId: string;
    filePath: string;
    sizeBytes: number;
    sha256: string;
  }> = [];
  for (const [corpusId, text] of derived.documents) {
    const filePath = path.join(documentDir, `${corpusId}.md`);
    writeFileAtomic(filePath, `${text}\n`);
    documentEntries.push({
      corpusId,
      filePath,
      sizeBytes: fs.statSync(filePath).size,
      sha256: await sha256OfFile(filePath),
    });
  }

  const queryLines = derived.queries
    .map((item) => JSON.stringify(item))
    .join("\n");
  writeFileAtomic(
    path.join(dir, KNOWLEDGE_CORPUS_QUERY_FILE),
    `${queryLines}\n`
  );
  writeFileAtomic(
    path.join(dir, KNOWLEDGE_CORPUS_QRELS_FILE),
    derived.qrelsPairs
      .map((pair) => `${pair.queryId}\t${pair.corpusId}\t${pair.score}`)
      .join("\n") + "\n"
  );
  writeFileAtomic(
    path.join(dir, KNOWLEDGE_CORPUS_NOTICE_FILE),
    buildNotice(knowledgeCorpusSource)
  );

  const manifest = buildManifest(dir, options, derived, documentEntries);
  const queryFilePath = path.join(dir, KNOWLEDGE_CORPUS_QUERY_FILE);
  const qrelsFilePath = path.join(dir, KNOWLEDGE_CORPUS_QRELS_FILE);
  for (const file of manifest.files) {
    if (file.path === KNOWLEDGE_CORPUS_QUERY_FILE) {
      file.sizeBytes = fs.statSync(queryFilePath).size;
      file.sha256 = await sha256OfFile(queryFilePath);
    }
    if (file.path === KNOWLEDGE_CORPUS_QRELS_FILE) {
      file.sizeBytes = fs.statSync(qrelsFilePath).size;
      file.sha256 = await sha256OfFile(qrelsFilePath);
    }
  }

  writeFileAtomic(
    path.join(dir, KNOWLEDGE_CORPUS_MANIFEST_FILE),
    JSON.stringify(manifest, null, 2)
  );

  return { dir, manifest, derived };
}

export function readDerivedKnowledgeCorpus(
  dir: string,
  manifest: KnowledgeCorpusManifest
): KnowledgeCorpusDerived {
  const queryLines = fs
    .readFileSync(path.join(dir, KNOWLEDGE_CORPUS_QUERY_FILE), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const queries = queryLines.map(
    (line) => JSON.parse(line) as KnowledgeCorpusQueryExpectation
  );
  const documents = new Map<string, string>();
  for (const [corpusId, relativePath] of Object.entries(manifest.documents)) {
    documents.set(
      corpusId,
      fs.readFileSync(path.join(dir, relativePath), "utf8")
    );
  }
  const qrelsPairs = fs
    .readFileSync(path.join(dir, KNOWLEDGE_CORPUS_QRELS_FILE), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [queryId, corpusId, score] = line.split("\t");
      return {
        queryId,
        corpusId,
        score: Number(score),
      };
    });
  const distractorIds = Object.entries(manifest.documents)
    .filter(
      ([corpusId]) =>
        !queries.some((query) => query.relevantDocumentIds.includes(corpusId))
    )
    .map(([corpusId]) => corpusId);
  return { queries, documents, qrelsPairs, distractorIds };
}

export async function resolvePreparedKnowledgeCorpus(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PreparedKnowledgeCorpus | null> {
  const dir = resolveKnowledgeCorpusDir(projectRoot, env);
  const manifest = readKnowledgeCorpusManifest(dir);
  if (!manifest) return null;
  const verification = await verifyKnowledgeCorpus(dir);
  if (!verification.ok) return null;
  return { dir, manifest, derived: readDerivedKnowledgeCorpus(dir, manifest) };
}
