// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
/** Run component-level lifecycle probes in a verified isolated native WebView. */
export async function runMessagePipelinePage() {
  const vue = (window as unknown as { Vue: typeof import("vue") }).Vue;
  const [{ default: Think }, { default: Renderer }, { default: Tool }] =
    await Promise.all([
      import(
        "/src/" + "tools/rich-text-renderer/components/nodes/LlmThinkNode.vue"
      ),
      import("/src/" + "tools/rich-text-renderer/RichTextRenderer.vue"),
      import("/src/" + "tools/llm-chat/components/message/ToolCallMessage.vue"),
    ]);
  const [{ StreamController }, streams] = await Promise.all([
    import("/src/" + "tools/rich-text-renderer/core/StreamController.ts"),
    import(
      "/src/" + "tools/llm-chat/composables/chat/useStreamingMessageSources.ts"
    ),
  ]);
  const root = document.createElement("section");
  root.style.cssText =
    "position:fixed;inset:80px 40px;z-index:9999;overflow:auto;background:var(--bg-color)";
  document.body.append(root);
  const text = vue.ref("Initial **reasoning**.");
  const thinking = vue.ref(true);
  let app = vue.createApp({
    render: () =>
      vue.h(
        Think,
        {
          rawTagName: "reasoning",
          ruleId: "reasoning-metadata",
          displayName: "Thinking",
          collapsedByDefault: true,
          isThinking: thinking.value,
          rawContent: text.value,
        },
        {
          default: ({
            content,
            expanded,
          }: {
            content: string;
            expanded: boolean;
          }) =>
            vue.h(Renderer, {
              content,
              isStreaming: thinking.value && expanded,
              suspendOnDeactivate: true,
              version: "v2-custom-parser",
              enableEnterAnimation: false,
              throttleEnabled: false,
            }),
        }
      ),
  });
  const rows: { id: string; passed: boolean; details: unknown }[] = [];
  const record = (id: string, passed: boolean, details: unknown) =>
    rows.push({ id, passed, details });
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const wait = async (predicate: () => boolean) => {
    for (let i = 0; i < 160; i++) {
      if (predicate()) return;
      await sleep(25);
    }
    throw new Error("Message pipeline probe timed out");
  };
  const click = () =>
    root.querySelector<HTMLElement>(".llm-think-header")!.click();
  const body = () => root.querySelector(".llm-think-content");
  const sourceId = "native-message-replay-" + Date.now();
  try {
    const replay = "中文".repeat(250000);
    for (const preMount of [false, true]) {
      const emitted: string[] = [];
      const controller = new StreamController({
        onContent: (chunk: string) => emitted.push(chunk),
        smoothingEnabled: true,
      });
      const started = performance.now();
      if (!preMount) controller.markMounted();
      controller.push("prefix ");
      controller.push(replay);
      controller.markMounted();
      controller.push(" suffix");
      controller.flushAndStop();
      record(
        "large-replay-" + (preMount ? "pre-mount" : "mounted"),
        emitted.join("") === "prefix " + replay + " suffix",
        {
          chars: replay.length,
          elapsedMs: performance.now() - started,
          queued: controller.getStatus().semanticQueueLength,
        }
      );
    }
    app.mount(root);
    text.value = "Latest **reasoning**.";
    await vue.nextTick();
    record("reasoning-collapsed", !root.querySelector(".rich-text-renderer"), {
      rendererMounted: !!root.querySelector(".rich-text-renderer"),
    });
    click();
    await wait(() => body()?.textContent?.trim() === "Latest reasoning.");
    const renderer = root.querySelector(".rich-text-renderer");
    record("reasoning-open", !!body()?.querySelector("strong"), {
      text: body()?.textContent,
    });
    click();
    await vue.nextTick();
    text.value = "Finished **answer**.";
    thinking.value = false;
    await sleep(150);
    record(
      "reasoning-hidden-snapshot",
      body()?.textContent?.trim() === "Latest reasoning.",
      { text: body()?.textContent }
    );
    click();
    await wait(() => body()?.textContent?.trim() === "Finished answer.");
    record(
      "reasoning-reopen",
      root.querySelector(".rich-text-renderer") === renderer,
      { text: body()?.textContent }
    );
    app.unmount();
    const message = vue.reactive({
      id: "native-tool-display",
      parentId: null,
      childrenIds: [],
      role: "tool",
      status: "generating",
      content: "first result",
      timestamp: Date.now(),
      metadata: {
        toolCalls: [
          { requestId: "fixture", toolName: "Fixture", status: "success" },
        ],
      },
    });
    app = vue.createApp({
      render: () =>
        vue.h(Tool, { message, sessionIndex: null, sessionDetail: null }),
    });
    const owner = (
      document.querySelector("#app") as Element & {
        __vue_app__: import("vue").App;
      }
    ).__vue_app__;
    app._context.provides = Object.create(owner._context.provides);
    app.mount(root);
    await vue.nextTick();
    record(
      "tool-first-summary",
      root.querySelector(".preview-text")?.textContent?.trim() ===
        "first result",
      { text: root.querySelector(".preview-text")?.textContent }
    );
    root.querySelector<HTMLElement>(".tool-header")!.click();
    await wait(
      () =>
        root.querySelector(".tool-result-text")?.textContent === "first result"
    );
    message.content = '{"value":12';
    await sleep(150);
    record(
      "tool-live-raw",
      root.querySelector(".tool-result-text")?.textContent === message.content,
      { text: root.querySelector(".tool-result-text")?.textContent }
    );
    message.content = '{"value":123}';
    message.status = "complete";
    await wait(
      () =>
        root.querySelector(".tool-result-text")?.textContent ===
        '{\n  "value": 123\n}'
    );
    record("tool-final-format", true, {
      text: root.querySelector(".tool-result-text")?.textContent,
    });
    root.querySelector<HTMLElement>(".tool-header")!.click();
    await vue.nextTick();
    message.content = JSON.stringify({
      results: Array.from({ length: 3000 }, (_, i) => ({
        name: `file-${i}`,
        text: "result ".repeat(20),
      })),
    });
    await sleep(350);
    record(
      "tool-large-collapsed",
      !root.querySelector(".cm-viewer-container"),
      {
        summaryLength: root.querySelector(".preview-text")?.textContent?.trim()
          .length,
      }
    );
    root.querySelector<HTMLElement>(".tool-header")!.click();
    await wait(() => !!root.querySelector(".cm-content"));
    await sleep(200);
    const viewer = (
      root.querySelector(".cm-viewer-container") as Element & {
        __vueParentComponent: { setupState: unknown };
      }
    ).__vueParentComponent;
    const state = viewer.setupState as {
      editorView?: { state: { doc: { toString: () => string } } };
    };
    const actual = state.editorView?.state.doc.toString();
    const lines = root.querySelectorAll(".cm-line").length;
    record(
      "tool-large-viewer",
      !!actual &&
        JSON.stringify(JSON.parse(actual)) === message.content &&
        lines < 300,
      {
        sourceChars: message.content.length,
        displayedChars: actual?.length,
        mountedLines: lines,
        height: root
          .querySelector(".cm-viewer-container")
          ?.getBoundingClientRect().height,
      }
    );
    app.unmount();
    const initial = "中文".repeat(150000);
    const source = streams.getOrCreateStreamingMessageSource(sourceId, initial);
    const events: string[] = [];
    const offData = source.subscribe((chunk: string) => events.push(chunk));
    const offComplete = source.onComplete(() => events.push("complete"));
    const rendererApp = () =>
      vue.createApp({
        render: () =>
          vue.h(Renderer, {
            streamSource: source,
            isStreaming: true,
            smoothingEnabled: true,
            version: "v2-custom-parser",
            enableEnterAnimation: false,
            throttleEnabled: false,
          }),
      });
    app = rendererApp();
    // Each mount subscribes to history; new data and completion arrive before its replay microtask.
    let expected = initial;
    for (let cycle = 1; cycle <= 2; cycle++) {
      app.mount(root);
      const suffix = "尾段" + cycle;
      expected += suffix;
      streams.appendStreamingMessageChunk(sourceId, suffix);
      streams.completeStreamingMessageSource(sourceId);
      await wait(
        () =>
          root.querySelector(".rich-text-renderer")?.textContent?.trim() ===
          expected
      );
      record(
        "renderer-replay-cycle-" + cycle,
        events.slice(0, -1).join("") === expected &&
          events.slice(-1)[0] === "complete",
        {
          chars: expected.length,
          completionAfterData: events.slice(-1)[0] === "complete",
        }
      );
      app.unmount();
      // Vue applications cannot be remounted; a fresh renderer exercises source re-subscription.
      if (cycle === 1) {
        app = rendererApp();
        events.pop();
      }
    }
    offData();
    offComplete();
  } finally {
    streams.disposeStreamingMessageSource(sourceId);
    app.unmount();
    root.remove();
  }
  return rows;
}
