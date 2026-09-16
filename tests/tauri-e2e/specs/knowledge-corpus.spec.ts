import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

interface CorpusQuery {
  id: string;
  query: string;
  relevantDocumentIds: string[];
  marker: string;
  keywordQuery: string;
}

interface CorpusManifest {
  id: string;
  dataset: string;
  revision: string;
  license: string;
  attribution: string;
  counts: {
    documents: number;
    queries: number;
    qrelsPairs: number;
    distractors: number;
  };
  documents: Record<string, string>;
}

interface KnowledgeLibrarySummary {
  id: string;
  name: string;
  documentCount: number;
  chunkCount: number;
}

interface KnowledgeIndexStatus {
  embeddingModelId?: string;
  vectorizedChunks?: number;
  totalChunks?: number;
}

interface KnowledgeSignal {
  signalType?: string;
}

interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  /** 导入时写入的资料集 corpus id（文件名派生）。 */
  title: string;
  content: string;
  score: number;
  signals?: KnowledgeSignal[];
}

const corpusRoot = process.env.AIO_E2E_KNOWLEDGE_CORPUS;

const describeCorpus =
  process.env.AIO_E2E_PRESET_ID === "knowledge-corpus"
    ? describe
    : describe.skip;

async function navigateTo(targetPath: string): Promise<void> {
  await browser.execute((value) => {
    window.history.pushState({}, "", value);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, targetPath);
}

async function selectSearchWorkspace(): Promise<void> {
  await navigateTo("/knowledge-base");
  await $('[data-testid="knowledge-workspace"]').waitForDisplayed({
    timeout: 30_000,
  });
  await $('[data-testid="knowledge-workspace-mode"]').waitForDisplayed();

  const switched = await browser.execute(() => {
    const host = document.querySelector<HTMLElement>(
      '[data-testid="knowledge-workspace-mode"]'
    );
    if (!host) return false;
    const candidates = Array.from(
      host.querySelectorAll<HTMLElement>(
        ".el-segmented__item, label, button, div[role='radio']"
      )
    );
    const target = candidates.find((item) =>
      (item.textContent ?? "").includes("检索测试")
    );
    if (!target) return false;
    target.click();
    return true;
  });
  if (!switched) {
    throw new Error("Knowledge workspace mode switch was not found");
  }

  await $(
    '[data-testid="knowledge-search-input"] input, input[data-testid="knowledge-search-input"]'
  ).waitForDisplayed({ timeout: 20_000 });
}

describeCorpus("Chinese Knowledge corpus", () => {
  let manifest: CorpusManifest;
  let queries: CorpusQuery[];
  let libraryName: string;
  let libraryId = "";
  let primary: CorpusQuery;

  before(async () => {
    if (!corpusRoot) {
      throw new Error("AIO_E2E_KNOWLEDGE_CORPUS was not provided");
    }
    manifest = JSON.parse(
      fs.readFileSync(path.join(corpusRoot, "manifest.json"), "utf8")
    ) as CorpusManifest;
    queries = fs
      .readFileSync(path.join(corpusRoot, "queries.jsonl"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CorpusQuery);

    if (manifest.license !== "Apache-2.0") {
      throw new Error(`Unexpected corpus license: ${manifest.license}`);
    }
    if (
      queries.length !== manifest.counts.queries ||
      Object.keys(manifest.documents).length !== manifest.counts.documents
    ) {
      throw new Error(
        "Knowledge corpus manifest does not match its derived files"
      );
    }
    primary = queries[0]!;

    await invokeTauriCommand<void>("knowledge_initialize");
    const libraries = await invokeTauriCommand<KnowledgeLibrarySummary[]>(
      "knowledge_list_libraries"
    );
    libraryName = `E2E Corpus ${manifest.revision.slice(0, 7)}`;
    const existing = libraries.find((library) => library.name === libraryName);
    if (existing) {
      libraryId = existing.id;
    } else {
      const created = await invokeTauriCommand<KnowledgeLibrarySummary>(
        "knowledge_create_library",
        { name: libraryName }
      );
      libraryId = created.id;
    }

    const documents = await invokeTauriCommand<Array<{ id: string }>>(
      "knowledge_list_documents",
      { libraryId }
    );
    if (documents.length < manifest.counts.documents) {
      for (const [documentId, relativePath] of Object.entries(
        manifest.documents
      )) {
        await invokeTauriCommand("knowledge_ingest_document", {
          request: {
            libraryId,
            sourcePath: path.join(corpusRoot, relativePath),
            title: documentId,
            mimeType: "text/markdown",
            content: fs.readFileSync(
              path.join(corpusRoot, relativePath),
              "utf8"
            ),
          },
        });
      }
    }
  });

  async function search(
    query: string,
    strategy: "keyword" | "auto"
  ): Promise<KnowledgeSearchResult[]> {
    return await invokeTauriCommand<KnowledgeSearchResult[]>(
      "knowledge_search",
      {
        request: {
          query,
          libraryIds: [libraryId],
          strategy,
          limit: 10,
          minScore: 0,
        },
      }
    );
  }

  it("imports the whole corpus through production Knowledge IPC", async () => {
    const documents = await invokeTauriCommand<Array<{ id: string }>>(
      "knowledge_list_documents",
      { libraryId }
    );
    if (documents.length !== manifest.counts.documents) {
      throw new Error(
        `Expected ${manifest.counts.documents} corpus documents, got ${documents.length}`
      );
    }
  });

  it("returns the expected primary document for every corpus query", async () => {
    for (const query of queries) {
      const results = await search(query.keywordQuery, "keyword");
      const top = results[0];
      if (!top) {
        throw new Error(`Knowledge search returned no result for ${query.id}`);
      }
      if (top.title !== query.relevantDocumentIds[0]) {
        throw new Error(
          `Query ${query.id} matched ${top.title}, expected ${query.relevantDocumentIds[0]}`
        );
      }
      if (!top.content.includes(query.marker)) {
        throw new Error(`Query ${query.id} did not return its evidence marker`);
      }
    }
  });

  it("degrades auto to keyword and reports BM25 signals without a semantic index", async () => {
    const status = await invokeTauriCommand<KnowledgeIndexStatus>(
      "knowledge_get_index_status",
      { libraryId }
    );
    if (!status.embeddingModelId && (status.vectorizedChunks ?? 0) !== 0) {
      throw new Error("Vectorized chunk count is inconsistent with no model");
    }
    const results = await search(primary.keywordQuery, "auto");
    if (results[0]?.title !== primary.relevantDocumentIds[0]) {
      throw new Error("Auto strategy did not fall back to keyword retrieval");
    }
    if (
      !results[0]?.signals?.some(
        (signal) => signal.signalType === "knowledge-bm25"
      )
    ) {
      throw new Error("Auto strategy did not report a BM25 signal");
    }
  });

  it("serves the same query from the visible search workspace", async () => {
    await selectSearchWorkspace();
    const queryInput = await $(
      '[data-testid="knowledge-search-input"] input, input[data-testid="knowledge-search-input"]'
    );
    await queryInput.setValue(primary.keywordQuery);
    await $('[data-testid="knowledge-search-submit"]').click();

    const resultRow = await $(
      `[data-testid="knowledge-result-row"][data-document-id]`
    );
    await resultRow.waitForDisplayed({ timeout: 30_000 });
    const title = await resultRow.getAttribute("data-document-id");
    const content = await resultRow.$(
      '[data-testid="knowledge-result-content"]'
    );
    if (!(await content.getText()).includes(primary.marker)) {
      throw new Error(
        `The visible search panel did not show the evidence for ${title}`
      );
    }
  });

  it("keeps retrieval working after rebuilding the library index", async () => {
    const rebuilt = await invokeTauriCommand<number>(
      "knowledge_rebuild_library",
      {
        libraryId,
      }
    );
    if (rebuilt !== manifest.counts.documents) {
      throw new Error(
        `Rebuild reported ${rebuilt} documents, expected ${manifest.counts.documents}`
      );
    }
    const results = await search(primary.keywordQuery, "keyword");
    if (results[0]?.title !== primary.relevantDocumentIds[0]) {
      throw new Error("Retrieval broke after rebuilding the library index");
    }
  });
});
