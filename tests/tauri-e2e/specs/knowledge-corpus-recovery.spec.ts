import fs from "node:fs";
import path from "node:path";
import { invokeTauriCommand } from "../support/tauri-command";

interface CorpusQuery {
  id: string;
  relevantDocumentIds: string[];
  marker: string;
  keywordQuery: string;
}

interface CorpusManifest {
  revision: string;
  counts: { documents: number; queries: number };
  documents: Record<string, string>;
}

interface KnowledgeLibrarySummary {
  id: string;
  name: string;
  documentCount: number;
  chunkCount: number;
}

interface KnowledgeSearchResult {
  chunkId: string;
  title: string;
  content: string;
  signals?: Array<{ signalType?: string }>;
}

/**
 * 同一数据根上的第二次启动：验证重建后的资料库、文档与关键词索引在真实重启后
 * 仍然可用，且检索结果没有被残留状态污染。
 */
const corpusRoot = process.env.AIO_E2E_KNOWLEDGE_CORPUS;
const describeRecovery =
  process.env.AIO_E2E_PRESET_ID === "knowledge-corpus" &&
  process.env.AIO_E2E_PHASE === "recovery"
    ? describe
    : describe.skip;

describeRecovery("Chinese Knowledge corpus recovery", () => {
  it("keeps the rebuilt library searchable after a restart", async () => {
    if (!corpusRoot) {
      throw new Error("AIO_E2E_KNOWLEDGE_CORPUS was not provided");
    }

    const manifest = JSON.parse(
      fs.readFileSync(path.join(corpusRoot, "manifest.json"), "utf8")
    ) as CorpusManifest;
    const queries = fs
      .readFileSync(path.join(corpusRoot, "queries.jsonl"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CorpusQuery);

    await invokeTauriCommand<void>("knowledge_initialize");
    const libraries = await invokeTauriCommand<KnowledgeLibrarySummary[]>(
      "knowledge_list_libraries"
    );
    const libraryName = `E2E Corpus ${manifest.revision.slice(0, 7)}`;
    const library = libraries.find((item) => item.name === libraryName);
    if (!library) {
      throw new Error("The Knowledge corpus library did not survive a restart");
    }
    if (library.documentCount !== manifest.counts.documents) {
      throw new Error(
        `Restart lost documents: ${library.documentCount}/${manifest.counts.documents}`
      );
    }

    const primary = queries[0]!;
    const results = await invokeTauriCommand<KnowledgeSearchResult[]>(
      "knowledge_search",
      {
        request: {
          query: primary.keywordQuery,
          libraryIds: [library.id],
          strategy: "keyword",
          limit: 10,
          minScore: 0,
        },
      }
    );
    if (results[0]?.title !== primary.relevantDocumentIds[0]) {
      throw new Error("Keyword retrieval did not survive the restart");
    }
    if (!results[0]?.content.includes(primary.marker)) {
      throw new Error("Restarted retrieval lost its evidence marker");
    }
  });
});
