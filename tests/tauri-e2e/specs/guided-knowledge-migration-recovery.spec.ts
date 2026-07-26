import fs from "node:fs";
import path from "node:path";
import { browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

interface MigrationResultArtifact {
  migrationId: string;
  sourceFingerprint: string;
  collections: number;
  entries: number;
  vectors: number;
  pendingVectors: number;
  issues: number;
}

const MIGRATION_COLLECTION_ID = "11111111-1111-4111-8111-111111111111";

interface MigrationReport {
  sourceFingerprint: string;
  mainStatus: string;
  vectorStatus: string;
  migratedCollections: number;
  migratedEntries: number;
  migratedVectors: number;
  pendingVectors: number;
  issues: Array<unknown>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for migration recovery E2E.`);
  return value;
}

const recoveryDescribe =
  process.env.AIO_E2E_MIGRATION_FIXTURE_ID === "legacy-file-system-v1/minimal" &&
  process.env.AIO_E2E_PHASE === "recovery"
    ? describe
    : describe.skip;

recoveryDescribe("Guided legacy Knowledge migration recovery", () => {
  it("keeps the completed report and imported data after a second Tauri launch", async () => {
    const artifactPath = path.join(
      requiredEnv("AIO_E2E_ARTIFACT_DIR"),
      "migration-result.json"
    );
    const initial = JSON.parse(
      fs.readFileSync(artifactPath, "utf8")
    ) as MigrationResultArtifact;
    await invokeTauriCommand<void>("recall_initialize");
    const report = await invokeTauriCommand<MigrationReport | null>(
      "recall_inspect_legacy_migration"
    );
    const migratedBase = await invokeTauriCommand<{ id: string } | null>(
      "recall_load_base_meta",
      { recallId: MIGRATION_COLLECTION_ID }
    );
    const coverage = await invokeTauriCommand<{
      totalEntries: number;
      cachedEntries: number;
      missingEntries: number;
    }>("recall_check_vector_coverage", {
      recallIds: [MIGRATION_COLLECTION_ID],
      modelId: "e2e/simulated-embedding",
    });

    if (
      !report ||
      report.mainStatus !== "completed" ||
      report.vectorStatus !== "completed" ||
      report.sourceFingerprint !== initial.sourceFingerprint ||
      report.migratedCollections !== initial.collections ||
      report.migratedEntries !== initial.entries ||
      report.migratedVectors !== initial.vectors ||
      report.pendingVectors !== initial.pendingVectors ||
      report.issues.length !== initial.issues ||
      !migratedBase ||
      migratedBase.id !== MIGRATION_COLLECTION_ID ||
      coverage.totalEntries !== initial.entries ||
      coverage.cachedEntries !== initial.vectors ||
      coverage.missingEntries !== 0
    ) {
      throw new Error("Completed migration data was not restored consistently after restart.");
    }

    await browser.waitUntil(
      async () =>
        !(await browser.execute(() =>
          Boolean(document.querySelector(".guided-flow-shell"))
        )),
      {
        timeout: 15_000,
        timeoutMsg: "A completed migration was unexpectedly queued again after restart.",
      }
    );
  });
});
