import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

const MIGRATION_COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const SENTINEL_CONTENT = "E2E cleanup sentinel: must survive legacy cleanup.\n";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for migration cleanup E2E.`);
  return value;
}

async function expectCurrentStep(stepId: string): Promise<void> {
  const shell = await $(".guided-flow-shell");
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
  for (let remaining = 0; remaining < 6; remaining += 1) {
    const shell = await $(".guided-flow-shell");
    await shell.waitForDisplayed({ timeout: 30_000 });
    if ((await shell.getAttribute("data-current-step-id")) === stepId) return;
    await $('[data-testid="guided-flow-next"]').click();
  }
  await expectCurrentStep(stepId);
}

const cleanupDescribe =
  process.env.AIO_E2E_MIGRATION_FIXTURE_ID ===
    "legacy-file-system-v1/minimal" &&
  process.env.AIO_E2E_MIGRATION_SCENARIO === "cleanup" &&
  process.env.AIO_E2E_PHASE === "initial"
    ? describe
    : describe.skip;

cleanupDescribe("Guided legacy Knowledge migration cleanup", () => {
  it("removes only managed legacy directories from a dedicated staged copy", async () => {
    const dataDir = requiredEnv("AIO_DATA_DIR");
    const artifactDir = requiredEnv("AIO_E2E_ARTIFACT_DIR");
    const sentinelPath = path.join(dataDir, "knowledge", "knowledge_meta.db");
    fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
    fs.writeFileSync(sentinelPath, SENTINEL_CONTENT, "utf8");

    await advanceToStep("contribution:knowledge-migration:plan");
    await $('[data-testid="migration-plan"]').waitForDisplayed();

    await $(".backup-step .confirm-card:nth-of-type(1) .el-checkbox").click();
    await $(".backup-step .confirm-card:nth-of-type(2) .el-checkbox").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="guided-flow-next"]').getAttribute(
          "disabled"
        )) === null,
      {
        timeout: 10_000,
        timeoutMsg: "Migration confirmation did not enable Next.",
      }
    );

    await $('[data-testid="guided-flow-next"]').click();
    await expectCurrentStep("contribution:knowledge-migration:result");
    await $('[data-testid="migration-verify"]').waitForDisplayed({
      timeout: 60_000,
    });
    await $('[data-testid="guided-flow-next"]').click();
    await expectCurrentStep("contribution:knowledge-migration:cleanup");

    await $(".cleanup-step .el-radio:nth-of-type(2)").click();
    const confirmation = await $(".cleanup-step .el-input__inner");
    await confirmation.setValue("DELETE");
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="guided-flow-next"]').getAttribute(
          "disabled"
        )) === null,
      {
        timeout: 10_000,
        timeoutMsg: "Cleanup confirmation did not enable Next.",
      }
    );

    await $('[data-testid="guided-flow-next"]').click();
    await expectCurrentStep("complete");

    const expectedRemoved = [
      path.join(dataDir, "knowledge", "bases"),
      path.join(dataDir, "knowledge", "vectors"),
    ];
    const recallDb = path.join(dataDir, "recall", "recall.db");
    const vectorDb = path.join(dataDir, "recall", "recall-vectors.db");
    const guidedFlowState = path.join(
      dataDir,
      "guided-flow",
      "guided-flow-state.json"
    );
    const migratedBase = await invokeTauriCommand<{ id: string } | null>(
      "recall_load_base_meta",
      { recallId: MIGRATION_COLLECTION_ID }
    );

    if (
      expectedRemoved.some((target) => fs.existsSync(target)) ||
      !fs.existsSync(recallDb) ||
      !fs.existsSync(vectorDb) ||
      !fs.existsSync(sentinelPath) ||
      fs.readFileSync(sentinelPath, "utf8") !== SENTINEL_CONTENT ||
      !fs.existsSync(guidedFlowState) ||
      !migratedBase ||
      migratedBase.id !== MIGRATION_COLLECTION_ID
    ) {
      throw new Error(
        "Legacy cleanup removed data outside its managed legacy directories."
      );
    }

    const persistedFlow = fs.readFileSync(guidedFlowState, "utf8");
    if (
      !persistedFlow.includes('"mainStatus": "completed"') ||
      !persistedFlow.includes('"cleanupChoice": "cleanup"') ||
      !persistedFlow.includes('"removedPaths"')
    ) {
      throw new Error(
        "Guided Flow did not retain the completed migration report after cleanup."
      );
    }

    fs.writeFileSync(
      path.join(artifactDir, "migration-cleanup-result.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          phase: "cleanup",
          removed: expectedRemoved.map((target) =>
            path.relative(dataDir, target)
          ),
          retained: [
            path.relative(dataDir, recallDb),
            path.relative(dataDir, vectorDb),
            path.relative(dataDir, sentinelPath),
            path.relative(dataDir, guidedFlowState),
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await $('[data-testid="guided-flow-next"]').click();
    await browser.waitUntil(
      async () =>
        !(await browser.execute(() =>
          Boolean(document.querySelector(".guided-flow-shell"))
        )),
      {
        timeout: 15_000,
        timeoutMsg: "Guided Flow did not close after cleanup completed.",
      }
    );
  });
});
