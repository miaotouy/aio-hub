import { switchToNative, switchToWebview } from "../support/appium";
import { chooseDocumentsUiFile } from "../support/android-selectors";
import { clickTestElement, testElement } from "../support/webview";
import { setInput } from "./chat-attachment.spec";
import {
  agentRowSelector,
  ensureAgentImported,
  findAgentIdByName,
  openAgentList,
} from "./agent-import.spec";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";
const PRIVATE_ASSET_DESCRIPTION = "Android E2E private asset description";

async function openAgentDetail(
  context: ScenarioContext,
  agentId: string
): Promise<void> {
  await switchToWebview(context.driver);
  await context.driver.execute((id) => {
    window.location.hash = `#/tools/agent-manager/${encodeURIComponent(id)}`;
  }, agentId);
  await testElement(context.driver, "agent-detail", 30_000);
}

async function readPrivateAssetId(context: ScenarioContext): Promise<string> {
  const card = await context.driver.$(
    'li.asset-card[data-testid^="agent-asset-"]'
  );
  await card.waitForDisplayed({ timeout: 20_000 });
  const testId = await card.getAttribute("data-testid");
  if (!testId?.startsWith("agent-asset-")) {
    throw new Error("The added private asset has no stable test id.");
  }
  return testId.slice("agent-asset-".length);
}

export async function runAgentAssetsScenario(context: ScenarioContext) {
  const handle = await ensureAgentImported(context);
  await openAgentDetail(context, handle.id);

  await clickTestElement(context.driver, "agent-assets-add");
  await switchToNative(context.driver);
  await chooseDocumentsUiFile(
    context.driver,
    context.fixtures.image.fileName,
    APP_PACKAGE
  );
  await switchToWebview(context.driver);
  await testElement(context.driver, "agent-detail");
  const assetId = await readPrivateAssetId(context);

  await clickTestElement(
    context.driver,
    `agent-asset-edit-button-${assetId}`
  );
  await testElement(context.driver, "agent-asset-edit");
  await setInput(
    context,
    "agent-asset-edit-description",
    PRIVATE_ASSET_DESCRIPTION
  );
  const groupSelect = await testElement(
    context.driver,
    "agent-asset-edit-group"
  );
  const options = await groupSelect.$$("option");
  for (const option of options) {
    const value = await option.getAttribute("value");
    if (value) {
      await groupSelect.selectByAttribute("value", value);
      break;
    }
  }
  await clickTestElement(context.driver, "agent-asset-edit-confirm");
  await (
    await context.driver.$('[data-testid="agent-asset-edit"]')
  ).waitForExist({ timeout: 10_000, reverse: true });
  const editedCard = await context.driver.$(
    `[data-testid="agent-asset-${assetId}"]`
  );
  await editedCard.waitForDisplayed({ timeout: 10_000 });
  if (!(await editedCard.getText()).includes(PRIVATE_ASSET_DESCRIPTION)) {
    throw new Error("The private asset description was not echoed back.");
  }

  await clickTestElement(context.driver, "agent-save");
  await openAgentList(context);

  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view", 30_000);
  const globalTile = await context.driver.$(
    `[data-testid="asset-tile"][data-asset-name="${context.fixtures.image.fileName}"]`
  );
  if (await globalTile.isExisting()) {
    throw new Error("The Agent private asset leaked into the global asset page.");
  }

  await openAgentDetail(context, handle.id);
  const deleteAsset = await testElement(
    context.driver,
    `agent-asset-delete-${assetId}`
  );
  await deleteAsset.scrollIntoView({ block: "center", inline: "center" });
  await deleteAsset.waitForClickable({ timeout: 10_000 });
  await deleteAsset.click();
  // Varlet Dialog does not forward data-testid; use its stable class hooks.
  const confirmAssetDelete = await context.driver.$(
    ".var-dialog__confirm-button"
  );
  await confirmAssetDelete.waitForClickable({ timeout: 10_000 });
  await confirmAssetDelete.click();
  await (
    await context.driver.$(`[data-testid="agent-asset-${assetId}"]`)
  ).waitForExist({ timeout: 20_000, reverse: true });
  await clickTestElement(context.driver, "agent-save");
  await openAgentList(context);

  await openAgentList(context);
  if (!(await findAgentIdByName(context, handle.name))) {
    throw new Error("Target agent row is missing before deletion.");
  }
  const row = await context.driver.$(agentRowSelector(handle.id));
  const deleteAgent = await row.$('[data-testid="agent-delete"]');
  await deleteAgent.waitForClickable({ timeout: 15_000 });
  await deleteAgent.click();
  const confirmAgentDelete = await context.driver.$(
    ".var-dialog__confirm-button"
  );
  await confirmAgentDelete.waitForClickable({ timeout: 10_000 });
  await confirmAgentDelete.click();
  await context.driver.waitUntil(
    async () => !(await findAgentIdByName(context, handle.name)),
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: "Deleting the agent did not remove its row.",
    }
  );

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await openAgentList(context);
  if (await findAgentIdByName(context, handle.name)) {
    throw new Error("Deleted agent reappeared after the app restart.");
  }

  return {
    agentId: handle.id,
    assetId,
    privateAssetIsolated: true,
    assetDeleted: true,
    agentDeleted: true,
    restartConfirmed: true,
  };
}
