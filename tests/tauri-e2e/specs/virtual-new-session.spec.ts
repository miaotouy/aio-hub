import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import {
  recallRuntimeFixture,
  requiredE2eEnv,
} from "../support/recall-runtime-fixture";

const dataDir = requiredE2eEnv("AIO_DATA_DIR");
const agentId = recallRuntimeFixture.manifest.agent.id;

function persistedSessions(): Array<{ id: string }> {
  const indexPath = path.join(dataDir, "llm-chat", "sessions-index.json");
  if (!fs.existsSync(indexPath)) return [];
  return (
    JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      sessions: Array<{ id: string }>;
    }
  ).sessions;
}

describe("virtual new Chat session persistence", () => {
  it("promotes the first sent message into a visible, persisted history session", async () => {
    await browser.waitUntil(
      async () => {
        for (const handle of await browser.getWindowHandles()) {
          await browser.switchToWindow(handle);
          if (
            (await browser.getUrl()).replace(/\/$/, "") ===
            (
              process.env.AIO_E2E_FRONTEND_URL || "http://localhost:1420/"
            ).replace(/\/$/, "")
          )
            return true;
        }
        return false;
      },
      { timeout: 90_000, timeoutMsg: "Main Tauri window was not available" }
    );
    await browser.execute(() => {
      const menuItem = document.querySelector<HTMLElement>(
        `[data-index="/llm-chat"]`
      );
      if (menuItem) {
        menuItem.click();
        return;
      }
      window.history.pushState({}, "", "/llm-chat");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await $('[data-testid="chat-message-input"]').waitForDisplayed({
      timeout: 60_000,
    });
    const agent = await $(
      `[data-testid="chat-agent-item"][data-agent-id="${agentId}"]`
    );
    await agent.waitForDisplayed({ timeout: 30_000 });
    await agent.click();

    // Start through the real UI so the draft takes the same path as a user message.
    const newSession = await $('[data-testid="chat-new-session"]');
    await newSession.waitForClickable({ timeout: 20_000 });
    await newSession.click();
    const before = new Set(persistedSessions().map((session) => session.id));
    const content = `E2E virtual session ${Date.now()}`;
    const editor = await $('[data-testid="chat-message-editor"]');
    const textarea = await editor.$("textarea");
    if (await textarea.isExisting()) {
      await textarea.setValue(content);
    } else {
      await (await editor.$('[contenteditable="true"]')).setValue(content);
    }
    await $('[data-testid="chat-send-message"]').click();

    let newId: string | undefined;
    await browser.waitUntil(
      async () => {
        newId = persistedSessions().find(
          (session) => !before.has(session.id)
        )?.id;
        if (!newId) return false;
        const file = path.join(
          dataDir,
          "llm-chat",
          "sessions",
          `${newId}.json`
        );
        if (!fs.existsSync(file)) return false;
        const detail = JSON.parse(fs.readFileSync(file, "utf8")) as {
          nodes: Record<string, { content: string }>;
        };
        return Object.values(detail.nodes).some(
          (node) => node.content === content
        );
      },
      {
        timeout: 30_000,
        interval: 200,
        timeoutMsg:
          "First message did not enter the persisted session index and detail",
      }
    );

    const historyButton = await $('[data-testid="chat-session-list-button"]');
    await historyButton.click();
    const historyItem = await $(
      `[data-testid="chat-session-item"][data-session-id="${newId}"]`
    );
    await historyItem.waitForDisplayed({ timeout: 20_000 });
  });
});
