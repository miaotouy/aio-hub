import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

interface MigrationReport {
  sourceFingerprint: string;
  mainStatus: string;
  vectorStatus: string;
  sourceCollections: number;
  migratedCollections: number;
  sourceEntries: number;
  migratedEntries: number;
  sourceVectors: number;
  migratedVectors: number;
  pendingVectors: number;
  issues: Array<unknown>;
}

const MIGRATION_COLLECTION_ID = "11111111-1111-4111-8111-111111111111";

interface MigrationPreview {
  migrationId: string;
  mainStatus: string;
  vectorStatus: string;
  sourceCollections: number;
  sourceEntries: number;
  sourceVectors: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for migration E2E.`);
  return value;
}

function expectedCount(name: string): number {
  const value = Number(requiredEnv(name));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

async function expectCurrentStep(stepId: string): Promise<void> {
  const shell = await $('.guided-flow-shell');
  await shell.waitForDisplayed({ timeout: 30_000 });
  await browser.waitUntil(
    async () => (await shell.getAttribute("data-current-step-id")) === stepId,
    {
      timeout: 30_000,
      timeoutMsg: `Guided Flow did not enter ${stepId}.`,
    }
  );
}

async function advanceToStep(stepId: string): Promise<void> {
  for (let remaining = 0; remaining < 5; remaining += 1) {
    const shell = await $('.guided-flow-shell');
    await shell.waitForDisplayed({ timeout: 30_000 });
    if ((await shell.getAttribute("data-current-step-id")) === stepId) return;
    await $('.guided-flow-footer .el-button--primary').click();
  }
  await expectCurrentStep(stepId);
}

const migrationDescribe =
  process.env.AIO_E2E_MIGRATION_FIXTURE_ID === "legacy-file-system-v1/minimal" &&
  process.env.AIO_E2E_PHASE === "initial"
    ? describe
    : describe.skip;

migrationDescribe("Guided legacy Knowledge migration", () => {
  it("detects without importing, migrates through visible confirmations, and records a cross-checked report", async () => {
    const expectedCollections = expectedCount("AIO_E2E_MIGRATION_EXPECTED_COLLECTIONS");
    const expectedEntries = expectedCount("AIO_E2E_MIGRATION_EXPECTED_ENTRIES");
    const expectedVectors = expectedCount("AIO_E2E_MIGRATION_EXPECTED_VECTORS");
    const artifactDir = requiredEnv("AIO_E2E_ARTIFACT_DIR");

    await advanceToStep("contribution:knowledge-migration:discovery");
    await $('.migration-step').waitForDisplayed();
    if (
      !(await $('.migration-step .metric-grid > div:nth-child(1)').getText()).includes(
        String(expectedCollections)
      ) ||
      !(await $('.migration-step .metric-grid > div:nth-child(2)').getText()).includes(
        String(expectedEntries)
      ) ||
      !(await $('.migration-step .metric-grid > div:nth-child(3)').getText()).includes(
        String(expectedVectors)
      )
    ) {
      throw new Error("Guided Flow did not display the staged legacy source counts.");
    }

    await invokeTauriCommand<void>("recall_initialize");
    const before = await invokeTauriCommand<MigrationReport | null>(
      "recall_inspect_legacy_migration"
    );
    const beforeBase = await invokeTauriCommand<{ id: string } | null>(
      "recall_load_base_meta",
      { recallId: MIGRATION_COLLECTION_ID }
    );
    if (
      !before ||
      before.mainStatus !== "not_started" ||
      before.vectorStatus !== "not_started" ||
      beforeBase !== null
    ) {
      throw new Error("Legacy data was imported before the user confirmed migration.");
    }

    await $('.guided-flow-footer .el-button--primary').click();
    await expectCurrentStep("contribution:knowledge-migration:preview");
    await $('.guided-flow-footer .el-button--primary').click();
    await expectCurrentStep("contribution:knowledge-migration:backup");

    await $('.backup-step .confirm-card:nth-of-type(1) .el-checkbox').click();
    await $('.backup-step .confirm-card:nth-of-type(2) .el-checkbox').click();
    await browser.waitUntil(
      async () =>
        (await $('.guided-flow-footer .el-button--primary').getAttribute("disabled")) ===
        null,
      { timeout: 10_000, timeoutMsg: "Migration confirmation did not enable Next." }
    );

    await $('.guided-flow-footer .el-button--primary').click();
    await expectCurrentStep("contribution:knowledge-migration:execute");
    await $('.execute-step .el-result').waitForDisplayed({
      timeout: 60_000,
    });
    await $('.guided-flow-footer .el-button--primary').click();
    await expectCurrentStep("contribution:knowledge-migration:verify");
    await $('.verify-step .status-grid').waitForDisplayed();

    const preview = await invokeTauriCommand<MigrationPreview | null>(
      "recall_preview_legacy_migration"
    );
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
      !preview ||
      !report ||
      preview.migrationId !== requiredEnv("AIO_E2E_MIGRATION_ID") ||
      report.mainStatus !== "completed" ||
      report.vectorStatus !== "completed" ||
      report.sourceCollections !== expectedCollections ||
      report.migratedCollections !== expectedCollections ||
      report.sourceEntries !== expectedEntries ||
      report.migratedEntries !== expectedEntries ||
      report.sourceVectors !== expectedVectors ||
      report.migratedVectors !== expectedVectors ||
      report.pendingVectors !== 0 ||
      report.issues.length !== 0 ||
      !migratedBase ||
      migratedBase.id !== MIGRATION_COLLECTION_ID ||
      coverage.totalEntries !== expectedEntries ||
      coverage.cachedEntries !== expectedVectors ||
      coverage.missingEntries !== 0
    ) {
      throw new Error(
        `Migration UI and production IPC results did not match the fixture manifest: ${JSON.stringify({
          preview,
          report,
          migratedBase,
          coverage,
          expected: { expectedCollections, expectedEntries, expectedVectors },
        })}`
      );
    }

    await $('[data-testid="guided-flow-next"]').click();
    await expectCurrentStep("contribution:knowledge-migration:cleanup");
    await $('[data-testid="migration-cleanup"]').waitForDisplayed();
    await $('[data-testid="guided-flow-next"]').click();
    await expectCurrentStep("contribution:knowledge-migration:complete");
    await $('[data-testid="guided-flow-next"]').click();
    await expectCurrentStep("complete");
    await $('[data-testid="guided-flow-next"]').click();
    await browser.waitUntil(
      async () => {
        const isOpen = await browser.execute(() =>
          Boolean(document.querySelector('.guided-flow-shell'))
        );
        if (isOpen) return false;
        await browser.pause(500);
        return !(await browser.execute(() =>
          Boolean(document.querySelector('.guided-flow-shell'))
        ));
      },
      {
        timeout: 15_000,
        timeoutMsg: "Guided Flow did not persist the completed migration flow.",
      }
    );

    fs.writeFileSync(
      path.join(artifactDir, "migration-result.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          phase: "migrated",
          migrationId: preview.migrationId,
          sourceFingerprint: report.sourceFingerprint,
          collections: report.migratedCollections,
          entries: report.migratedEntries,
          vectors: report.migratedVectors,
          pendingVectors: report.pendingVectors,
          issues: report.issues.length,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });
});
