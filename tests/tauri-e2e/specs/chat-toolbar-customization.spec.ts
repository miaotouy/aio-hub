import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import {
  recallRuntimeFixture,
  requiredE2eEnv,
} from "../support/recall-runtime-fixture";

const settingsPath = path.join(
  requiredE2eEnv("AIO_DATA_DIR"),
  "llm-chat",
  "chat-settings.json"
);
function persistedLayout(): unknown {
  if (!fs.existsSync(settingsPath)) return null;
  return (
    JSON.parse(fs.readFileSync(settingsPath, "utf8")).uiPreferences
      ?.inputToolbar ?? null
  );
}
async function openCustomizer() {
  await $('[data-testid="chat-toolbar-more"]').click();
  const entry = await $('[data-testid="chat-toolbar-customize"]');
  await entry.waitForClickable();
  await entry.click();
  await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed();
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const dialog = document.querySelector<HTMLElement>(
          ".input-toolbar-customizer-dialog"
        );
        const backdrop = dialog?.closest<HTMLElement>(".base-dialog-backdrop");
        return Boolean(
          dialog &&
          backdrop &&
          getComputedStyle(dialog).opacity === "1" &&
          getComputedStyle(backdrop).opacity === "1"
        );
      }),
    { timeout: 5_000, timeoutMsg: "Toolbar editor transition did not settle" }
  );
}
async function configureWritingLayout() {
  await $('[data-testid="chat-toolbar-layout-compact"]').click();
  await $('[data-testid="chat-toolbar-pin"][data-action-id="macro"]').click();
}
async function openAction(id: string) {
  const pinned = await $(`button.toolbar-action[data-action-id="${id}"]`);
  if (await pinned.isExisting()) {
    await pinned.click();
    return;
  }
  await $('[data-testid="chat-toolbar-more"]').click();
  const item = await $(
    `.input-toolbar-menu .menu-action[data-action-id="${id}"]`
  );
  await item.waitForClickable();
  await item.click();
}

