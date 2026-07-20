import fs from "node:fs";
import path from "node:path";
import { $, $$, browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

interface BackupInspect {
  format: string;
  formatVersion: number;
  entryCount: number;
  hasConflict: boolean;
  legacyContentOnly: boolean;
  warnings: Array<{ code: string }> ;
}

interface BackupImportReport {
  status: string;
  libraryId: string | null;
  entryCount: number;
  restoredAssetCount: number;
  missingAssetCount: number;
  replacedExisting: boolean;
  importedAsCopy: boolean;
  legacyContentOnly: boolean;
  vectorsNeedRebuild: boolean;
  warnings: Array<{ code: string }> ;
}

interface VectorCoverage {
  totalEntries: number;
  cachedEntries: number;
  missingEntries: number;
}

interface RecallMeta {
  id: string;
  entries: Array<{ id: string; vectorStatus: string; vectorizedModels: string[] }> ;
}

interface EmbeddingRequest {
  inputCount: number;
  status: number;
}

interface ExternalCorpusArtifact {
  schemaVersion: 1;
  phase: "inspected" | "imported" | "sample-vectorized" | "vectorized";
  scope: "sample" | "full";
  source: {
    sha256: string;
    reviewed: boolean;
    expectedEntryCount: number | null;
  };
  inspect: {
    format: string;
    formatVersion: number;
    entryCount: number;
    legacyContentOnly: boolean;
    warningCodes: string[];
  };
  import: {
    status: string;
    collectionId: string;
    entryCount: number;
    restoredAssetCount: number;
    missingAssetCount: number;
    vectorsNeedRebuild: boolean;
    warningCodes: string[];
    elapsedMs: number;
  };
  vectorization: {
    totalEntries: number;
    cachedEntries: number;
    missingEntries: number;
    failedEntries: number;
    elapsedMs: number;
    embeddingRequestCount: number;
    embeddingInputCount: number;
    peakProgressCurrent: number;
    peakProgressTotal: number;
    targetEntryIds: string[];
  };
  probeEntryIds: string[];
  recovery?: {
    entryCount: number;
    cachedEntries: number;
    loadedVectorCount: number;
    dimension: number;
  };
}

function writeExternalCheckpoint(
  artifactDir: string,
  checkpoint: Record<string, unknown>
): void {
  fs.writeFileSync(
    path.join(artifactDir, "recall-external-corpus.json"),
    `${JSON.stringify({ schemaVersion: 1, ...checkpoint }, null, 2)}\n`,
    "utf8"
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the external corpus E2E.`);
  return value;
}

function optionalPositiveInteger(name: string): number | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when set.`);
  }
  return parsed;
}

