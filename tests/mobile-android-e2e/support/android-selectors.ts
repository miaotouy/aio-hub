import type { Browser, ChainablePromiseElement } from "webdriverio";

async function firstDisplayed(
  driver: Browser,
  selectors: string[],
  timeoutMs: number
): Promise<ChainablePromiseElement> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await dismissSystemCrashDialog(driver);
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

async function dismissSystemCrashDialog(driver: Browser): Promise<void> {
  const close = driver.$("id=android:id/aerr_close");
  if ((await close.isExisting()) && (await close.isDisplayed())) {
    await close.click();
    await driver.pause(200);
  }
}

async function waitForPackage(
  driver: Browser,
  packageName: string,
  timeoutMs: number
): Promise<boolean> {
  return driver
    .waitUntil(async () => {
      const [currentPackage, currentActivity] = await Promise.all([
        driver.getCurrentPackage(),
        driver.getCurrentActivity(),
      ]);
      return (
        currentPackage === packageName &&
        !currentActivity.toLowerCase().includes("documentsui")
      );
    }, {
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
  const rowSelector = `//*[@resource-id="android:id/title" and @text="${escapedName}"]/ancestor::*[@clickable="true"][1]`;
  const deadline = Date.now() + timeoutMs;
  let selected = false;

  while (Date.now() < deadline) {
    // AVD system-app crashes must not obscure DocumentsUI rows. This closes
    // only Android's process-crash action, never the picker confirmation.
    await dismissSystemCrashDialog(driver);
    const row = driver.$(rowSelector);
    if ((await row.isExisting()) && (await row.isDisplayed())) {
      await row.click();
      selected = true;
      break;
    }

    try {
      // DocumentsUI uses a lazily populated, scrollable grid on API 36. The
      // title may exist in its MediaStore query but not in the visible subtree.
      await driver.$(
        `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().resourceId("android:id/title").text("${escapedName}"))`
      );
    } catch {
      // The target is not indexed or is not in the current DocumentsUI page yet.
    }
    await driver.pause(200);
  }

  if (!selected) {
    throw new Error(`DocumentsUI file was not selectable: ${fileName}`);
  }
  // `getCurrentPackage()` may already report the caller while DocumentsUI's
  // multi-select confirmation is still on screen on API 36. Prefer an
  // explicit Open action when it is available; otherwise the picker can close
  // without delivering the selected content URI to the application.
  const confirm = await firstDisplayed(
    driver,
    [
      "id=com.google.android.documentsui:id/action_menu_open",
      "id=com.android.documentsui:id/action_menu_open",
      "id=android:id/button1",
    ],
    3_000
  ).catch(() => null);
  if (confirm) await confirm.click();

  if (!(await waitForPackage(driver, returnPackage, timeoutMs))) {
    throw new Error(`DocumentsUI did not return to ${returnPackage}.`);
  }
}