// Exercises user choices and actual popover behavior in the Tauri WebView, with an isolated data root.
describe("Chat toolbar customization", () => {
  it("cancels safely, persists selected pins, and opens collected selectors", async () => {
    await browser.waitUntil(
      async () => {
        for (const handle of await browser.getWindowHandles()) {
          await browser.switchToWindow(handle);
          const url = new URL(await browser.getUrl());
          const expected = new URL(
            process.env.AIO_E2E_FRONTEND_URL || "http://localhost:1420/"
          );
          if (
            ["localhost", "127.0.0.1"].includes(url.hostname) &&
            url.port === expected.port &&
            url.pathname === "/"
          )
            return true;
        }
        return false;
      },
      { timeout: 90_000, timeoutMsg: "Main Tauri window unavailable" }
    );
    await browser.execute(() => {
      const menuItem = document.querySelector<HTMLElement>(
        '[data-index="/llm-chat"]'
      );
      if (menuItem) menuItem.click();
      else {
        window.history.pushState({}, "", "/llm-chat");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    });
    await $('[data-testid="chat-message-input"]').waitForDisplayed({
      timeout: 60_000,
    });
    const agent = await $(
      `[data-testid="chat-agent-item"][data-agent-id="${recallRuntimeFixture.manifest.agent.id}"]`
    );
    await agent.waitForClickable({ timeout: 30_000 });
    await agent.click();
    const original = persistedLayout();
    await openCustomizer();
    await configureWritingLayout();
    await $('[data-testid="chat-toolbar-cancel"]').click();
    await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed({
      reverse: true,
    });
    if (JSON.stringify(persistedLayout()) !== JSON.stringify(original))
      throw new Error("Cancel changed the persisted toolbar layout");

    await openCustomizer();
    await configureWritingLayout();
    await $('[data-testid="chat-toolbar-save"]').click();
    await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed({
      reverse: true,
    });
    await browser.waitUntil(
      () => {
        const layout = persistedLayout() as {
          pinnedActionIds?: string[];
          quickActions?: { mode?: string };
        } | null;
        return (
          JSON.stringify(layout?.pinnedActionIds) ===
            JSON.stringify([
              "attachment",
              "temporary-model",
              "knowledge",
              "macro",
            ]) && layout?.quickActions?.mode === "menu"
        );
      },
      {
        timeout: 10_000,
        timeoutMsg: "Saved toolbar choices were not persisted",
      }
    );

    await openAction("macro");
    await $(".input-panel-host .macro-selector").waitForDisplayed();
    await browser.keys("Escape");
    await $(".input-panel-host .macro-selector").waitForDisplayed({
      reverse: true,
    });
    await openAction("sessions");
    await $(".input-panel-host .mini-session-list").waitForDisplayed();
    await browser.keys("Escape");
    await $(".input-panel-host .mini-session-list").waitForDisplayed({
      reverse: true,
    });
    await openAction("knowledge");
    await $(
      '[data-testid="chat-knowledge-reference-selector"]'
    ).waitForDisplayed();
    await browser.keys("Escape");
    await $(
      '[data-testid="chat-knowledge-reference-selector"]'
    ).waitForDisplayed({ reverse: true });
    await openCustomizer();
    await browser.saveScreenshot(
      path.join(
        requiredE2eEnv("AIO_E2E_ARTIFACT_DIR"),
        "chat-toolbar-customizer.png"
      )
    );
    await $('[data-testid="chat-toolbar-cancel"]').click();

    // Full placement overflows in the real Chat workspace while preserving access to all actions.
    await openCustomizer();
    await $('[data-testid="chat-toolbar-layout-full"]').click();
    await $('[data-testid="chat-toolbar-save"]').click();
    await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed({
      reverse: true,
    });
    const visiblePins = await browser.execute(
      () => document.querySelectorAll("button.toolbar-action").length
    );
    const fullPins = (persistedLayout() as { pinnedActionIds: string[] })
      .pinnedActionIds;
    if (visiblePins >= fullPins.length)
      throw new Error("Constrained workspace did not collect overflow actions");
    await $('[data-testid="chat-toolbar-more"]').click();
    await $(
      '.input-toolbar-menu .menu-action[data-action-id="analyze-context"]'
    ).waitForDisplayed();
    await browser.keys("Escape");
    await openCustomizer();
    await configureWritingLayout();
    await $('[data-testid="chat-toolbar-save"]').click();
    await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed({
      reverse: true,
    });

    // Use the existing UI to create a genuine detached input WebView, then edit in the main window.
    const mainHandle = await browser.getWindowHandle();
    await $(
      ".chat-message-input .detachable-handle .menu-container > .action-btn"
    ).click();
    await $(
      ".chat-message-input .detachable-handle .expanded-menu .menu-action-btn"
    ).click();
    let detachedHandle = "";
    await browser.waitUntil(
      async () => {
        for (const handle of await browser.getWindowHandles()) {
          if (handle === mainHandle) continue;
          await browser.switchToWindow(handle);
          if (
            decodeURIComponent(await browser.getUrl()).includes(
              "llm-chat:chat-input"
            )
          ) {
            detachedHandle = handle;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000, timeoutMsg: "Detached input WebView unavailable" }
    );
    await $('[data-testid="chat-toolbar-more"]').waitForDisplayed({
      timeout: 30_000,
    });
    await $('[data-testid="chat-toolbar-more"]').waitForClickable({
      timeout: 15_000,
    });
    await $('[data-testid="chat-toolbar-more"]').click();
    await $('[data-testid="chat-toolbar-customize"]').click();
    await browser.switchToWindow(mainHandle);
    await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed({
      timeout: 15_000,
    });
    await $('[data-testid="chat-toolbar-layout-compact"]').click();
    await $(
      '[data-testid="chat-toolbar-pin"][data-action-id="streaming"]'
    ).click();
    await $('[data-testid="chat-toolbar-save"]').click();
    await $('[data-testid="chat-toolbar-customizer"]').waitForDisplayed({
      reverse: true,
    });
    await browser.switchToWindow(detachedHandle);
    await $(
      'button.toolbar-action[data-action-id="streaming"]'
    ).waitForDisplayed({ timeout: 20_000 });
    await browser.saveScreenshot(
      path.join(
        requiredE2eEnv("AIO_E2E_ARTIFACT_DIR"),
        "chat-toolbar-detached.png"
      )
    );
    await $(".detachable-handle .menu-container > .action-btn").click();
    await $(".detachable-handle .expanded-menu .menu-action-btn").click();
    await browser.switchToWindow(mainHandle);
    await $('[data-testid="chat-message-input"]').waitForDisplayed({
      timeout: 20_000,
    });
  });
});
