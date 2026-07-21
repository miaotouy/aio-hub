import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

interface ExternalCorpusArtifact {
  phase: "inspected" | "imported" | "vectorized";
  import: { collectionId: string; entryCount: number };
  vectorization: { cachedEntries: number; missingEntries: number };
  recovery?: {
    entryCount: number;
    cachedEntries: number;
    loadedVectorCount: number;
    dimension: number;
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for external corpus recovery.`);
  return value;
}

const externalCorpusRecoveryDescribe =
  process.env.AIO_E2E_CORPUS_MODE === "external-full" &&
  process.env.AIO_E2E_FIXTURE_MODE === "verify" &&
  process.env.AIO_E2E_PHASE === "recovery" &&
  process.env.AIO_E2E_ACTIVE_SPEC?.includes("recall-external-corpus-recovery")
    ? describe
    : describe.skip;

externalCorpusRecoveryDescribe("Recall external corpus recovery", () => {
  it("reads the imported vectors after a second Tauri launch without reimporting", async function () {
    this.timeout(180_000);

    const artifactDir = requiredEnv("AIO_E2E_ARTIFACT_DIR");
    const modelId = requiredEnv("AIO_E2E_EMBEDDING_MODEL_ID");
    const dimension = Number(requiredEnv("AIO_E2E_EMBEDDING_DIMENSION"));
    const artifactPath = path.join(artifactDir, "recall-external-corpus.json");
    const artifact = JSON.parse(
      fs.readFileSync(artifactPath, "utf8")
    ) as ExternalCorpusArtifact;
    const { collectionId, entryCount } = artifact.import;

    await invokeTauriCommand<void>("recall_initialize");
    const entryIds = await invokeTauriCommand<string[]>(
      "recall_list_entry_ids",
      { recallId: collectionId }
    );
    const coverage = await invokeTauriCommand<{
      totalEntries: number;
      cachedEntries: number;
      missingEntries: number;
    }>("recall_check_vector_coverage", {
      recallIds: [collectionId],
      modelId,
    });
    const loaded = await invokeTauriCommand<{
      loadedCount: number;
      dimension: number;
    }>("recall_load_model_vectors", {
      recallId: collectionId,
      modelId,
    });
    if (
      entryIds.length !== entryCount ||
      coverage.totalEntries !== entryCount ||
      coverage.cachedEntries !== entryCount ||
      coverage.missingEntries !== 0 ||
      loaded.loadedCount !== entryCount ||
      loaded.dimension !== dimension
    ) {
      throw new Error("External corpus vectors did not survive the process restart.");
    }

    await browser.execute(() => {
      window.history.pushState({}, "", "/recall");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const workspace = await $('[data-testid="recall-workspace"]');
    await workspace.waitForDisplayed({ timeout: 30_000 });
    await browser.waitUntil(
      async () => (await workspace.getAttribute("data-recall-id")) === collectionId,
      {
        timeout: 30_000,
        timeoutMsg: "Recall UI did not restore the imported collection after restart.",
      }
    );

    artifact.recovery = {
      entryCount: entryIds.length,
      cachedEntries: coverage.cachedEntries,
      loadedVectorCount: loaded.loadedCount,
      dimension: loaded.dimension,
    };
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  });
});
