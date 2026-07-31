import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { invokeTauriCommand } from "../support/tauri-command";

interface AppLifecycleState {
  schemaVersion: number;
  lastLaunchedVersion?: string;
  releaseNotes: Record<string, { status: string }>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for baseline E2E.`);
  return value;
}

const baselineDescribe =
  process.env.AIO_E2E_PRESET_ID === "guided-flow-baseline" &&
  process.env.AIO_E2E_PHASE === "initial"
    ? describe
    : describe.skip;

baselineDescribe("Guided Flow unknown baseline", () => {
  it("shows the current release without migration work and persists lifecycle state", async () => {
    const expectedVersion = requiredEnv("AIO_E2E_EXPECTED_APP_VERSION");
    const shell = await $(
      '.guided-flow-shell[data-flow-id="app-upgrade"][data-current-step-id="summary"]'
    );
    await shell.waitForDisplayed({ timeout: 30_000 });

    const summary = await $(".upgrade-summary");
    if (
      (await summary.getAttribute("data-transition")) !== "unknown-baseline" ||
      (await summary.getAttribute("data-current-version")) !==
        expectedVersion ||
      (await summary.getAttribute("data-release-count")) !== "1" ||
      (await summary.getAttribute("data-contribution-count")) !== "0"
    ) {
      throw new Error(
        "Unknown-baseline summary did not match the fresh-install contract."
      );
    }

    const releaseVersion = await $(
      ".release-notes-step .release-version"
    ).getText();
    if (releaseVersion !== `v${expectedVersion}`) {
      throw new Error(
        `Expected v${expectedVersion}, received ${releaseVersion}.`
      );
    }
    if (await $(".upgrade-summary .migration-step").isExisting()) {
      throw new Error("Migration work was created without legacy domain data.");
    }

    await $(".guided-flow-footer .el-button--primary").click();
    await browser.waitUntil(
      async () =>
        (await shell.getAttribute("data-current-step-id")) === "complete",
      { timeout: 30_000, timeoutMsg: "Guided Flow did not reach completion." }
    );
    await $(".guided-flow-footer .el-button--primary").click();
    await shell.waitForDisplayed({ reverse: true, timeout: 30_000 });

    const appConfigDir = await invokeTauriCommand<string>("get_app_config_dir");
    const lifecyclePath = path.join(
      appConfigDir,
      "guided-flow",
      "app-lifecycle.json"
    );
    const lifecycle = JSON.parse(
      fs.readFileSync(lifecyclePath, "utf8")
    ) as AppLifecycleState;
    if (
      lifecycle.schemaVersion !== 1 ||
      lifecycle.lastLaunchedVersion !== expectedVersion ||
      lifecycle.releaseNotes[expectedVersion]?.status !== "completed"
    ) {
      throw new Error(
        `Unexpected lifecycle state: ${JSON.stringify(lifecycle)}`
      );
    }
  });
});
