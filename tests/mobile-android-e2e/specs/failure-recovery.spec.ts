import { switchToNative, switchToWebview } from "../support/appium";
import { chooseDocumentsUiFile } from "../support/android-selectors";
import {
  MOBILE_E2E_DELAYED_MODEL_ID,
  MOBILE_E2E_HTTP_ERROR_MODEL_ID,
  MOBILE_E2E_INTERRUPTED_MODEL_ID,
  MOBILE_E2E_TIMEOUT_MODEL_ID,
  MOBILE_E2E_MODEL_ID,
} from "../support/openai-conformance";
import { clickTestElement, testElement } from "../support/webview";
import {
  ensureFixtureImported,
  findFixtureTile,
} from "./asset-workflow.spec";
import { configureOpenAiProfile } from "./chat-attachment.spec";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";
const INTERRUPTED_IMPORT_NAME = "aiohub-e2e-interrupted.bin";

async function setInput(
  context: ScenarioContext,
  testId: string,
  value: string
): Promise<void> {
  const input = await testElement(context.driver, testId);
  await input.clearValue();
  await input.setValue(value);
}

async function startChatWithModel(
  context: ScenarioContext,
  modelId: string
): Promise<void> {
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/home";
  });
  await testElement(context.driver, "chat-home");
  await clickTestElement(context.driver, "chat-new");
  await testElement(context.driver, "chat-view");
  await clickTestElement(context.driver, "chat-model-selector");
  await testElement(context.driver, "chat-model-popup");
  const model = await context.driver.$(
    `[data-testid="chat-model-item"][data-model-id="${modelId}"]`
  );
  await model.waitForDisplayed({ timeout: 20_000 });
  await model.click();
}

