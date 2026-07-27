import { clickTestElement, testElement } from "../support/webview";
import { switchToWebview } from "../support/appium";
import type { ScenarioContext } from "./context";

const INITIAL_SOURCE = [
  "# Android RichText 验证",
  "",
  "```ts",
  "const mobileRendering = true;",
  "```",
  "",
  "```mermaid",
  "graph TD",
  "  A[输入] --> B[移动端渲染]",
  "```",
].join("\n");

const LONG_MARKER = "AIO_RICH_TEXT_LONG_LINE_";
const LONG_SOURCE = [
  "# 长代码滚动验证",
  "",
  "```text",
  `${LONG_MARKER}${"x".repeat(12_000)}`,
  "```",
].join("\n");

async function setEditorContent(
  context: ScenarioContext,
  content: string
): Promise<void> {
  await testElement(context.driver, "rich-text-render-start", 30_000);
  await clickTestElement(context.driver, "rich-text-edit-tab");
  const editor = await testElement(context.driver, "rich-text-editor");
  await editor.clearValue();
  await editor.setValue(content);
}

async function renderEditorContent(context: ScenarioContext): Promise<void> {
  await clickTestElement(context.driver, "rich-text-render-start");
  await clickTestElement(context.driver, "rich-text-preview-tab");
}

async function waitForCodeText(
  context: ScenarioContext,
  expectedText: string
): Promise<void> {
  await context.driver.waitUntil(
    async () => {
      const codeBlock = await context.driver.$(
        '[data-testid="rich-text-code-block"]'
      );
      if (!(await codeBlock.isExisting())) return false;
      return (await codeBlock.getText()).includes(expectedText);
    },
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: `RichText code block did not render ${expectedText}.`,
    }
  );
}

export async function runRichTextRendererScenario(context: ScenarioContext) {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/rich-text-renderer";
  });
  await testElement(context.driver, "rich-text-tester-view");

  await setEditorContent(context, INITIAL_SOURCE);
  await renderEditorContent(context);
  await waitForCodeText(context, "const mobileRendering = true;");

  const codeBlock = await testElement(context.driver, "rich-text-code-block");
  const wrapButton = await codeBlock.$('[data-testid="rich-text-code-wrap"]');
  await wrapButton.waitForClickable({ timeout: 15_000 });
  await wrapButton.click();
  await context.driver.waitUntil(
    async () => (await wrapButton.getAttribute("aria-pressed")) === "true",
    { timeout: 5_000, timeoutMsg: "Code wrapping did not become enabled." }
  );

  const mermaidSvg = await context.driver.$(".mermaid-canvas svg");
  await mermaidSvg.waitForDisplayed({ timeout: 30_000 });

  await setEditorContent(context, LONG_SOURCE);
  await renderEditorContent(context);
  await waitForCodeText(context, LONG_MARKER);

  const scrollMetrics = await context.driver.execute(() => {
    const codeBlock = document.querySelector<HTMLElement>(
      '[data-testid="rich-text-code-block"]'
    );
    const codePre = codeBlock?.querySelector<HTMLElement>("pre");
    if (!codePre) return null;
    codePre.scrollLeft = codePre.scrollWidth;
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      maxScrollLeft: codePre.scrollWidth - codePre.clientWidth,
      scrollLeft: codePre.scrollLeft,
    };
  });
  if (
    !scrollMetrics ||
    scrollMetrics.pageWidth > scrollMetrics.viewportWidth + 1 ||
    scrollMetrics.maxScrollLeft <= 0 ||
    scrollMetrics.scrollLeft <= 0
  ) {
    throw new Error(
      `Long code did not remain inside a scrollable narrow-screen container: ${JSON.stringify(scrollMetrics)}`
    );
  }

  const longCodeBlock = await testElement(
    context.driver,
    "rich-text-code-block"
  );
  const longWrapButton = await longCodeBlock.$(
    '[data-testid="rich-text-code-wrap"]'
  );
  await longWrapButton.click();
  await context.driver.waitUntil(
    async () => (await longWrapButton.getAttribute("aria-pressed")) === "true",
    { timeout: 5_000, timeoutMsg: "Long code wrapping did not become enabled." }
  );
  const wrappedMetrics = await context.driver.execute(() => {
    const codePre = document.querySelector<HTMLElement>(
      '[data-testid="rich-text-code-block"] pre'
    );
    if (!codePre) return null;
    return {
      scrollWidth: codePre.scrollWidth,
      clientWidth: codePre.clientWidth,
    };
  });
  if (
    !wrappedMetrics ||
    wrappedMetrics.scrollWidth > wrappedMetrics.clientWidth + 1
  ) {
    throw new Error(
      `Wrapped long code still overflows horizontally: ${JSON.stringify(wrappedMetrics)}`
    );
  }

  return {
    rendered: ["code", "mermaid", "long-code"],
    longCodeCharacters: LONG_SOURCE.length,
  };
}
