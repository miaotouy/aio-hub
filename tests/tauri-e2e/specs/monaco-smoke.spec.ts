import { $, browser } from "@wdio/globals";

async function closeStartupFlowIfPresent(): Promise<void> {
  const clicked = await browser.execute(() => {
    const button =
      document.querySelector<HTMLElement>(
        '[data-testid="guided-flow-close"]'
      ) ??
      document.querySelector<HTMLElement>('[data-testid="guided-flow-skip"]');
    button?.click();
    return Boolean(button);
  });

  if (!clicked) return;
  await $(".base-dialog-backdrop").waitForDisplayed({
    reverse: true,
    timeout: 10_000,
  });
}

async function prepareApplication(): Promise<void> {
  const body = await $("body");
  await body.waitForExist();
  await browser.pause(2_000);
  await closeStartupFlowIfPresent();
}

async function navigateTo(path: string): Promise<void> {
  await browser.execute((targetPath) => {
    window.history.pushState({}, "", targetPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

describe("Monaco ESM loading", () => {
  it("mounts the text diff editor without AMD or CDN resources", async () => {
    await prepareApplication();
    await navigateTo("/text-diff");

    try {
      const diffEditor = await $(".monaco-diff-editor");
      await diffEditor.waitForDisplayed({ timeout: 30_000 });

      const state = await browser.execute(() => {
        const resourceNames = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name);
        const monacoEnvironment = globalThis.MonacoEnvironment;
        const worker = monacoEnvironment?.getWorker("", "typescript");
        const workerCreated = worker instanceof Worker;
        worker?.terminate();

        return {
          resourceNames,
          workerCreated,
          hasWorkerFactory: typeof monacoEnvironment?.getWorker === "function",
          editorCount: document.querySelectorAll(".monaco-editor").length,
        };
      });

      if (!state.hasWorkerFactory || !state.workerCreated) {
        throw new Error(
          "Monaco ESM worker factory was not installed correctly"
        );
      }

      if (state.editorCount < 2) {
        throw new Error(
          `Expected both Monaco diff panes, found ${state.editorCount} editor root(s)`
        );
      }

      const forbiddenResources = state.resourceNames.filter(
        (name) =>
          name.includes("cdn.jsdelivr.net") ||
          name.includes("/npm/monaco-editor") ||
          name.includes("editor.main.nls")
      );
      if (forbiddenResources.length > 0) {
        throw new Error(
          `Monaco loaded forbidden AMD/CDN resources: ${forbiddenResources.join(", ")}`
        );
      }
    } finally {
      await closeStartupFlowIfPresent();
    }
  });
});