async function sendText(context: ScenarioContext, text: string): Promise<string> {
  await setInput(context, "chat-message-input", text);
  await clickTestElement(context.driver, "chat-send");
  const sessionId = await context.driver.execute(() => {
    const match = window.location.hash.match(/\/chat\/([^?]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  });
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error("Could not determine failure-recovery session ID.");
  }
  return sessionId;
}

async function configureFailureProfile(
  context: ScenarioContext,
  name: string,
  modelId: string
): Promise<void> {
  if (!context.deterministicBaseUrl) {
    throw new Error("Deterministic recovery server was not started.");
  }
  await configureOpenAiProfile(context, {
    name,
    baseUrl: context.deterministicBaseUrl,
    modelId,
  });
}

async function assertRequestMode(
  context: ScenarioContext,
  mode: string,
  status: number
): Promise<void> {
  await context.driver.waitUntil(
    async () =>
      Boolean(
        context.deterministicRequests?.some(
          (request) => request.mode === mode && request.status === status
        )
      ),
    { timeout: 20_000, timeoutMsg: `No ${mode} request summary was recorded.` }
  );
}

async function assertMissingDraftIsBlocked(
  context: ScenarioContext
): Promise<void> {
  await ensureFixtureImported(context);
  await configureFailureProfile(
    context,
    "Android E2E Missing Asset",
    MOBILE_E2E_MODEL_ID
  );
  await startChatWithModel(context, MOBILE_E2E_MODEL_ID);
  const chatHash = await context.driver.execute(() => window.location.hash);
  await clickTestElement(context.driver, "chat-add-asset");
  await testElement(context.driver, "chat-asset-picker");
  const assetRow = await context.driver.$(
    `[data-testid="chat-asset-row"][data-asset-name="${context.fixtures.image.fileName}"]`
  );
  await assetRow.waitForDisplayed({ timeout: 20_000 });
  await assetRow.click();
  await clickTestElement(context.driver, "chat-asset-confirm");
  await testElement(context.driver, "chat-pending-attachments");

  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  const tile = await findFixtureTile(context);
  await (await tile.$('[data-testid="asset-open"]')).click();
  await testElement(context.driver, "asset-detail");
  await clickTestElement(context.driver, "asset-detail-delete");
  await tile.waitForExist({ timeout: 30_000, reverse: true });

  await context.driver.execute((hash) => {
    window.location.hash = hash;
  }, chatHash);
  await testElement(context.driver, "chat-view");
  await testElement(context.driver, "chat-pending-attachments");
  const requestsBefore = context.deterministicRequests?.length ?? 0;
  await clickTestElement(context.driver, "chat-send");
  const snackbar = await context.driver.$(".var-snackbar");
  await snackbar.waitForDisplayed({ timeout: 20_000 });
  await testElement(context.driver, "chat-pending-attachments");
  const userMessages = await context.driver.$$(
    '[data-testid="chat-message"][data-message-role="user"]'
  );
  if ((await userMessages.length) !== 0) {
    throw new Error("Unavailable attachment send created a user message.");
  }
  if ((context.deterministicRequests?.length ?? 0) !== requestsBefore) {
    throw new Error("Unavailable attachment send reached the provider.");
  }
  const pending = await testElement(context.driver, "chat-pending-attachments");
  await (await pending.$("button")).click();
  await pending.waitForExist({ timeout: 10_000, reverse: true });
}

async function assertInterruptedImportRecovery(
  context: ScenarioContext
): Promise<void> {
  await context.adb.createTestDownload(
    context.serial,
    INTERRUPTED_IMPORT_NAME,
    768
  );
  try {
    await switchToWebview(context.driver);
    await context.driver.execute(() => {
      window.location.hash = "#/tools/asset-manager";
    });
    await testElement(context.driver, "asset-manager-view");
    await clickTestElement(context.driver, "asset-import");
    await clickTestElement(context.driver, "asset-import-file");
    await switchToNative(context.driver);
    await chooseDocumentsUiFile(
      context.driver,
      INTERRUPTED_IMPORT_NAME,
      APP_PACKAGE,
      30_000
    );
    await switchToWebview(context.driver);
    await testElement(context.driver, "asset-import-progress", 30_000);

    await context.driver.switchContext("NATIVE_APP");
    await context.driver.terminateApp(APP_PACKAGE);
    await context.driver.activateApp(APP_PACKAGE);
    await switchToWebview(context.driver);
    await context.driver.execute(() => {
      window.location.hash = "#/tools/asset-manager";
    });
    await testElement(context.driver, "asset-manager-view", 30_000);
    await clickTestElement(context.driver, "asset-import-jobs");
    await testElement(context.driver, "asset-import-jobs-sheet");
    const interruptedJob = await context.driver.$(
      '[data-testid="asset-import-job"][data-job-state="failed"][data-error-code="ASSET_IMPORT_INTERRUPTED"]'
    );
    await interruptedJob.waitForDisplayed({ timeout: 30_000 });
    const unexpectedAsset = await context.driver.$(
      `[data-testid="asset-tile"][data-asset-name="${INTERRUPTED_IMPORT_NAME}"]`
    );
    if (await unexpectedAsset.isExisting()) {
      throw new Error("Interrupted import produced a managed asset.");
    }
  } finally {
    await context.adb.removeTestDownload(
      context.serial,
      INTERRUPTED_IMPORT_NAME
    );
  }
}

export async function runFailureRecoveryScenario(context: ScenarioContext) {
  await assertMissingDraftIsBlocked(context);

  await configureFailureProfile(
    context,
    "Android E2E HTTP Error",
    MOBILE_E2E_HTTP_ERROR_MODEL_ID
  );
  await startChatWithModel(context, MOBILE_E2E_HTTP_ERROR_MODEL_ID);
  await sendText(context, "Exercise the deterministic HTTP error path.");
  const httpError = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="error"]'
  );
  await httpError.waitForDisplayed({ timeout: 30_000 });
  await assertRequestMode(context, "http-error", 429);

  await configureFailureProfile(
    context,
    "Android E2E Interrupted Stream",
    MOBILE_E2E_INTERRUPTED_MODEL_ID
  );
  await startChatWithModel(context, MOBILE_E2E_INTERRUPTED_MODEL_ID);
  await sendText(context, "Exercise the deterministic interrupted stream path.");
  const interrupted = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="error"]'
  );
  await interrupted.waitForDisplayed({ timeout: 30_000 });
  await assertRequestMode(context, "interrupted-stream", 200);

  await configureFailureProfile(
    context,
    "Android E2E Delayed Stream",
    MOBILE_E2E_DELAYED_MODEL_ID
  );
  await startChatWithModel(context, MOBILE_E2E_DELAYED_MODEL_ID);
  const delayedSessionId = await sendText(
    context,
    "Exercise process-stop recovery during a deterministic delayed stream."
  );
  const generating = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="generating"]'
  );
  await generating.waitForDisplayed({ timeout: 30_000 });
  await assertRequestMode(context, "delayed-stream", 200);

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/sessions";
  });
  await testElement(context.driver, "chat-session-list", 30_000);
  const recoveredSession = await context.driver.$(
    `[data-testid="chat-session-row"][data-session-id="${delayedSessionId}"]`
  );
  await recoveredSession.waitForDisplayed({ timeout: 30_000 });
  await recoveredSession.click();
  await testElement(context.driver, "chat-view", 30_000);
  const recoveredError = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="error"]'
  );
  await recoveredError.waitForDisplayed({ timeout: 30_000 });
  const pseudoComplete = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]'
  );
  if (await pseudoComplete.isExisting()) {
    throw new Error("Interrupted generation recovered as a completed assistant message.");
  }

  await configureFailureProfile(
    context,
    "Android E2E Timeout",
    MOBILE_E2E_TIMEOUT_MODEL_ID
  );
  await startChatWithModel(context, MOBILE_E2E_TIMEOUT_MODEL_ID);
  await sendText(context, "Exercise the deterministic request timeout path.");
  const timeoutError = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="error"]'
  );
  await timeoutError.waitForDisplayed({ timeout: 75_000 });
  await assertRequestMode(context, "timeout", 200);

  await assertInterruptedImportRecovery(context);

  return {
    httpError: true,
    interruptedStream: true,
    delayedSessionId,
    restartRecoveredAsError: true,
    timeout: true,
    unavailableDraftBlocked: true,
    interruptedImportRecovered: true,
  };
}
