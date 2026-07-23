import { switchToWebview } from "../support/appium";
import { testElement } from "../support/webview";
import type { ScenarioContext } from "./context";

export async function runFeasibilityScenario(context: ScenarioContext) {
  const webview = await switchToWebview(context.driver);
  await testElement(context.driver, "home-view");
  let verifiedContexts: string[] = [];
  await context.driver.waitUntil(
    async () => {
      const contexts = (await context.driver.getContexts()).map(String);
      if (!contexts.includes("NATIVE_APP") || !contexts.includes(webview)) {
        return false;
      }
      verifiedContexts = contexts;
      return true;
    },
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: "Expected native and WebView contexts to be available together.",
    }
  );
  return { contexts: verifiedContexts };
}
