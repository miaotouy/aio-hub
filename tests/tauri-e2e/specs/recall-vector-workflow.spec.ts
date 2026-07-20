import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { recallCuratedCorpus } from "../fixtures/recall-curated-corpus";
import { RECALL_ENTRY_IDS } from "../fixtures/recall-scenarios";
import {
  recallRuntimeFixture,
  requiredE2eEnv,
  setupRecallRuntimeFixture,
} from "../support/recall-runtime-fixture";
import { invokeTauriCommand } from "../support/tauri-command";

interface EmbeddingRequestSummary {
  requestId: string;
  inputCount: number;
  inputs: Array<{
    inputHash: string;
    topicId: string | null;
  }>;
  dimension: number;
  status: number;
}

interface RecallMetaSummary {
  id: string;
  models: string[];
  entries: Array<{
    id: string;
    vectorStatus: string;
    vectorizedModels: string[];
  }>;
}

interface VectorCoverageSummary {
  totalEntries: number;
  cachedEntries: number;
  missingEntries: number;
}

interface LoadStats {
  loadedCount: number;
  dimension: number;
  modelId: string;
}

const {
  corpusMode,
  embeddingProfileId,
  embeddingModelId,
  embeddingDimension,
  manifest,
} = recallRuntimeFixture;
const lane = requiredE2eEnv("AIO_E2E_LANE");
const artifactDir = requiredE2eEnv("AIO_E2E_ARTIFACT_DIR");
const embeddingLogPath = path.join(artifactDir, "embedding-requests.jsonl");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readEmbeddingRequests(): EmbeddingRequestSummary[] {
  if (!fs.existsSync(embeddingLogPath)) return [];
  return fs
    .readFileSync(embeddingLogPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EmbeddingRequestSummary);
}

async function clickVisibleElement(
  selector: string,
  description: string
): Promise<void> {
  await browser.waitUntil(
    async () =>
      await browser.execute((target) => {
        const element = Array.from(
          document.querySelectorAll<HTMLElement>(target)
        ).find((candidate) => {
          const style = window.getComputedStyle(candidate);
          const rect = candidate.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        });
        if (!element) return false;
        element.click();
        return true;
      }, selector),
    {
      timeout: 20_000,
      interval: 100,
      timeoutMsg: `${description} did not become visible.`,
    }
  );
}

async function navigateToRecall(): Promise<void> {
  await browser.execute(() => {
    window.history.pushState({}, "", "/recall");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await $('[data-testid="recall-workspace"]').waitForDisplayed({
    timeout: 30_000,
  });
}

async function verifyEmbeddingModel(): Promise<void> {
  await $('[data-testid="recall-tab-settings"]').click();
  const selector = await $('[data-testid="recall-default-embedding-model"]');
  await selector.waitForDisplayed({ timeout: 20_000 });
  await browser.waitUntil(
    async () => (await selector.getText()).trim() !== "",
    {
      timeout: 20_000,
      timeoutMsg: "Recall settings did not display the seeded Embedding model.",
    }
  );
}

async function waitForCompleteCoverage(): Promise<VectorCoverageSummary> {
  let coverage: VectorCoverageSummary | undefined;
  await browser.waitUntil(
    async () => {
      coverage = await invokeTauriCommand<VectorCoverageSummary>(
        "recall_check_vector_coverage",
        {
          recallIds: [manifest.recall.id],
          modelId: embeddingModelId,
        }
      );
      return coverage.missingEntries === 0;
    },
    {
      timeout: corpusMode === "curated" ? 120_000 : 90_000,
      interval: 500,
      timeoutMsg: "Recall UI vectorization did not produce complete coverage.",
    }
  );
  return coverage!;
}

async function runVisibleSearch(query: string, expectedTopIds: string[]) {
  const queryInput = await $(
    '[data-testid="recall-search-query"] input, input[data-testid="recall-search-query"]'
  );
  await queryInput.setValue(query);
  await $('[data-testid="recall-search-submit"]').click();

  const resultList = await $('[data-testid="recall-search-results"]');
  await browser.waitUntil(
    async () =>
      (await resultList.getAttribute("data-last-query")) === query &&
      (await resultList.getAttribute("data-search-state")) === "idle" &&
      Number(await resultList.getAttribute("data-result-count")) > 0,
    {
      timeout: 30_000,
      timeoutMsg: `Recall UI did not finish search query: ${query}.`,
    }
  );

  const ids = await browser.execute(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="recall-search-result"]'
      )
    ).map((result) => result.dataset.entryId ?? "")
  );
  const first = await $('[data-testid="recall-search-result"]');
  assert(
    expectedTopIds.includes(ids[0]),
    `Recall UI ranked ${ids[0]} first; expected one of ${expectedTopIds.join(
      ", "
    )}.`
  );
  assert(
    (await first.getAttribute("data-trace-engine")) === "vector",
    "Recall result did not expose a vector search trace."
  );
  assert(
    (await first.getAttribute("data-trace-version")) === "recall-profile-v1",
    "Recall result used an unexpected retrieval algorithm version."
  );
  assert(
    (await first.getAttribute("data-trace-rank")) === "1",
    "Recall result trace did not preserve the first-place rank."
  );
  return ids;
}

