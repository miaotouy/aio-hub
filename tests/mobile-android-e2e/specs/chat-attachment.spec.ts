import { switchToWebview } from "../support/appium";
import { MOBILE_E2E_MODEL_ID } from "../support/openai-conformance";
import { clickTestElement, testElement } from "../support/webview";
import { ensureFixtureImported, findFixtureTile } from "./asset-workflow.spec";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";
async function setInput(
  context: ScenarioContext,
  testId: string,
  value: string
) {
  const field = await testElement(context.driver, testId);
  const tagName = await field.getTagName();
  const isNativeInput = tagName === "input" || tagName === "textarea";
  const input = isNativeInput ? field : await field.$("input, textarea");
  await input.waitForDisplayed({ timeout: 10_000 });
  if (isNativeInput) {
    await input.clearValue();
    await input.setValue(value);
  } else {
    await input.click();
    await context.driver.keys(["Control", "a"]);
    await context.driver.keys(["Backspace"]);
    await input.addValue(value);
  }
  await input.click();
  await context.driver.keys(["Tab"]);
}

export async function configureOpenAiProfile(
  context: ScenarioContext,
  options: {
    name: string;
    baseUrl: string;
    modelId: string;
    headers?: Record<string, string>;
  }
) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-api";
  });
  await testElement(context.driver, "llm-settings-view");
  const existing = await context.driver.$(
    `[data-testid="llm-profile-card"][data-profile-name="${options.name}"]`
  );
  if (await existing.isExisting()) return;

  await clickTestElement(context.driver, "llm-profile-add");
  await clickTestElement(context.driver, "llm-preset-custom");
  await testElement(context.driver, "llm-profile-editor");
  await setInput(context, "llm-profile-name", options.name);
  await setInput(context, "llm-profile-base-url", options.baseUrl);
  await setInput(context, "llm-profile-api-key", "mobile-e2e-placeholder");
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    await clickTestElement(context.driver, "llm-profile-custom-headers");
    await testElement(context.driver, "llm-custom-headers-editor");
    await clickTestElement(context.driver, "llm-custom-header-add");
    await setInput(context, "llm-custom-header-key", key);
    await setInput(context, "llm-custom-header-value", value);
    await clickTestElement(context.driver, "llm-custom-headers-confirm");
    const headerEntry = await testElement(
      context.driver,
      "llm-profile-custom-headers"
    );
    await context.driver.waitUntil(
      async () =>
        ((await headerEntry.getAttribute("data-header-keys")) ?? "")
          .split(",")
          .includes(key),
      {
        timeout: 10_000,
        timeoutMsg: `Custom header ${key} was not committed to the profile.`,
      }
    );
  }
  await context.driver.execute(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await context.driver.waitUntil(
    async () =>
      context.driver
        .execute(() =>
          document.documentElement.classList.contains("keyboard-visible")
        )
        .then((visible) => !visible),
    { timeout: 10_000, timeoutMsg: "Keyboard did not close after input blur." }
  );
  await clickTestElement(context.driver, "llm-model-fetch", 30_000);
  await testElement(context.driver, "llm-model-fetcher", 30_000);
  const search = await context.driver.$(
    '[data-testid="llm-model-fetcher"] .search-input'
  );
  await search.setValue(options.modelId);
  await clickTestElement(context.driver, "llm-model-select-all");
  await clickTestElement(context.driver, "llm-model-add-selected");
  await clickTestElement(context.driver, "llm-profile-save");
  const saved = await context.driver.$(
    `[data-testid="llm-profile-card"][data-profile-name="${options.name}"]`
  );
  await saved.waitForDisplayed({ timeout: 20_000 });
}

