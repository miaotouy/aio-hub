import { createHash } from "node:crypto";
import fs from "node:fs";
import { switchToNative, switchToWebview } from "../support/appium";
import {
  chooseDocumentsUiFile,
  completeDocumentsUiSave,
} from "../support/android-selectors";
import {
  clickTestElement,
  testElement,
  waitForImportedAssetTile,
  waitForTestElementGone,
} from "../support/webview";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";
const EXPORT_NAME_PREFIX = "aiohub-e2e-export";

function exportName(context: ScenarioContext): string {
  const suffix = context.artifacts.run.runId
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(-18);
  return `${EXPORT_NAME_PREFIX}-${suffix}.png`;
}

async function assertPickerCancellation(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view");
  const before = await context.driver.$$('[data-testid="asset-tile"]');
  const jobsBefore = await context.driver.$$('[data-testid="asset-import-job"]');
  await clickTestElement(context.driver, "asset-import");
  await clickTestElement(context.driver, "asset-import-file");
  await switchToNative(context.driver);
  await context.driver.back();
  await switchToWebview(context.driver);
  await testElement(context.driver, "asset-manager-view");
  const after = await context.driver.$$('[data-testid="asset-tile"]');
  const jobsAfter = await context.driver.$$('[data-testid="asset-import-job"]');
  if (after.length !== before.length) {
    throw new Error(
      "Cancelling DocumentsUI unexpectedly changed the asset list."
    );
  }
  if (jobsAfter.length !== jobsBefore.length) {
    throw new Error("Cancelling DocumentsUI unexpectedly created an import job.");
  }
}

async function exportAndVerifyFixture(context: ScenarioContext) {
  const fileName = exportName(context);
  await context.adb.removeTestDownload(context.serial, fileName);
  await clickTestElement(context.driver, "asset-detail-save");
  await switchToNative(context.driver);
  await completeDocumentsUiSave(context.driver, fileName, APP_PACKAGE);
  await switchToWebview(context.driver);
  await testElement(context.driver, "asset-detail", 30_000);
  await context.driver.waitUntil(
    async () =>
      (await context.adb.testDownloadSize(context.serial, fileName)) ===
      context.fixtures.image.bytes,
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: "Exported fixture did not reach the expected size.",
    }
  );

  const hostPath = context.artifacts.path(fileName);
  await context.adb.pullTestDownload(context.serial, fileName, hostPath);
  const bytes = fs.readFileSync(hostPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.byteLength !== context.fixtures.image.bytes ||
    sha256 !== context.fixtures.image.sha256
  ) {
    throw new Error(
      `Export mismatch: bytes=${bytes.byteLength}, sha256=${sha256}.`
    );
  }
  return { bytes: bytes.byteLength, sha256 };
}

async function chooseFixtureFromDocumentsUi(context: ScenarioContext) {
  await switchToNative(context.driver);
  await chooseDocumentsUiFile(
    context.driver,
    context.fixtures.image.fileName,
    APP_PACKAGE
  );
  await switchToWebview(context.driver);
}

export async function findFixtureTile(context: ScenarioContext) {
  return waitForImportedAssetTile(
    context.driver,
    context.fixtures.image.fileName
  );
}

export async function ensureFixtureImported(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  await testElement(context.driver, "asset-manager-view");
  const staleDetail = await context.driver.$('[data-testid="asset-detail"]');
  if (await staleDetail.isExisting()) {
    const close = await staleDetail.$('[data-testid="asset-detail-close"]');
    if (await close.isDisplayed()) {
      await close.click();
      await staleDetail.waitForExist({ timeout: 10_000, reverse: true });
    }
  }
  const existing = await context.driver.$(
    `[data-testid="asset-tile"][data-asset-name="${context.fixtures.image.fileName}"]`
  );
  if (await existing.isExisting()) return existing;
  await clickTestElement(context.driver, "asset-import");
  await clickTestElement(context.driver, "asset-import-file");
  await chooseFixtureFromDocumentsUi(context);
  return findFixtureTile(context);
}

export async function runAssetWorkflowScenario(context: ScenarioContext) {
  let tile = await ensureFixtureImported(context);
  const [mimeType, availability] = await Promise.all([
    tile.getAttribute("data-asset-mime"),
    tile.getAttribute("data-asset-status"),
  ]);
  if (mimeType !== "image/png" || availability !== "ready") {
    throw new Error(
      `Imported fixture has unexpected state: mime=${mimeType}, status=${availability}.`
    );
  }

  await (await tile.$('[data-testid="asset-open"]')).click();
  const detail = await testElement(context.driver, "asset-detail");
  const detailMetadata = await Promise.all([
    detail.getAttribute("data-asset-mime"),
    detail.getAttribute("data-asset-size"),
    detail.getAttribute("data-origin-count"),
    detail.getAttribute("data-origin-kinds"),
    detail.getAttribute("data-source-modules"),
  ]);
  if (
    detailMetadata[0] !== "image/png" ||
    detailMetadata[1] !== String(context.fixtures.image.bytes) ||
    detailMetadata[2] !== "1" ||
    !detailMetadata[3]?.split(",").includes("file_picker") ||
    !detailMetadata[4]?.split(",").includes("asset-manager")
  ) {
    throw new Error(
      `Imported fixture detail metadata is incomplete: ${detailMetadata.join("/")}.`
    );
  }
  await clickTestElement(context.driver, "asset-detail-preview");
  const preview = await testElement(context.driver, "asset-preview-image");
  const previewUrl = await preview.getAttribute("src");
  await context.driver.waitUntil(
    async () => (await preview.getProperty("naturalWidth")) !== 0,
    { timeout: 15_000, timeoutMsg: "Asset preview image did not load." }
  );
  const exported = await exportAndVerifyFixture(context);
  await clickTestElement(context.driver, "asset-detail-close");
  if (!previewUrl) throw new Error("Asset preview did not expose a preview URL.");
  await context.driver.waitUntil(
    async () =>
      (await context.driver.execute(async (url) => {
        try {
          return (await fetch(url, { cache: "no-store" })).status;
        } catch {
          return 404;
        }
      }, previewUrl)) === 404,
    {
      timeout: 10_000,
      timeoutMsg: "Revoked asset preview URL remained accessible after close.",
    }
  );

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/asset-manager";
  });
  tile = await findFixtureTile(context);

  await (await tile.$('[data-testid="asset-select"]')).click();
  await testElement(context.driver, "asset-selection-bar");
  await clickTestElement(context.driver, "asset-delete-selected");
  await waitForTestElementGone(context.driver, "asset-selection-bar", 30_000);
  const remaining = await context.driver.$(
    `[data-testid="asset-tile"][data-asset-name="${context.fixtures.image.fileName}"]`
  );
  await remaining.waitForExist({ timeout: 30_000, reverse: true });
  await assertPickerCancellation(context);

  return {
    fixtureSha256: context.fixtures.image.sha256,
    fixtureBytes: context.fixtures.image.bytes,
    mimeType,
    exported,
    pickerCancellation: true,
    restartRecovered: true,
    deleted: true,
  };
}
