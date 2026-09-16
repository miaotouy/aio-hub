// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KNOWLEDGE_CORPUS_MANIFEST_SCHEMA_VERSION,
  normalizePassageText,
  readKnowledgeCorpusManifest,
  selectKnowledgeCorpusSlice,
  validateKnowledgeCorpusManifest,
  verifyKnowledgeCorpus,
} from "./knowledge-corpus";
import {
  knowledgeCorpusSource,
  type KnowledgeCorpusSlice,
} from "../fixtures/knowledge-corpus";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const slice: KnowledgeCorpusSlice = {
  queryCount: 2,
  relevantPerQuery: 2,
  minRelevantPerQuery: 1,
  minPassageChars: 10,
  maxPassageChars: 400,
  distractorCount: 1,
  markerChars: 12,
};

function passage(text: string): string {
  return `${text}${"内容补充".repeat(6)}`;
}

describe("knowledge corpus slicing", () => {
  const corpusRows = [
    { _id: "5", text: `<br><b>${passage("甲组唯一正文内容")}</b>` },
    { _id: "7", text: `<p>${passage("甲组第二篇正文内容")}</p>` },
    { _id: "9", text: `<p>${passage("乙组唯一正文内容")}</p>` },
    { _id: "11", text: `<p>${passage("乙组第二篇正文内容")}</p>` },
    { _id: "13", text: `<p>${passage("干扰正文内容")}</p>` },
  ];
  const queryRows = [
    { _id: "0", text: "甲组问题" },
    { _id: "1", text: "乙组问题" },
  ];
  const qrelsRows = [
    { "query-id": "0", "corpus-id": "5", score: 1 },
    { "query-id": "0", "corpus-id": "7", score: 1 },
    { "query-id": "1", "corpus-id": "9", score: 1 },
    { "query-id": "1", "corpus-id": "11", score: 1 },
  ];

  it("normalizes html fragments and whitespace into searchable text", () => {
    expect(normalizePassageText("<br><img><p>甲&nbsp;乙&amp;丙</p>")).toBe(
      "甲 乙&丙"
    );
  });

  it("selects a deterministic slice with non-overlapping passages", () => {
    const derived = selectKnowledgeCorpusSlice(
      corpusRows,
      queryRows,
      qrelsRows,
      slice
    );
    expect(derived.queries.map((query) => query.id)).toEqual(["0", "1"]);
    expect(derived.queries[0]!.relevantDocumentIds).toEqual(["5", "7"]);
    expect(derived.queries.every((query) => query.marker.length === 12)).toBe(
      true
    );
    expect(derived.documents.size).toBe(5);
    expect(derived.distractorIds).toEqual(["13"]);
    expect(derived.qrelsPairs).toHaveLength(4);
  });

  it("derives a whole-run keyword query that only the primary passage matches", () => {
    const derived = selectKnowledgeCorpusSlice(
      corpusRows,
      queryRows,
      qrelsRows,
      slice
    );
    for (const query of derived.queries) {
      const primaryId = query.relevantDocumentIds[0]!;
      expect(derived.documents.get(primaryId)).toContain(query.keywordQuery);
      const others = [...derived.documents.entries()].filter(
        ([id]) => id !== primaryId
      );
      expect(others.some(([, text]) => text.includes(query.keywordQuery))).toBe(
        false
      );
      // 整段 token：不能含 FTS5 unicode61 会切开的标点或空白。
      expect(query.keywordQuery).not.toMatch(/[\s,，.。;；:：!！?？、]/);
    }
  });

  it("produces markers unique across the whole derived corpus", () => {
    const derived = selectKnowledgeCorpusSlice(
      corpusRows,
      queryRows,
      qrelsRows,
      slice
    );
    for (const query of derived.queries) {
      const primaryId = query.relevantDocumentIds[0]!;
      expect(derived.documents.get(primaryId)).toContain(query.marker);
      const others = [...derived.documents.entries()].filter(
        ([id]) => id !== primaryId
      );
      expect(others.some(([, text]) => text.includes(query.marker))).toBe(
        false
      );
    }
  });

  it("fails instead of silently shrinking when the slice cannot be satisfied", () => {
    expect(() =>
      selectKnowledgeCorpusSlice(corpusRows, queryRows, qrelsRows, {
        ...slice,
        queryCount: 5,
      })
    ).toThrow(/upstream dataset or slice parameters changed/);
  });

  it("fails when a required field is missing from the manifest", () => {
    expect(() => validateKnowledgeCorpusManifest({ schemaVersion: 1 })).toThrow(
      /manifest id mismatch/
    );
    expect(() =>
      validateKnowledgeCorpusManifest({
        schemaVersion: 99,
        id: knowledgeCorpusSource.id,
      })
    ).toThrow(/Unsupported Knowledge corpus manifest schema/);
    expect(() =>
      validateKnowledgeCorpusManifest({
        schemaVersion: KNOWLEDGE_CORPUS_MANIFEST_SCHEMA_VERSION,
        id: knowledgeCorpusSource.id,
        revision: knowledgeCorpusSource.revision,
      })
    ).toThrow(/no file entries/);
  });

  it("reports a missing or unverifiable cache directory without downloading", async () => {
    const directory = tempDir("aio-knowledge-corpus-");
    expect(readKnowledgeCorpusManifest(directory)).toBeNull();
    const verification = await verifyKnowledgeCorpus(directory);
    expect(verification.ok).toBe(false);
    expect(verification.problems[0]).toMatch(/manifest missing/);
  });

  it("detects corrupted derived documents", async () => {
    const directory = tempDir("aio-knowledge-corpus-");
    const documentPath = path.join(directory, "corpus", "5.md");
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, "tampered\n");
    fs.writeFileSync(
      path.join(directory, "queries.jsonl"),
      `${JSON.stringify({
        id: "0",
        query: "甲组问题",
        relevantDocumentIds: ["5"],
        marker: "甲组唯一正文内容",
      })}\n`
    );
    const manifest = {
      schemaVersion: KNOWLEDGE_CORPUS_MANIFEST_SCHEMA_VERSION,
      id: knowledgeCorpusSource.id,
      dataset: knowledgeCorpusSource.dataset,
      revision: knowledgeCorpusSource.revision,
      license: knowledgeCorpusSource.license,
      homepage: knowledgeCorpusSource.homepage,
      attribution: knowledgeCorpusSource.attribution,
      endpoint: "https://hf-mirror.com",
      preparedAt: new Date(0).toISOString(),
      slice,
      counts: { documents: 1, queries: 1, qrelsPairs: 1, distractors: 0 },
      files: [
        {
          path: "corpus/5.md",
          sizeBytes: fs.statSync(documentPath).size,
          sha256: "deadbeef",
          purpose: "document",
        },
      ],
      documents: { "5": "corpus/5.md" },
    };
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      JSON.stringify(manifest)
    );

    const verification = await verifyKnowledgeCorpus(directory);
    expect(verification.ok).toBe(false);
    expect(
      verification.problems.some((problem) =>
        problem.includes("corpus/5.md sha256 mismatch")
      )
    ).toBe(true);
    expect(
      verification.problems.some((problem) =>
        problem.includes("source corpus.parquet missing")
      )
    ).toBe(true);
  });
});