async function sendFixture(context: ScenarioContext, timeoutMs: number) {
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/home";
  });
  await testElement(context.driver, "chat-home");
  await clickTestElement(context.driver, "chat-new");
  await testElement(context.driver, "chat-view");
  await clickTestElement(context.driver, "chat-add-asset");
  await testElement(context.driver, "chat-asset-picker");
  const assetRow = await context.driver.$(
    `[data-testid="chat-asset-row"][data-asset-name="${context.fixtures.image.fileName}"]`
  );
  await assetRow.waitForDisplayed({ timeout: 20_000 });
  await assetRow.click();
  await clickTestElement(context.driver, "chat-asset-confirm");
  await testElement(context.driver, "chat-pending-attachments");
  await setInput(
    context,
    "chat-message-input",
    "Verify the attached deterministic Android E2E fixture."
  );
  await clickTestElement(context.driver, "chat-send");
  const assistant = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]'
  );
  await assistant.waitForDisplayed({ timeout: timeoutMs });
  const text = (await assistant.getText()).trim();
  if (!text)
    throw new Error("Attachment lane returned an empty assistant reply.");

  await (await assistant.$(".content-body")).click();
  await clickTestElement(context.driver, "message-reply");
  const replyPreview = await testElement(context.driver, "chat-reply-preview");
  if (!(await replyPreview.getText()).includes("Attachment verified")) {
    throw new Error("Reply mode did not retain the selected message snapshot.");
  }

  await clickTestElement(context.driver, "chat-add-asset");
  await testElement(context.driver, "chat-asset-picker");
  const replyAssetRow = await context.driver.$(
    `[data-testid="chat-asset-row"][data-asset-name="${context.fixtures.image.fileName}"]`
  );
  await replyAssetRow.waitForDisplayed({ timeout: 20_000 });
  await replyAssetRow.click();
  await clickTestElement(context.driver, "chat-asset-confirm");
  await setInput(context, "chat-message-input", "Reply-mode Android E2E follow-up.");
  await clickTestElement(context.driver, "chat-send");
  const replyReference = await context.driver.$(
    '[data-message-role="user"] [data-testid="message-reply-reference"]'
  );
  await replyReference.waitForDisplayed({ timeout: timeoutMs });
  if (!(await replyReference.getText()).includes("Attachment verified")) {
    throw new Error("Reply reference was not rendered on the sent user message.");
  }
  await context.driver.waitUntil(
    async () =>
      (await context.driver.$$(
        '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]'
      ).length) >= 2,
    {
      timeout: timeoutMs,
      timeoutMsg: "Reply-mode follow-up did not receive an assistant response.",
    }
  );

  const sessionId = await context.driver.execute(() => {
    const match = window.location.hash.match(/\/chat\/([^?]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  });
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error("Could not determine the active chat session ID.");
  }
  return { text, sessionId };
}

