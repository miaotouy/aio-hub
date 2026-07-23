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