describe("Recall vector workflow", () => {
  before(async () => {
    await setupRecallRuntimeFixture();
  });

  it("vectorizes the selected corpus and performs semantic search through visible UI", async () => {
    await navigateToRecall();
    await verifyEmbeddingModel();

    await $('[data-testid="recall-tab-workspace"]').click();
    const workspace = await $('[data-testid="recall-workspace"]');
    await browser.waitUntil(
      async () =>
        (await workspace.getAttribute("data-recall-id")) === manifest.recall.id,
      {
        timeout: 20_000,
        timeoutMsg: "Recall workspace did not activate the fixture collection.",
      }
    );

    const vectorizeAll = await $('[data-testid="recall-vectorize-all"]');
    await vectorizeAll.waitForClickable({ timeout: 20_000 });
    await vectorizeAll.click();

    const coverage = await waitForCompleteCoverage();
    assert(
      coverage.totalEntries === manifest.recall.entries.length &&
        coverage.cachedEntries === manifest.recall.entries.length,
      "Recall vector coverage counts do not match the selected fixture corpus."
    );

    const vectorStatus = await $('[data-testid="recall-vector-status"]');
    await browser.waitUntil(
      async () =>
        (await vectorStatus.getAttribute("data-vector-ready")) ===
          String(manifest.recall.entries.length) &&
        (await vectorStatus.getAttribute("data-vector-pending")) === "0",
      {
        timeout: 30_000,
        timeoutMsg: "Recall UI did not show the vectorized corpus as ready.",
      }
    );

    const meta = await invokeTauriCommand<RecallMetaSummary | null>(
      "recall_load_base_meta",
      { recallId: manifest.recall.id, modelId: embeddingModelId }
    );
    assert(
      meta?.models.includes(embeddingModelId),
      "Recall metadata lost the vector model."
    );
    assert(
      meta.entries.every(
        (entry) =>
          entry.vectorStatus === "ready" &&
          entry.vectorizedModels.includes(embeddingModelId)
      ),
      "Recall entry metadata does not show complete vector persistence."
    );

    const loadStats = await invokeTauriCommand<LoadStats>(
      "recall_load_model_vectors",
      { recallId: manifest.recall.id, modelId: embeddingModelId }
    );
    assert(
      loadStats.loadedCount === manifest.recall.entries.length &&
        loadStats.dimension === embeddingDimension,
      "Recall vector store count or dimension does not match the selected lane."
    );

    if (lane === "deterministic-mock") {
      const requests = readEmbeddingRequests();
      const inputHashes = new Set(
        requests.flatMap((request) =>
          request.inputs.map((input) => input.inputHash)
        )
      );
      for (const entry of manifest.recall.entries) {
        assert(
          inputHashes.has(sha256(entry.content)),
          `No application Embedding request was recorded for entry ${entry.id}.`
        );
      }
      assert(
        requests.every(
          (request) =>
            request.status === 200 && request.dimension === embeddingDimension
        ),
        "Mock Embedding summaries contain a failed or wrong-dimension request."
      );
    }

    await $('[data-testid="recall-tab-playground"]').click();
    const playground = await $('[data-testid="recall-playground"]');
    await playground.waitForDisplayed({ timeout: 20_000 });
    const collectionSelector = await $(
      '[data-testid="recall-search-collections"]'
    );
    await browser.waitUntil(
      async () =>
        (await collectionSelector.getAttribute("data-recall-ids")) ===
        manifest.recall.id,
      {
        timeout: 20_000,
        timeoutMsg: "Recall playground did not target the fixture collection.",
      }
    );

    await clickVisibleElement(
      '[data-testid="recall-search-engine"] .el-select__wrapper',
      "Recall engine selector"
    );
    await clickVisibleElement(
      '.recall-search-engine-popper [data-testid="recall-search-engine-option"][data-engine-id="vector"]',
      "Recall vector engine option"
    );
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="recall-search-engine"]').getAttribute(
          "data-engine-id"
        )) === "vector",
      {
        timeout: 20_000,
        timeoutMsg: "Recall playground did not select the vector engine.",
      }
    );

    const rustQuery = "Rust ownership and borrow checker";
    const rustIds = await runVisibleSearch(rustQuery, [RECALL_ENTRY_IDS.rust]);
    const bananaRank = rustIds.indexOf(RECALL_ENTRY_IDS.banana);
    assert(
      bananaRank === -1 || rustIds.indexOf(RECALL_ENTRY_IDS.rust) < bananaRank,
      "The unrelated banana entry ranked above the Rust ownership entry."
    );

    if (lane === "deterministic-mock") {
      const requests = readEmbeddingRequests();
      assert(
        requests.some((request) =>
          request.inputs.some((input) => input.inputHash === sha256(rustQuery))
        ),
        "No application query Embedding request was recorded for semantic search."
      );
    }

    let curatedRendererIds: string[] = [];
    if (corpusMode === "curated") {
      const rendererPositiveIds = [
        RECALL_ENTRY_IDS.renderer,
        ...recallCuratedCorpus.entries
          .filter(
            (entry) =>
              entry.topic === "renderer-v2" && entry.role === "positive"
          )
          .map((entry) => entry.id),
      ];
      curatedRendererIds = await runVisibleSearch(
        "复杂 Markdown streaming markdown heavy component",
        rendererPositiveIds
      );
      const duplicateTitleIds = recallCuratedCorpus.entries
        .filter((entry) => entry.title === "渲染引擎 V2 架构验证")
        .map((entry) => entry.id);
      assert(
        duplicateTitleIds.every((id) => curatedRendererIds.includes(id)),
        "Curated search collapsed entries that share a title but have different IDs."
      );

      const hardNegativeIds = new Set(
        recallCuratedCorpus.entries
          .filter((entry) => entry.role === "hard-negative")
          .map((entry) => entry.id)
      );
      const firstHardNegativeRank = curatedRendererIds.findIndex((id) =>
        hardNegativeIds.has(id)
      );
      assert(
        firstHardNegativeRank !== 0,
        `A curated hard negative ranked first: ${curatedRendererIds.join(
          ", "
        )}.`
      );
    }

    fs.writeFileSync(
      path.join(artifactDir, "recall-vector-workflow.json"),
      `${JSON.stringify(
        {
          corpusMode,
          lane,
          recallId: manifest.recall.id,
          entryCount: manifest.recall.entries.length,
          embeddingProfileId,
          embeddingModelId,
          embeddingDimension,
          coverage,
          loadedVectorCount: loadStats.loadedCount,
          rustTopEntryId: rustIds[0],
          curatedRendererResultIds: curatedRendererIds,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });
});
