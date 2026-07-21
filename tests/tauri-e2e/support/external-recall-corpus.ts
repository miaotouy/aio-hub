import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { recallCuratedCorpus } from "../fixtures/recall-curated-corpus";

const REQUIRED_ZIP_ENTRIES = new Set(["manifest.json", "library.json"]);
const MAX_ZIP_ENTRIES = 4096;

export interface ExternalRecallCorpusMetadata {
  schemaVersion: 1;
  extension: ".aio-kb";
  sizeBytes: number;
  sha256: string;
  zipEntryCount: number;
  reviewedSource: boolean;
  expectedEntryCount?: number;
  probeEntryIds: string[];
}

export interface ExternalRecallCorpusSource {
  sourcePath: string;
  metadata: ExternalRecallCorpusMetadata;
}

function isSafeZipEntry(name: string): boolean {
  if (
    !name ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[a-zA-Z]:/.test(name)
  ) {
    return false;
  }
  const parts = name.split("/").filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== "." && part !== "..");
}

function isAllowedZipEntry(name: string): boolean {
  return (
    REQUIRED_ZIP_ENTRIES.has(name) ||
    name === "assets/" ||
    name.startsWith("assets/")
  );
}

function reviewedProbeEntryIds(): string[] {
  const seenTopics = new Set<string>();
  const ids: string[] = [];
  for (const entry of recallCuratedCorpus.entries) {
    if (entry.role !== "positive" || seenTopics.has(entry.topic)) continue;
    seenTopics.add(entry.topic);
    ids.push(entry.sourceEntryId);
  }
  return ids;
}

export async function prepareExternalRecallCorpus(
  sourcePath: string | undefined
): Promise<ExternalRecallCorpusSource | null> {
  const requestedPath = sourcePath?.trim();
  if (!requestedPath) return null;

  const resolvedPath = path.resolve(requestedPath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error("AIO_E2E_RECALL_SOURCE must reference an existing file.");
  }
  if (path.extname(resolvedPath).toLowerCase() !== ".aio-kb") {
    throw new Error("AIO_E2E_RECALL_SOURCE must be a .aio-kb backup.");
  }

  const bytes = fs.readFileSync(resolvedPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("AIO_E2E_RECALL_SOURCE is not a readable ZIP backup.");
  }

  const entries = Object.values(archive.files);
  if (entries.length === 0 || entries.length > MAX_ZIP_ENTRIES) {
    throw new Error("AIO_E2E_RECALL_SOURCE has an invalid ZIP entry count.");
  }
  const normalizedNames = new Set<string>();
  for (const entry of entries) {
    const unsafeName = (entry as JSZip.JSZipObject & {
      unsafeOriginalName?: string;
    }).unsafeOriginalName;
    const name = unsafeName || entry.name;
    if (!isSafeZipEntry(name) || !isAllowedZipEntry(name)) {
      throw new Error(
        `AIO_E2E_RECALL_SOURCE contains a disallowed ZIP entry: ${name}`
      );
    }
    normalizedNames.add(entry.name);
  }
  for (const required of REQUIRED_ZIP_ENTRIES) {
    if (!normalizedNames.has(required)) {
      throw new Error(`AIO_E2E_RECALL_SOURCE is missing ${required}.`);
    }
  }

  const reviewedSource = sha256 === recallCuratedCorpus.source.archiveSha256;
  return {
    sourcePath: resolvedPath,
    metadata: {
      schemaVersion: 1,
      extension: ".aio-kb",
      sizeBytes: bytes.byteLength,
      sha256,
      zipEntryCount: entries.length,
      reviewedSource,
      expectedEntryCount: reviewedSource
        ? recallCuratedCorpus.source.expectedEntryCount
        : undefined,
      probeEntryIds: reviewedSource ? reviewedProbeEntryIds() : [],
    },
  };
}
