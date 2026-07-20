import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  RECALL_CURATED_CORPUS_FORBIDDEN_TERMS,
  recallCuratedCorpus,
} from "../fixtures/recall-curated-corpus";
import type { RecallCuratedCorpus } from "../fixtures/recall-curated-corpus";
import {
  auditRecallCuratedCorpusArchive,
  parseDeriveRecallCuratedCorpusArgs,
  validateRecallCuratedCorpus,
} from "../scripts/derive-recall-curated-corpus";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function cloneCorpus(): RecallCuratedCorpus {
  return structuredClone(recallCuratedCorpus);
}

async function createSourceArchive(): Promise<{
  archive: Uint8Array;
  corpus: RecallCuratedCorpus;
}> {
  const corpus = cloneCorpus();
  const entries = corpus.entries.map((entry) => {
    const content = `Synthetic source for ${entry.sourceEntryId}`;
    const contentHash = sha256(content);
    entry.sourceContentHash = contentHash;
    return { id: entry.sourceEntryId, content, contentHash };
  });
  while (entries.length < corpus.source.expectedEntryCount) {
    const index = entries.length;
    const content = `Unselected synthetic source ${index}`;
    entries.push({
      id: `synthetic-source-${index}`,
      content,
      contentHash: sha256(content),
    });
  }

  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      format: corpus.source.format,
      formatVersion: corpus.source.formatVersion,
      entryCount: corpus.source.expectedEntryCount,
      files: [{ path: "library.json" }],
    })
  );
  zip.file("library.json", JSON.stringify({ meta: {}, entries }));
  const archive = await zip.generateAsync({ type: "uint8array" });
  corpus.source.archiveSha256 = sha256(archive);
  return { archive, corpus };
}

describe("Recall curated corpus", () => {
  it("contains 12 minimal entries with required topics and duplicate titles", () => {
    expect(() => validateRecallCuratedCorpus()).not.toThrow();
    expect(recallCuratedCorpus.entries).toHaveLength(12);
    expect(
      new Set(recallCuratedCorpus.entries.map((entry) => entry.topic))
    ).toEqual(
      new Set([
        "renderer-v2",
        "tool-structure",
        "memory-ownership",
        "base64-image",
        "hard-negative",
      ])
    );
    expect(
      recallCuratedCorpus.entries.filter(
        (entry) => entry.role === "hard-negative"
      )
    ).toHaveLength(2);

    const duplicateTitleEntries = recallCuratedCorpus.entries.filter(
      (entry) => entry.title === "渲染引擎 V2 架构验证"
    );
    expect(duplicateTitleEntries).toHaveLength(2);
    expect(
      new Set(duplicateTitleEntries.map((entry) => entry.contentHash)).size
    ).toBe(2);
  });

  it("keeps derived hashes, forbidden terms, paths, and lengths reviewable", () => {
    for (const entry of recallCuratedCorpus.entries) {
      expect(sha256(entry.content)).toBe(entry.contentHash);
      expect(entry.content.length).toBeLessThanOrEqual(
        recallCuratedCorpus.maxContentChars
      );
      const serialized = [entry.title, entry.content, ...entry.tags].join("\n");
      for (const term of RECALL_CURATED_CORPUS_FORBIDDEN_TERMS) {
        expect(serialized.toLocaleLowerCase()).not.toContain(
          term.toLocaleLowerCase()
        );
      }
      expect(serialized).not.toMatch(/[a-zA-Z]:[\\/]/);
      expect(serialized).not.toMatch(
        /\/(?:Users|home|root|tmp|var|opt|mnt|Volumes)\//i
      );
    }
  });

  it("fails closed when derived content changes or exceeds policy", () => {
    const changed = cloneCorpus();
    changed.entries[0].content += "changed";
    expect(() => validateRecallCuratedCorpus(changed)).toThrow(
      "Curated content hash mismatch"
    );

    const forbidden = cloneCorpus();
    forbidden.entries[0].content = `Contains ${RECALL_CURATED_CORPUS_FORBIDDEN_TERMS[0]}`;
    forbidden.entries[0].contentHash = sha256(forbidden.entries[0].content);
    expect(() => validateRecallCuratedCorpus(forbidden)).toThrow(
      "forbidden term"
    );

    const absolutePath = cloneCorpus();
    absolutePath.entries[0].content = "Local file: C:\\private\\notes.md";
    absolutePath.entries[0].contentHash = sha256(
      absolutePath.entries[0].content
    );
    expect(() => validateRecallCuratedCorpus(absolutePath)).toThrow(
      "absolute path"
    );

    const oversized = cloneCorpus();
    oversized.entries[0].content = "x".repeat(oversized.maxContentChars + 1);
    oversized.entries[0].contentHash = sha256(oversized.entries[0].content);
    expect(() => validateRecallCuratedCorpus(oversized)).toThrow(
      "exceeds maximum length"
    );
  });

  it("audits a 473-entry ZIP without returning source content", async () => {
    const { archive, corpus } = await createSourceArchive();
    const review = await auditRecallCuratedCorpusArchive(archive, corpus);

    expect(review).toMatchObject({
      mode: "review",
      sourceEntryCount: 473,
      selectedEntryCount: 12,
      wroteCandidate: false,
      topics: {
        "renderer-v2": 3,
        "tool-structure": 2,
        "memory-ownership": 2,
        "base64-image": 3,
        "hard-negative": 2,
      },
    });
    expect(JSON.stringify(review)).not.toContain("Synthetic source");
    expect(review.entries.every((entry) => entry.contentLength > 0)).toBe(true);
  });

  it("requires explicit source and write arguments", () => {
    expect(
      parseDeriveRecallCuratedCorpusArgs([
        "--source",
        "backup.aio-kb",
        "--write",
        "candidate.json",
      ])
    ).toEqual({
      sourcePath: "backup.aio-kb",
      writePath: "candidate.json",
    });
    expect(() => parseDeriveRecallCuratedCorpusArgs([])).toThrow("Usage:");
    expect(() =>
      parseDeriveRecallCuratedCorpusArgs([
        "--source",
        "backup.aio-kb",
        "--write",
      ])
    ).toThrow("--write requires");
  });
});
