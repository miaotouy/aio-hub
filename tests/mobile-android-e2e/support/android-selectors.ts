import type { Browser, ChainablePromiseElement } from "webdriverio";

async function firstDisplayed(
  driver: Browser,
  selectors: string[],
  timeoutMs: number
): Promise<ChainablePromiseElement> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const element = driver.$(selector);
      if ((await element.isExisting()) && (await element.isDisplayed())) {
        return element;
      }
    }
    await driver.pause(200);
  }
  throw new Error(`Android system element not found: ${selectors.join(", ")}`);
}

export async function completeDocumentsUiSave(
  driver: Browser,
  fileName: string,
  returnPackage: string,
  timeoutMs = 20_000
): Promise<void> {
  const filename = await firstDisplayed(
    driver,
    [
      'android=new UiSelector().resourceId("android:id/title").className("android.widget.EditText")',
      "id=com.android.documentsui:id/file_name",
      "id=com.android.documentsui:id/filename",
      "id=com.google.android.documentsui:id/filename",
      "id=android:id/edit",
    ],
    timeoutMs
  );
  await filename.clearValue();
  await filename.setValue(fileName);
  const save = await firstDisplayed(
    driver,
    [
      "id=com.android.documentsui:id/action_menu_save",
      "id=com.google.android.documentsui:id/action_menu_save",
      "id=android:id/button1",
    ],
    timeoutMs
  );
  await save.click();
  if (!(await waitForPackage(driver, returnPackage, timeoutMs))) {
    throw new Error(`DocumentsUI did not return to ${returnPackage}.`);
  }
}

async function waitForPackage(
  driver: Browser,
  packageName: string,
  timeoutMs: number
): Promise<boolean> {
  return driver
    .waitUntil(async () => (await driver.getCurrentPackage()) === packageName, {
      timeout: timeoutMs,
      interval: 200,
    })
    .then(() => true)
    .catch(() => false);
}

export async function chooseDocumentsUiFile(
  driver: Browser,
  fileName: string,
  returnPackage: string,
  timeoutMs = 20_000
): Promise<void> {
  const escapedName = fileName.replace(/"/g, '\\"');
  const row = driver.$(
    `//*[@resource-id="android:id/title" and @text="${escapedName}"]/ancestor::*[@clickable="true"][1]`
  );
  await row.waitForDisplayed({ timeout: timeoutMs });
  await row.click();
  if (await waitForPackage(driver, returnPackage, 3_000)) return;

  const confirm = await firstDisplayed(
    driver,
    [
      "id=com.google.android.documentsui:id/action_menu_open",
      "id=com.android.documentsui:id/action_menu_open",
      "id=android:id/button1",
    ],
    timeoutMs
  );
  await confirm.click();
  if (!(await waitForPackage(driver, returnPackage, timeoutMs))) {
    throw new Error(`DocumentsUI did not return to ${returnPackage}.`);
  }
}
