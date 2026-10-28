// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
/** Run component-level lifecycle probes in a verified isolated native WebView. */
export async function runMessagePipelinePage() {
  const vue = (window as unknown as { Vue: typeof import("vue") }).Vue;
  const [{ default: Think }, { default: Renderer }] = await Promise.all([
    import(
      "/src/" + "tools/rich-text-renderer/components/nodes/LlmThinkNode.vue"
    ),
    import("/src/" + "tools/rich-text-renderer/RichTextRenderer.vue"),
  ]);
  const root = document.createElement("section");
  root.style.cssText =
    "position:fixed;inset:80px 40px;z-index:9999;overflow:auto;background:var(--bg-color)";
  document.body.append(root);
  const text = vue.ref("Initial **reasoning**.");
  const thinking = vue.ref(true);
  const app = vue.createApp({
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
  try {
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
  } finally {
    app.unmount();
    root.remove();
  }
  return rows;
}
