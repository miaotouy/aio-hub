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
  it("publishes read-only release notes without creating migration work", async () => {
    const expectedVersion = requiredEnv("AIO_E2E_EXPECTED_APP_VERSION");
    const stableNotificationPrefix = `release-notes:${expectedVersion}:r`;
    const body = await $("body");
    await body.waitForExist();

    await browser.waitUntil(
      async () =>
        browser.execute((notificationPrefix) => {
          const stored = JSON.parse(
            localStorage.getItem("app-notifications") ?? "[]"
          ) as Array<{ id: string }>;
          return stored.some((item) => item.id.startsWith(notificationPrefix));
        }, stableNotificationPrefix),
      {
        timeout: 30_000,
        timeoutMsg: "Release-note notification was not persisted.",
      }
    );

    if (await $(".guided-flow-shell").isExisting()) {
      throw new Error(
        "Release notes created a Guided Flow without migration work."
      );
    }

    await $(".notification-bell .bell-btn").click();
    const releaseNotification = await $(
      `.notification-item*=${`AIO Hub v${expectedVersion} 版本说明`}`
    );
    await releaseNotification.waitForDisplayed({ timeout: 10_000 });
    await releaseNotification.click();

    const viewer = await $("[data-testid='release-notes-viewer']");
    await viewer.waitForDisplayed({ timeout: 10_000 });
    const versionLabel = await $(
      "[data-testid='release-notes-viewer'] .release-meta strong"
    ).getText();
    if (versionLabel !== `v${expectedVersion}`) {
      throw new Error(
        `Expected read-only release notes for v${expectedVersion}, received ${versionLabel}.`
      );
    }
    if (await $(".migration-step").isExisting()) {
      throw new Error("Migration UI appeared inside the release-notes reader.");
    }

    await browser.keys(["Escape"]);
    await viewer.waitForDisplayed({ reverse: true, timeout: 10_000 });

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
