import type { Browser } from "webdriverio";

export async function testElement(
  driver: Browser,
  testId: string,
  timeoutMs = 15_000
) {
  const element = await driver.$(`[data-testid="${testId}"]`);
  await element.waitForExist({ timeout: timeoutMs });
  await element.scrollIntoView({ block: "center", inline: "center" });
  await element.waitForDisplayed({ timeout: timeoutMs });
  return element;
}

export async function clickTestElement(
  driver: Browser,
  testId: string,
  timeoutMs = 15_000
): Promise<void> {
  const element = await testElement(driver, testId, timeoutMs);
  await element.scrollIntoView({ block: "center", inline: "center" });
  await element.waitForClickable({ timeout: timeoutMs });
  await element.click();
}

export async function waitForTestElementGone(
  driver: Browser,
  testId: string,
  timeoutMs = 15_000
): Promise<void> {
  const element = await driver.$(`[data-testid="${testId}"]`);
  await element.waitForExist({ timeout: timeoutMs, reverse: true });
}

export async function waitForRoute(
  driver: Browser,
  hashPath: string,
  timeoutMs = 15_000
): Promise<void> {
  await driver.waitUntil(
    async () =>
      (await driver.execute(() => window.location.hash)) === `#${hashPath}`,
    { timeout: timeoutMs, timeoutMsg: `Expected route ${hashPath}` }
  );
}

function assetTileSelector(fileName: string): string {
  return `[data-testid="asset-tile"][data-asset-name="${fileName.replaceAll('"', '\\"')}"]`;
}

async function importDiagnostics(driver: Browser): Promise<string> {
  await clickTestElement(driver, "asset-import-jobs", 3_000).catch(
    () => undefined
  );
  await driver.pause(500);
  return driver.execute(() => {
    const progress = document.querySelector(
      '[data-testid="asset-import-progress"]'
    );
    const empty = document.querySelector('[data-testid="asset-list-empty"]');
    const jobs = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="asset-import-job"]')
    ).map((job) => ({
      state: job.dataset.jobState ?? "unknown",
      errorCode: job.dataset.errorCode ?? "",
    }));
    return JSON.stringify({
      importInProgress: Boolean(progress),
      assetListEmpty: Boolean(empty),
      jobs,
    });
  });
}

/**
 * Wait for a DocumentsUI-selected source to become a managed asset. The picker
 * returns before the Rust import job has necessarily refreshed the Vue list;
 * therefore the failure includes persisted job state instead of a bare
 * missing-element timeout.
 */
export async function waitForImportedAssetTile(
  driver: Browser,
  fileName: string,
  timeoutMs = 30_000
) {
  const selector = assetTileSelector(fileName);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exists = await driver.execute(
      (targetSelector) => Boolean(document.querySelector(targetSelector)),
      selector
    );
    if (exists) {
      const tile = await driver.$(selector);
      await tile.scrollIntoView({ block: "center", inline: "center" });
      return tile;
    }
    await driver.pause(250);
  }
  const diagnostics = await importDiagnostics(driver).catch(
    (error) => `unable to read import jobs: ${String(error)}`
  );
  throw new Error(
    `Imported asset tile did not appear for ${fileName} after ${timeoutMs}ms. ${diagnostics}`
  );
}
