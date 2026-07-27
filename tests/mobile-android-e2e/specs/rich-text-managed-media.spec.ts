import { switchToWebview } from "../support/appium";
import { MOBILE_E2E_MODEL_ID } from "../support/openai-conformance";
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
    modelId: MOBILE_E2E_MODEL_ID,
  });

  const assetId = await sendRichTextManagedAsset(context);
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

  await image.click();
  const immersive = await testElement(
    context.driver,
    "media-preview-immersive"
  );
  const close = await immersive.$(".immersive-header button");
  await close.click();
  await immersive.waitForExist({ timeout: 10_000, reverse: true });

  const assistant = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]'
  );
  await assistant.waitForDisplayed({ timeout: 30_000 });

  return { assetId, sourceKind: "managed-preview" };
}
