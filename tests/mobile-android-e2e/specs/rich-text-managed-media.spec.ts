import { switchToWebview } from "../support/appium";
import { MOBILE_E2E_RICH_TEXT_MODEL_ID } from "../support/openai-conformance";
import { clickTestElement, testElement } from "../support/webview";
import { ensureFixtureImported } from "./asset-workflow.spec";
import { configureOpenAiProfile } from "./chat-attachment.spec";
import type { ScenarioContext } from "./context";

async function sendRichTextManagedAsset(context: ScenarioContext) {
  await switchToWebview(context.driver);
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
  const assetId = await assetRow.getAttribute("data-asset-id");
  if (!assetId) throw new Error("The selected RichText asset has no asset ID.");
  await assetRow.click();
  await clickTestElement(context.driver, "chat-asset-confirm");
  await testElement(context.driver, "chat-pending-attachments");

  const input = await testElement(context.driver, "chat-message-input");
  await input.setValue(
    `Managed Markdown attachment:\n\n![Android fixture](asset://${assetId})`
  );
  await clickTestElement(context.driver, "chat-send");
  return assetId;
}

export async function runRichTextManagedMediaScenario(
  context: ScenarioContext
) {
  if (!context.deterministicBaseUrl) {
    throw new Error(
      "RichText managed media requires the deterministic server."
    );
  }
  await ensureFixtureImported(context);
  await configureOpenAiProfile(context, {
    name: "Android E2E RichText Media",
    baseUrl: context.deterministicBaseUrl,
    modelId: MOBILE_E2E_RICH_TEXT_MODEL_ID,
  });

  const assetId = await sendRichTextManagedAsset(context);
  const streamedMarkdownMounted = await context.driver.waitUntil(
    async () =>
      context.driver.execute(() => {
        const message = document.querySelector<HTMLElement>(
          '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="generating"]'
        );
        return Boolean(
          message
            ?.querySelector(".md-heading")
            ?.textContent?.includes("Android assistant Markdown")
        );
      }),
    {
      timeout: 15_000,
      interval: 100,
      timeoutMsg:
        "Streaming assistant Markdown was not mounted before completion.",
    }
  );
  if (!streamedMarkdownMounted) {
    throw new Error(
      "Streaming assistant Markdown was not rendered before completion."
    );
  }

  const userMessage = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="user"]'
  );
  await userMessage.waitForDisplayed({ timeout: 30_000 });
  const managedMedia = await userMessage.$(
    `[data-testid="rich-text-managed-media"][data-asset-id="${assetId}"]`
  );
  await managedMedia.waitForDisplayed({ timeout: 30_000 });
  const previewHost = await managedMedia.$(".media-preview-host");
  await context.driver.waitUntil(
    async () => (await previewHost.getAttribute("data-state")) === "ready",
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: "RichText managed image preview did not become ready.",
    }
  );
  const image = await previewHost.$("img");
  await image.waitForDisplayed({ timeout: 10_000 });
  const source = await image.getAttribute("src");
  if (!source?.startsWith("http://aio-asset.localhost/")) {
    throw new Error(
      "RichText managed media did not receive a managed preview URL."
    );
  }

  // The streamed assistant response can extend the chat and auto-scroll it away
  // from the user-owned inline preview. Return the preview to the viewport
  // before using the real touch/click path.
  await image.scrollIntoView({ block: "center", inline: "center" });
  await image.waitForClickable({ timeout: 10_000 });
  await image.click();
  const immersive = await testElement(
    context.driver,
    "media-preview-immersive"
  );
  const viewer = await immersive.$(".media-image-viewer");
  await viewer.waitForDisplayed({ timeout: 10_000 });
  await viewer.doubleClick();
  await context.driver.waitUntil(
    async () => (await viewer.getAttribute("data-scale")) === "2",
    {
      timeout: 5_000,
      interval: 100,
      timeoutMsg:
        "Managed image did not zoom to 2x after a WebView double-click.",
    }
  );
  const close = await immersive.$(".immersive-header button");
  await close.click();
  await immersive.waitForExist({ timeout: 10_000, reverse: true });

  const assistant = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]'
  );
  await assistant.waitForDisplayed({ timeout: 30_000 });

  const heading = await assistant.$(".md-heading");
  await heading.waitForDisplayed({ timeout: 15_000 });
  if (!(await heading.getText()).includes("Android assistant Markdown")) {
    throw new Error("Assistant Markdown heading did not render in the chat.");
  }
  const code = await assistant.$('[data-testid="rich-text-code-block"]');
  await code.waitForDisplayed({ timeout: 15_000 });
  if (!(await code.getText()).includes("const renderedInChat = true;")) {
    throw new Error(
      "Assistant Markdown code block did not render in the chat."
    );
  }
  const formula = await assistant.$(".katex-inline .katex");
  await formula.waitForDisplayed({ timeout: 15_000 });
  const assistantSelector =
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]';
  const htmlFallback = await context.driver.waitUntil(
    async () =>
      context.driver.execute((selector) => {
        const message = document.querySelector<HTMLElement>(selector);
        if (!message) return null;
        return {
          literalTokens: Array.from(message.querySelectorAll(".md-html")).map(
            (node) => node.textContent ?? ""
          ),
          text: message.innerText,
          mountedUnsafeElement: Boolean(
            message.querySelector('[data-e2e-untrusted="1"]')
          ),
        };
      }, assistantSelector),
    {
      timeout: 15_000,
      interval: 200,
      timeoutMsg: "Assistant raw HTML tags did not reach the literal fallback.",
    }
  );
  if (
    !htmlFallback ||
    htmlFallback.literalTokens.length < 2 ||
    !htmlFallback.literalTokens.some((token) =>
      token.includes("data-e2e-untrusted")
    ) ||
    !htmlFallback.text.includes("literal HTML")
  ) {
    throw new Error(
      "Assistant HTML fallback did not preserve its literal text."
    );
  }
  if (htmlFallback.mountedUnsafeElement) {
    throw new Error(
      "Assistant raw HTML was mounted as an interactive DOM node."
    );
  }

  const request = context.deterministicRequests?.find(
    (summary) => summary.mode === "rich-text"
  );
  if (!request || request.sseEventCount !== 5) {
    throw new Error("RichText chat reply did not use the expected SSE stream.");
  }

  return {
    assetId,
    sourceKind: "managed-preview",
    assistantMarkdown: true,
    assistantRawHtmlLiteral: true,
  };
}