export async function runDeterministicAttachmentScenario(
  context: ScenarioContext
) {
  if (!context.deterministicBaseUrl || !context.deterministicRequests) {
    throw new Error("Deterministic attachment server was not started.");
  }
  await ensureFixtureImported(context);
  await configureOpenAiProfile(context, {
    name: "Android E2E Mock",
    baseUrl: context.deterministicBaseUrl,
    modelId: MOBILE_E2E_MODEL_ID,
  });
  const { text: reply, sessionId } = await sendFixture(context, 60_000);
  if (!reply.includes("Attachment verified")) {
    throw new Error(`Unexpected deterministic reply: ${reply}`);
  }
  const request = context.deterministicRequests.find(
    (summary) => summary.attachmentMatch === true
  );
  if (!request) {
    throw new Error("Mock did not record a matching attachment request.");
  }

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/sessions";
  });
  await testElement(context.driver, "chat-session-list", 30_000);
  const recoveredSession = await context.driver.$(
    `[data-testid="chat-session-row"][data-session-id="${sessionId}"]`
  );
  await recoveredSession.waitForDisplayed({ timeout: 30_000 });
  await recoveredSession.click();
  await testElement(context.driver, "chat-view", 30_000);
  const recoveredMessages = await context.driver.$$(
    '[data-testid="chat-message"]'
  );
  const recoveredMessageCount = await recoveredMessages.length;
  if (recoveredMessageCount < 2) {
    throw new Error("Chat messages did not recover after app restart.");
  }
  const recoveredReplyReference = await context.driver.$(
    '[data-message-role="user"] [data-testid="message-reply-reference"]'
  );
  await recoveredReplyReference.waitForDisplayed({ timeout: 20_000 });
  if (!(await recoveredReplyReference.getText()).includes("Attachment verified")) {
    throw new Error("Reply reference did not persist after the app restart.");
  }
  const recoveredAssistant = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"]'
  );
  await recoveredAssistant.waitForDisplayed({ timeout: 20_000 });
  const copiedContent = (await recoveredAssistant.$(".content-body").getText()).trim();
  if (!copiedContent) {
    throw new Error("Recovered assistant message has no copyable text.");
  }
  await (await recoveredAssistant.$(".content-body")).click();
  await clickTestElement(context.driver, "message-copy");
  await context.driver.waitUntil(
    async () =>
      context.driver.execute(() => document.body.innerText.includes("已复制内容")),
    {
      timeout: 10_000,
      timeoutMsg: "Native clipboard write did not produce a success feedback.",
    }
  );
  const recoveredAttachment = await context.driver.$(
    ".message-item.user .attachment-item"
  );
  await recoveredAttachment.waitForDisplayed({ timeout: 20_000 });
  const attachmentPreview = await recoveredAttachment.$(
    '[data-testid="message-attachment-preview-image"]'
  );
  await attachmentPreview.waitForClickable({ timeout: 20_000 });
  await attachmentPreview.click();
  const previewHost = await testElement(
    context.driver,
    "chat-attachment-media-preview"
  );
  await context.driver.waitUntil(
    async () => (await previewHost.getAttribute("data-state")) === "ready",
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: "Chat attachment image preview did not become ready.",
    }
  );
  const previewImage = await previewHost.$("img");
  await previewImage.waitForDisplayed({ timeout: 5_000 });
  const immersivePreview = await testElement(
    context.driver,
    "media-preview-immersive"
  );
  const closePreview = await immersivePreview.$(".immersive-header button");
  await closePreview.click();
  await previewHost.waitForExist({ timeout: 10_000, reverse: true });

  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  const fixtureTile = await findFixtureTile(context);
  await (await fixtureTile.$('[data-testid="asset-open"]')).click();
  const usageList = await testElement(context.driver, "asset-usage-list");
  await context.driver.waitUntil(
    async () => Number(await usageList.getAttribute("data-usage-count")) > 0,
    { timeout: 20_000, timeoutMsg: "Chat attachment usage was not registered." }
  );
  await clickTestElement(context.driver, "asset-detail-close");

  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/home";
  });
  await testElement(context.driver, "chat-home");
  await clickTestElement(context.driver, "chat-new");
  await testElement(context.driver, "chat-view");
  const emptySessionId = await context.driver.execute(() => {
    const match = window.location.hash.match(/\/chat\/([^?]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  });
  if (typeof emptySessionId !== "string" || !emptySessionId) {
    throw new Error("Could not determine the empty chat session ID.");
  }

  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/sessions";
  });
  await testElement(context.driver, "chat-session-list");
  const sessionSort = await testElement(context.driver, "chat-session-sort");
  await sessionSort.selectByAttribute("value", "messageCount:asc");
  await context.driver.waitUntil(
    async () => {
      const firstSession = await context.driver.$('[data-testid="chat-session-row"]');
      return (await firstSession.getAttribute("data-session-id")) === emptySessionId;
    },
    {
      timeout: 10_000,
      timeoutMsg: "Session sorting did not place the empty chat first.",
    }
  );

  const sessionRow = await context.driver.$(
    `[data-testid="chat-session-row"][data-session-id="${sessionId}"]`
  );
  await sessionRow.waitForDisplayed({ timeout: 20_000 });
  await (await sessionRow.$('[data-testid="chat-session-delete"]')).click();
  const confirmDelete = await context.driver.$(".var-dialog__confirm-button");
  await confirmDelete.waitForClickable({ timeout: 10_000 });
  await confirmDelete.click();
  await sessionRow.waitForExist({ timeout: 20_000, reverse: true });

  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  const releasedTile = await findFixtureTile(context);
  await (await releasedTile.$('[data-testid="asset-open"]')).click();
  const releasedUsageList = await testElement(
    context.driver,
    "asset-usage-list"
  );
  await context.driver.waitUntil(
    async () =>
      (await releasedUsageList.getAttribute("data-usage-count")) === "0",
    {
      timeout: 20_000,
      timeoutMsg: "Session deletion did not release asset usage.",
    }
  );
  return {
    replyLength: reply.length,
    requestId: request.requestId,
    sessionId,
    recoveredMessageCount,
    clipboardWriteVerified: true,
    usageReleased: true,
  };
}

export async function runOllamaAttachmentScenario(context: ScenarioContext) {
  const modelId = context.options.ollamaModel;
  if (!modelId) throw new Error("Ollama model was not selected.");
  await ensureFixtureImported(context);
  await configureOpenAiProfile(context, {
    name: "Android E2E Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    modelId,
    headers: { Origin: "http://localhost" },
  });
  const { text: reply } = await sendFixture(context, 180_000);
  return { modelId, replyLength: reply.length };
}
