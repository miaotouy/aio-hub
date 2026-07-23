import { switchToWebview } from "../support/appium";
import { clickTestElement, testElement } from "../support/webview";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";

export async function runSmokeScenario(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/";
  });
  await testElement(context.driver, "home-view");
  const toolCards = await context.driver.$$('[data-testid^="home-tool-"]');
  const toolCount = await toolCards.length;
  if (toolCount !== 7) {
    throw new Error(`Expected 7 registered tools, found ${toolCount}.`);
  }

  await clickTestElement(context.driver, "home-tool-asset-manager");
  await testElement(context.driver, "asset-manager-view");
  await clickTestElement(context.driver, "asset-back");
  await testElement(context.driver, "home-view");

  await context.driver.execute(() => {
    window.location.hash = "#/tools/ui-tester";
  });
  await testElement(context.driver, "ui-tester-view");
  await clickTestElement(context.driver, "ui-tester-section-platform-files");
  await testElement(context.driver, "ui-tester-platform-files-view");
  await clickTestElement(
    context.driver,
    "ui-tester-platform-sandbox-round-trip-run"
  );
  const sandboxCheck = await testElement(
    context.driver,
    "ui-tester-platform-sandbox-round-trip"
  );
  await context.driver.waitUntil(
    async () => (await sandboxCheck.getAttribute("data-status")) === "passed",
    {
      timeout: 30_000,
      timeoutMsg: "Platform sandbox environment check did not pass.",
    }
  );

  await context.driver.execute(() => {
    window.location.hash = "#/";
  });
  await testElement(context.driver, "home-view");

  await clickTestElement(context.driver, "home-settings");
  await testElement(context.driver, "settings-view");
  await clickTestElement(context.driver, "settings-language");
  await clickTestElement(context.driver, "settings-language-en-US");
  await clickTestElement(context.driver, "settings-theme-entry");
  await testElement(context.driver, "theme-settings-view");
  await clickTestElement(context.driver, "theme-mode");
  await clickTestElement(context.driver, "theme-mode-dark");
  const darkBeforeRestart = await context.driver.execute(() =>
    document.documentElement.classList.contains("dark")
  );
  if (!darkBeforeRestart) throw new Error("Dark theme was not applied.");

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await testElement(context.driver, "home-view", 30_000);
  const darkAfterRestart = await context.driver.execute(() =>
    document.documentElement.classList.contains("dark")
  );
  if (!darkAfterRestart) throw new Error("Dark theme did not persist after restart.");
  const app = await testElement(context.driver, "app-ready");
  const localeAfterRestart = await app.getAttribute("data-locale");
  if (localeAfterRestart !== "en-US") {
    throw new Error(`Language did not persist after restart: ${localeAfterRestart}`);
  }
  return {
    registeredToolCount: toolCount,
    persistedTheme: "dark",
    persistedLocale: localeAfterRestart,
  };
}
