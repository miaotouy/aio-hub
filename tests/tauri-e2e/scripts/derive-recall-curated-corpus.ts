import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  RECALL_CURATED_CORPUS_FORBIDDEN_TERMS,
  recallCuratedCorpus,
} from "../fixtures/recall-curated-corpus";
import type {
  RecallCuratedCorpus,
  RecallCuratedEntry,
  RecallCuratedTopic,
} from "../fixtures/recall-curated-corpus";

const ZIP_ENTRY_ALLOWLIST = ["library.json", "manifest.json"] as const;
const REQUIRED_TOPICS: RecallCuratedTopic[] = [
  "renderer-v2",
  "tool-structure",
  "memory-ownership",
  "base64-image",
];

interface SourceEntry {
  id: string;
  content: string;
  contentHash?: string;
}

export interface CuratedCorpusReviewEntry {
  id: string;
  sourceEntryId: string;
  title: string;
  topic: RecallCuratedTopic;
  role: RecallCuratedEntry["role"];
  sourceContentHash: string;
  contentHash: string;
  contentLength: number;
}

export interface CuratedCorpusReview {
  mode: "review";
  schemaVersion: number;
  archiveSha256: string;
  sourceEntryCount: number;
  selectedEntryCount: number;
  maxContentChars: number;
  topics: Record<string, number>;
  entries: CuratedCorpusReviewEntry[];
  wroteCandidate: boolean;
}

export interface DeriveRecallCuratedCorpusOptions {
  sourcePath: string;
  writePath?: string;
  corpus?: RecallCuratedCorpus;
}

export interface DeriveRecallCuratedCorpusCliOptions {
  sourcePath: string;
  writePath?: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function hasAbsolutePath(value: string): boolean {
  return (
    /[a-zA-Z]:[\\/]/.test(value) ||
    /(^|[^\\])\\\\[^\\]/.test(value) ||
    /\/(?:Users|home|root|tmp|var|opt|mnt|Volumes)\//i.test(value) ||
    /file:\/\//i.test(value)
  );
}

export function validateRecallCuratedCorpus(
  corpus: RecallCuratedCorpus = recallCuratedCorpus
): void {
  if (corpus.schemaVersion !== 1) {
    throw new Error("Unsupported curated corpus schema version.");
  }
  if (corpus.entries.length < 10 || corpus.entries.length > 16) {
    throw new Error("Curated corpus must contain between 10 and 16 entries.");
  }
  if (!Number.isInteger(corpus.maxContentChars) || corpus.maxContentChars < 1) {
    throw new Error("Curated corpus maximum content length is invalid.");
  }

  const entryIds = new Set<string>();
  const sourceEntryIds = new Set<string>();
  const topicCounts = new Map<RecallCuratedTopic, number>();
  const titleGroups = new Map<string, Set<string>>();
  let hardNegativeCount = 0;

  for (const entry of corpus.entries) {
    if (entryIds.has(entry.id)) {
      throw new Error(`Duplicate curated entry ID: ${entry.id}`);
    }
    if (sourceEntryIds.has(entry.sourceEntryId)) {
      throw new Error(`Duplicate source entry ID: ${entry.sourceEntryId}`);
    }
    entryIds.add(entry.id);
    sourceEntryIds.add(entry.sourceEntryId);

    if (entry.content.length > corpus.maxContentChars) {
      throw new Error(`Curated entry exceeds maximum length: ${entry.id}`);
    }
    if (entry.content.length === 0 || entry.title.trim().length === 0) {
      throw new Error(`Curated entry has empty title or content: ${entry.id}`);
    }
    if (sha256(entry.content) !== entry.contentHash) {
      throw new Error(`Curated content hash mismatch: ${entry.id}`);
    }

    const searchable = [entry.title, entry.content, ...entry.tags].join("\n");
    const forbidden = RECALL_CURATED_CORPUS_FORBIDDEN_TERMS.find((term) =>
      searchable.toLocaleLowerCase().includes(term.toLocaleLowerCase())
    );
    if (forbidden) {
      throw new Error(`Curated entry contains a forbidden term: ${entry.id}`);
    }
    if (hasAbsolutePath(searchable)) {
      throw new Error(`Curated entry contains an absolute path: ${entry.id}`);
    }

    topicCounts.set(entry.topic, (topicCounts.get(entry.topic) ?? 0) + 1);
    if (entry.role === "hard-negative") hardNegativeCount += 1;
    const contentHashes = titleGroups.get(entry.title) ?? new Set<string>();
    contentHashes.add(entry.contentHash);
    titleGroups.set(entry.title, contentHashes);
  }

  for (const topic of REQUIRED_TOPICS) {
    if (!topicCounts.has(topic)) {
      throw new Error(`Curated corpus is missing required topic: ${topic}`);
    }
  }
  if (hardNegativeCount < 2) {
    throw new Error("Curated corpus requires at least two hard negatives.");
  }
  if (![...titleGroups.values()].some((hashes) => hashes.size >= 2)) {
    throw new Error(
      "Curated corpus requires duplicate titles with different content hashes."
    );
  }
}

async function readZipJson(
  zip: JSZip,
  fileName: (typeof ZIP_ENTRY_ALLOWLIST)[number]
): Promise<unknown> {
  const file = zip.file(fileName);
  if (!file) throw new Error(`Recall backup is missing ${fileName}.`);
  return parseJson(await file.async("string"), fileName);
}

function readSourceEntries(library: unknown): SourceEntry[] {
  if (!isRecord(library) || !Array.isArray(library.entries)) {
    throw new Error("library.json does not contain an entries array.");
  }
  return library.entries.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.content !== "string"
    ) {
      throw new Error("library.json contains an invalid entry.");
    }
    return {
      id: value.id,
      content: value.content,
      contentHash:
        typeof value.contentHash === "string" ? value.contentHash : undefined,
    };
  });
}