function parseProbeIds(): string[] {
  return (process.env.AIO_E2E_RECALL_PROBE_ENTRY_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function readEmbeddingRequests(artifactDir: string): EmbeddingRequest[] {
  const filePath = path.join(artifactDir, "embedding-requests.jsonl");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EmbeddingRequest);
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

async function remountRecallWorkspace(): Promise<void> {
  await browser.execute(() => {
    window.history.pushState({}, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await browser.waitUntil(
    async () =>
      await browser.execute(() => window.location.pathname === "/settings"),
    { timeout: 20_000, timeoutMsg: "Could not leave the Recall workspace." }
  );
  await navigateToRecall();
}

async function activateImportedCollection(collectionId: string): Promise<void> {
  const workspace = await $('[data-testid="recall-workspace"]');
  const selector = `[data-testid="recall-collection-row"][data-recall-id="${collectionId}"]`;
  const row = await $(selector);
  await browser.waitUntil(
    async () =>
      (await workspace.getAttribute("data-recall-id")) === collectionId ||
      (await row.isDisplayed()),
    {
      timeout: 30_000,
      timeoutMsg: "Imported Recall collection did not become active or selectable.",
    }
  );
  if ((await workspace.getAttribute("data-recall-id")) === collectionId) return;

  if (!(await row.isDisplayed())) {
    const toggle = await $('[data-testid="recall-collection-list-toggle"]');
    if (await toggle.isDisplayed()) await toggle.click();
  }
  await row.waitForDisplayed({ timeout: 30_000 });
  await row.click();
  await browser.waitUntil(
    async () => (await workspace.getAttribute("data-recall-id")) === collectionId,
    {
      timeout: 30_000,
      timeoutMsg: "Recall UI did not activate the imported collection.",
    }
  );
}

async function waitForCoverage(
  collectionId: string,
  modelId: string
): Promise<{ coverage: VectorCoverage; peakCurrent: number; peakTotal: number }> {
  let coverage: VectorCoverage | undefined;
  let peakCurrent = 0;
  let peakTotal = 0;
  await browser.waitUntil(
    async () => {
      const progress = await $('[data-testid="recall-vector-progress"]');
      if (await progress.isExisting()) {
        const current = Number(await progress.getAttribute("data-vector-current"));
        const total = Number(await progress.getAttribute("data-vector-total"));
        if (Number.isFinite(current)) peakCurrent = Math.max(peakCurrent, current);
        if (Number.isFinite(total)) peakTotal = Math.max(peakTotal, total);
      }
      coverage = await invokeTauriCommand<VectorCoverage>(
        "recall_check_vector_coverage",
        { recallIds: [collectionId], modelId }
      );
      return coverage.missingEntries === 0;
    },
    {
      timeout: 300_000,
      interval: 350,
      timeoutMsg: "External corpus vectorization did not reach complete coverage.",
    }
  );
  return {
    coverage: coverage!,
    peakCurrent: Math.max(peakCurrent, coverage!.cachedEntries),
    peakTotal: Math.max(peakTotal, coverage!.totalEntries),
  };
}

async function vectorizeVisibleSample(sampleSize: number): Promise<string[]> {
  const toggle = await $('[data-testid="recall-entry-selection-toggle"]');
  await toggle.waitForClickable({ timeout: 30_000 });
  await toggle.click();

  await browser.waitUntil(
    async () => (await $$('[data-testid="recall-entry-row"]')).length >= sampleSize,
    {
      timeout: 30_000,
      timeoutMsg: `Recall UI did not render ${sampleSize} sample entries.`,
    }
  );
  const rows = (await $$('[data-testid="recall-entry-row"]')).slice(0, sampleSize);
  const entryIds = await Promise.all(
    rows.map(async (row) => requiredAttribute(row, "data-entry-id"))
  );
  for (const entryId of entryIds) {
    await $(
      `[data-testid="recall-entry-row"][data-entry-id="${entryId}"]`
    ).click();
  }

  const vectorizeSelected = await $('[data-testid="recall-vectorize-selected"]');
  await browser.waitUntil(
    async () =>
      Number(await vectorizeSelected.getAttribute("data-selected-count")) ===
      entryIds.length,
    {
      timeout: 10_000,
      timeoutMsg: "Recall UI did not retain the selected sample batch.",
    }
  );
  await vectorizeSelected.click();
  return entryIds;
}

async function requiredAttribute(
  element: WebdriverIO.Element,
  name: string
): Promise<string> {
  const value = await element.getAttribute(name);
  if (!value) throw new Error(`Recall UI element is missing ${name}.`);
  return value;
}

async function waitForSampleVectors(
  collectionId: string,
  modelId: string,
  entryIds: string[]
): Promise<{ coverage: VectorCoverage; meta: RecallMeta }> {
  let meta: RecallMeta | null = null;
  await browser.waitUntil(
    async () => {
      meta = await invokeTauriCommand<RecallMeta | null>(
        "recall_load_base_meta",
        { recallId: collectionId, modelId }
      );
      return entryIds.every((entryId) => {
        const entry = meta?.entries.find((candidate) => candidate.id === entryId);
        return (
          entry?.vectorStatus === "ready" &&
          entry.vectorizedModels.includes(modelId)
        );
      });
    },
    {
      timeout: 60_000,
      interval: 250,
      timeoutMsg: "External corpus sample vectorization did not complete.",
    }
  );
  const coverage = await invokeTauriCommand<VectorCoverage>(
    "recall_check_vector_coverage",
    { recallIds: [collectionId], modelId }
  );
  return { coverage, meta: meta! };
}

const externalCorpusDescribe =
  ["external-sample", "external-full"].includes(
    process.env.AIO_E2E_CORPUS_MODE ?? ""
  ) &&
  process.env.AIO_E2E_PHASE === "initial" &&
  process.env.AIO_E2E_ACTIVE_SPEC?.includes("recall-external-corpus")
    ? describe
    : describe.skip;

externalCorpusDescribe("Recall external corpus import", () => {
  it("imports, vectorizes, and records the external .aio-kb corpus", async function () {
    this.timeout(360_000);

    const sourcePath = requiredEnv("AIO_E2E_RECALL_SOURCE");
    const sourceSha256 = requiredEnv("AIO_E2E_RECALL_SOURCE_SHA256");
    const artifactDir = requiredEnv("AIO_E2E_ARTIFACT_DIR");
    const embeddingModelId = requiredEnv("AIO_E2E_EMBEDDING_MODEL_ID");
    const expectedEntryCount = optionalPositiveInteger("AIO_E2E_RECALL_EXPECTED_COUNT");
    const probeEntryIds = parseProbeIds();
    const sampleMode = process.env.AIO_E2E_CORPUS_MODE === "external-sample";

    await invokeTauriCommand<void>("recall_initialize");
    const inspect = await invokeTauriCommand<BackupInspect>(
      "recall_inspect_backup",
      { sourcePath }
    );
    if (
      inspect.format !== "aiohub.knowledge-library" ||
      inspect.formatVersion !== 1 ||
      inspect.hasConflict ||
      inspect.entryCount <= 0
    ) {
      throw new Error("External backup inspection did not produce an importable legacy library.");
    }
    if (expectedEntryCount !== null && inspect.entryCount !== expectedEntryCount) {
      throw new Error(
        `External backup entry count mismatch: expected ${expectedEntryCount}, received ${inspect.entryCount}.`
      );
    }
    writeExternalCheckpoint(artifactDir, {
      phase: "inspected",
      source: { sha256: sourceSha256, expectedEntryCount },
      inspect: {
        format: inspect.format,
        formatVersion: inspect.formatVersion,
        entryCount: inspect.entryCount,
        legacyContentOnly: inspect.legacyContentOnly,
        warningCodes: inspect.warnings.map((warning) => warning.code),
      },
    });

    const importStartedAt = Date.now();
    const report = await invokeTauriCommand<BackupImportReport>(
      "recall_import_backup",
      {
        sourcePath,
        sourceEntry: null,
        options: { conflictStrategy: "cancel" },
      }
    );
    const importElapsedMs = Date.now() - importStartedAt;
    const collectionId = report.libraryId;
    if (
      report.status !== "success" ||
      !collectionId ||
      report.entryCount !== inspect.entryCount ||
      report.replacedExisting ||
      report.importedAsCopy
    ) {
      throw new Error("External backup import report does not match the inspected backup.");
    }
    writeExternalCheckpoint(artifactDir, {
      phase: "imported",
      source: { sha256: sourceSha256, expectedEntryCount },
      inspect: { entryCount: inspect.entryCount },
      import: {
        status: report.status,
        collectionId,
        entryCount: report.entryCount,
        elapsedMs: importElapsedMs,
      },
    });

    const importedIds = await invokeTauriCommand<string[]>(
      "recall_list_entry_ids",
      { recallId: collectionId }
    );
    if (importedIds.length !== inspect.entryCount) {
      throw new Error("Imported entry count differs from the production command readback.");
    }
    for (const probeEntryId of probeEntryIds) {
      if (!importedIds.includes(probeEntryId)) {
        throw new Error(`Reviewed source probe entry is missing: ${probeEntryId}`);
      }
    }

    // Recall initializes its collection list when the workspace mounts. Remount
    // after import so the visible UI observes the newly persisted collection.
    await remountRecallWorkspace();
    await activateImportedCollection(collectionId);
    const embeddingBaseline = readEmbeddingRequests(artifactDir).length;
    const vectorStartedAt = Date.now();
    let targetEntryIds: string[];
    let coverage: VectorCoverage;
    let meta: RecallMeta | null;
    let peakCurrent: number;
    let peakTotal: number;
    if (sampleMode) {
      const configuredSampleSize =
        optionalPositiveInteger("AIO_E2E_RECALL_SAMPLE_SIZE") ?? 3;
      const sampleSize = Math.min(configuredSampleSize, inspect.entryCount);
      targetEntryIds = await vectorizeVisibleSample(sampleSize);
      ({ coverage, meta } = await waitForSampleVectors(
        collectionId,
        embeddingModelId,
        targetEntryIds
      ));
      peakCurrent = targetEntryIds.length;
      peakTotal = targetEntryIds.length;
    } else {
      targetEntryIds = importedIds;
      const vectorizeAll = await $('[data-testid="recall-vectorize-all"]');
      await vectorizeAll.waitForClickable({ timeout: 30_000 });
      await vectorizeAll.click();
      ({ coverage, peakCurrent, peakTotal } = await waitForCoverage(
        collectionId,
        embeddingModelId
      ));
      meta = await invokeTauriCommand<RecallMeta | null>(
        "recall_load_base_meta",
        { recallId: collectionId, modelId: embeddingModelId }
      );
    }
    const vectorElapsedMs = Date.now() - vectorStartedAt;
    if (coverage.totalEntries !== inspect.entryCount) {
      throw new Error("External corpus vector coverage has an invalid total.");
    }
    if (
      (!sampleMode &&
        (coverage.cachedEntries !== inspect.entryCount ||
          coverage.missingEntries !== 0)) ||
      (sampleMode && coverage.cachedEntries < targetEntryIds.length)
    ) {
      throw new Error("External corpus vector coverage is incomplete.");
    }
    writeExternalCheckpoint(artifactDir, {
      phase: sampleMode ? "sample-vectorized" : "vectorized",
      scope: sampleMode ? "sample" : "full",
      source: { sha256: sourceSha256, expectedEntryCount },
      import: { collectionId, entryCount: inspect.entryCount },
      vectorization: {
        totalEntries: coverage.totalEntries,
        cachedEntries: coverage.cachedEntries,
        missingEntries: coverage.missingEntries,
        peakProgressCurrent: peakCurrent,
        peakProgressTotal: peakTotal,
        targetEntryIds: sampleMode ? targetEntryIds : [],
      },
    });

    if (
      !meta ||
      meta.id !== collectionId ||
      meta.entries.length !== inspect.entryCount ||
      targetEntryIds.some((entryId) => {
        const entry = meta?.entries.find((candidate) => candidate.id === entryId);
        return (
          !entry ||
          entry.vectorStatus !== "ready" ||
          !entry.vectorizedModels.includes(embeddingModelId)
        );
      })
    ) {
      throw new Error("Imported metadata does not show target vector persistence.");
    }

    if (!sampleMode) {
      for (const probeEntryId of probeEntryIds) {
        const probe = meta.entries.find((entry) => entry.id === probeEntryId);
        if (
          !probe ||
          probe.vectorStatus !== "ready" ||
          !probe.vectorizedModels.includes(embeddingModelId)
        ) {
          throw new Error(`Reviewed source probe was not vectorized: ${probeEntryId}`);
        }
      }
    }

    const embeddingRequests = readEmbeddingRequests(artifactDir).slice(embeddingBaseline);
    if (
      process.env.AIO_E2E_LANE === "deterministic-mock" &&
      embeddingRequests.some((request) => request.status !== 200)
    ) {
      throw new Error("The deterministic embedding lane recorded a failed request.");
    }

    const artifact: ExternalCorpusArtifact = {
      schemaVersion: 1,
      phase: sampleMode ? "sample-vectorized" : "vectorized",
      scope: sampleMode ? "sample" : "full",
      source: {
        sha256: sourceSha256,
        reviewed: process.env.AIO_E2E_RECALL_SOURCE_REVIEWED === "1",
        expectedEntryCount,
      },
      inspect: {
        format: inspect.format,
        formatVersion: inspect.formatVersion,
        entryCount: inspect.entryCount,
        legacyContentOnly: inspect.legacyContentOnly,
        warningCodes: inspect.warnings.map((warning) => warning.code),
      },
      import: {
        status: report.status,
        collectionId,
        entryCount: report.entryCount,
        restoredAssetCount: report.restoredAssetCount,
        missingAssetCount: report.missingAssetCount,
        vectorsNeedRebuild: report.vectorsNeedRebuild,
        warningCodes: report.warnings.map((warning) => warning.code),
        elapsedMs: importElapsedMs,
      },
      vectorization: {
        totalEntries: coverage.totalEntries,
        cachedEntries: coverage.cachedEntries,
        missingEntries: coverage.missingEntries,
        failedEntries: 0,
        elapsedMs: vectorElapsedMs,
        embeddingRequestCount: embeddingRequests.length,
        embeddingInputCount: embeddingRequests.reduce(
          (total, request) => total + request.inputCount,
          0
        ),
        peakProgressCurrent: peakCurrent,
        peakProgressTotal: peakTotal,
        targetEntryIds: sampleMode ? targetEntryIds : [],
      },
      probeEntryIds,
    };
    fs.writeFileSync(
      path.join(artifactDir, "recall-external-corpus.json"),
      `${JSON.stringify(artifact, null, 2)}\n`,
      "utf8"
    );
  });
});
