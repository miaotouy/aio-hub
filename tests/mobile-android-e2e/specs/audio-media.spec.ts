import { switchToNative, switchToWebview } from "../support/appium";
import { chooseDocumentsUiFile } from "../support/android-selectors";
import { clickTestElement, testElement } from "../support/webview";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";

export async function runAudioMediaScenario(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view");
  const selector = `[data-testid="asset-tile"][data-asset-name="${context.fixtures.audio.fileName}"]`;
  let tile = await context.driver.$(selector);
  if (!(await tile.isExisting())) {
    await clickTestElement(context.driver, "asset-import");
    await clickTestElement(context.driver, "asset-import-file");
    await switchToNative(context.driver);
    await chooseDocumentsUiFile(context.driver, context.fixtures.audio.fileName, APP_PACKAGE);
    await switchToWebview(context.driver);
    tile = await context.driver.$(selector);
  }
  await tile.waitForDisplayed({ timeout: 30_000 });
  if (
    !new Set(["audio/wav", "audio/x-wav"]).has(
      (await tile.getAttribute("data-asset-mime")) ?? ""
    )
  ) {
    throw new Error("Imported audio fixture did not retain a WAV MIME type.");
  }
  await (await tile.$('[data-testid="asset-open"]')).click();
  await testElement(context.driver, "asset-detail");
  await clickTestElement(context.driver, "asset-detail-preview");
  const previewHost = await testElement(context.driver, "asset-preview-ready");
  await context.driver.waitUntil(
    async () => (await previewHost.getAttribute("data-state")) === "ready",
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: "Managed audio preview did not become ready.",
    }
  );
  const audio = await previewHost.$("audio");
  await audio.waitForExist({ timeout: 5_000 });
  const source = await audio.getAttribute("src");
  if (!source?.startsWith("http://aio-asset.localhost/")) {
    throw new Error("Audio preview did not receive a managed preview URL.");
  }
  const expand = await context.driver.$('[aria-label="展开音频播放器"]');
  await expand.waitForClickable({ timeout: 15_000 });
  await expand.click();
  const immersive = await testElement(context.driver, "media-preview-immersive");
  for (const label of ["后退 10 秒", "前进 10 秒", "调整播放速度", "静音"]) {
    const control = await immersive.$(`[aria-label="${label}"]`);
    await control.waitForDisplayed({ timeout: 15_000 });
  }
  const close = await immersive.$(".immersive-header button");
  await close.click();
  await immersive.waitForExist({ timeout: 10_000, reverse: true });
  return { fileName: context.fixtures.audio.fileName, sourceKind: "managed-preview" };
}