export async function auditRecallCuratedCorpusArchive(
  archive: Uint8Array,
  corpus: RecallCuratedCorpus = recallCuratedCorpus
): Promise<CuratedCorpusReview> {
  validateRecallCuratedCorpus(corpus);

  const archiveSha256 = sha256(archive);
  if (archiveSha256 !== corpus.source.archiveSha256) {
    throw new Error(
      "Recall backup archive hash changed; explicit fixture review is required."
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    throw new Error("Recall backup is not a valid ZIP archive.");
  }
  const zipEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .sort();
  if (
    zipEntries.length !== ZIP_ENTRY_ALLOWLIST.length ||
    !ZIP_ENTRY_ALLOWLIST.every((entry) => zipEntries.includes(entry))
  ) {
    throw new Error("Recall backup ZIP entries do not match the allowlist.");
  }

  const manifest = await readZipJson(zip, "manifest.json");
  const library = await readZipJson(zip, "library.json");
  if (
    !isRecord(manifest) ||
    manifest.format !== corpus.source.format ||
    manifest.formatVersion !== corpus.source.formatVersion ||
    manifest.entryCount !== corpus.source.expectedEntryCount
  ) {
    throw new Error(
      "Recall backup manifest does not match the curated source."
    );
  }
  if (
    !Array.isArray(manifest.files) ||
    !manifest.files.some(
      (value) => isRecord(value) && value.path === "library.json"
    )
  ) {
    throw new Error("Recall backup manifest does not index library.json.");
  }

  const sourceEntries = readSourceEntries(library);
  if (sourceEntries.length !== corpus.source.expectedEntryCount) {
    throw new Error("Recall backup source entry count changed.");
  }
  const sourceById = new Map<string, SourceEntry>();
  for (const entry of sourceEntries) {
    if (sourceById.has(entry.id)) {
      throw new Error("Recall backup contains duplicate source entry IDs.");
    }
    sourceById.set(entry.id, entry);
  }

  for (const entry of corpus.entries) {
    const source = sourceById.get(entry.sourceEntryId);
    if (!source) {
      throw new Error(
        `Allowlisted source entry is missing: ${entry.sourceEntryId}`
      );
    }
    const sourceContentHash = sha256(source.content);
    if (
      sourceContentHash !== entry.sourceContentHash ||
      (source.contentHash !== undefined &&
        source.contentHash !== entry.sourceContentHash)
    ) {
      throw new Error(
        `Allowlisted source content changed: ${entry.sourceEntryId}`
      );
    }
  }

  const topics: Record<string, number> = {};
  for (const entry of corpus.entries) {
    topics[entry.topic] = (topics[entry.topic] ?? 0) + 1;
  }
  return {
    mode: "review",
    schemaVersion: corpus.schemaVersion,
    archiveSha256,
    sourceEntryCount: sourceEntries.length,
    selectedEntryCount: corpus.entries.length,
    maxContentChars: corpus.maxContentChars,
    topics,
    entries: corpus.entries.map((entry) => ({
      id: entry.id,
      sourceEntryId: entry.sourceEntryId,
      title: entry.title,
      topic: entry.topic,
      role: entry.role,
      sourceContentHash: entry.sourceContentHash,
      contentHash: entry.contentHash,
      contentLength: entry.content.length,
    })),
    wroteCandidate: false,
  };
}

export async function deriveRecallCuratedCorpus(
  options: DeriveRecallCuratedCorpusOptions
): Promise<CuratedCorpusReview> {
  let archive: Uint8Array;
  try {
    archive = fs.readFileSync(options.sourcePath);
  } catch {
    throw new Error("Unable to read the explicit Recall backup source.");
  }

  const corpus = options.corpus ?? recallCuratedCorpus;
  const review = await auditRecallCuratedCorpusArchive(archive, corpus);
  if (!options.writePath) return review;

  const candidate = {
    schemaVersion: corpus.schemaVersion,
    source: corpus.source,
    maxContentChars: corpus.maxContentChars,
    entries: corpus.entries,
  };
  fs.mkdirSync(path.dirname(path.resolve(options.writePath)), {
    recursive: true,
  });
  fs.writeFileSync(
    options.writePath,
    `${JSON.stringify(candidate, null, 2)}\n`,
    "utf8"
  );
  return { ...review, wroteCandidate: true };
}

export function parseDeriveRecallCuratedCorpusArgs(
  args: string[]
): DeriveRecallCuratedCorpusCliOptions {
  let sourcePath: string | undefined;
  let writePath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source") {
      sourcePath = args[++index];
    } else if (argument === "--write") {
      writePath = args[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!sourcePath) {
    throw new Error(
      "Usage: --source <backup.aio-kb> [--write <candidate.json>]"
    );
  }
  if (args.includes("--write") && !writePath) {
    throw new Error("--write requires an output path.");
  }
  return { sourcePath, ...(writePath ? { writePath } : {}) };
}

async function main(): Promise<void> {
  const options = parseDeriveRecallCuratedCorpusArgs(process.argv.slice(2));
  const review = await deriveRecallCuratedCorpus(options);
  console.log(JSON.stringify(review, null, 2));
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === executedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error(`Curated corpus derivation failed: ${message}`);
    process.exitCode = 1;
  });
}
