import {
  clickTestElement,
  testElement,
  waitForTestElementGone,
} from "../support/webview";
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

const STREAM_ROW_COUNT = 220;
const STREAM_SOURCE = Array.from(
  { length: STREAM_ROW_COUNT },
  (_, index) => `- STREAM_SCROLL_ROW_${String(index + 1).padStart(3, "0")}`
).join("\n");

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

async function waitForStreamingProgress(
  context: ScenarioContext,
  minTokens: number
): Promise<void> {
  await context.driver.waitUntil(
    async () => {
      const stats = await context.driver.$(
        '[data-testid="rich-text-render-stats"]'
      );
      if (!(await stats.isExisting())) return false;
      const [rendering, renderedTokens] = await Promise.all([
        stats.getAttribute("data-rendering"),
        stats.getAttribute("data-rendered-tokens"),
      ]);
      return rendering === "true" && Number(renderedTokens) >= minTokens;
    },
    {
      timeout: 20_000,
      interval: 200,
      timeoutMsg: `RichText stream did not reach ${minTokens} tokens.`,
    }
  );
}

async function waitForPreviewAtBottom(context: ScenarioContext): Promise<void> {
  await context.driver.waitUntil(
    async () => {
      const metrics = await context.driver.execute(() => {
        const pane = document.querySelector<HTMLElement>(
          '[data-testid="rich-text-preview-pane"]'
        );
        if (!pane) return null;
        return {
          clientHeight: pane.clientHeight,
          scrollHeight: pane.scrollHeight,
          scrollTop: pane.scrollTop,
        };
      });
      return Boolean(
        metrics &&
        metrics.scrollHeight > metrics.clientHeight + 1 &&
        metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= 2
      );
    },
    {
      timeout: 15_000,
      interval: 200,
      timeoutMsg:
        "Streaming RichText preview did not keep its scroll position at the bottom.",
    }
  );
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

  await context.driver.waitUntil(
    async () => {
      const mermaidSvg = await context.driver.$(".mermaid-canvas svg");
      return mermaidSvg.isExisting();
    },
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: "RichText Mermaid SVG did not mount in the preview DOM.",
    }
  );

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

  await setEditorContent(context, STREAM_SOURCE);
  await renderEditorContent(context);
  await testElement(context.driver, "rich-text-render-stop", 10_000);
  await waitForStreamingProgress(context, 160);
  await waitForPreviewAtBottom(context);

  const stats = await testElement(context.driver, "rich-text-render-stats");
  await clickTestElement(context.driver, "rich-text-render-stop");
  await waitForTestElementGone(context.driver, "rich-text-render-stop");
  const renderedLengthAfterStop = Number(
    await stats.getAttribute("data-rendered-length")
  );
  await context.driver.pause(350);
  const renderedLengthAfterPause = Number(
    await stats.getAttribute("data-rendered-length")
  );
  if (
    renderedLengthAfterStop <= 0 ||
    renderedLengthAfterPause !== renderedLengthAfterStop
  ) {
    throw new Error(
      `Stopped RichText stream changed after cancellation: ${JSON.stringify({ renderedLengthAfterStop, renderedLengthAfterPause })}`
    );
  }

  await clickTestElement(context.driver, "rich-text-render-start");
  await waitForStreamingProgress(context, 20);
  await context.driver.execute(() => {
    window.location.hash = "#/";
  });
  await waitForTestElementGone(context.driver, "rich-text-tester-view");
  await context.driver.pause(350);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/rich-text-renderer";
  });
  await testElement(context.driver, "rich-text-tester-view");
  const restoredStats = await testElement(
    context.driver,
    "rich-text-render-stats"
  );
  if ((await restoredStats.getAttribute("data-rendering")) !== "false") {
    throw new Error(
      "RichText stream was still active after leaving the test route."
    );
  }

  return {
    rendered: ["code", "mermaid", "long-code", "stream"],
    longCodeCharacters: LONG_SOURCE.length,
    streamRows: STREAM_ROW_COUNT,
    stoppedStreamLength: renderedLengthAfterStop,
  };
}
