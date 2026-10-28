// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { App, Component, ComponentInternalInstance, VNode } from "vue";

/** Serialized into a real Tauri WebView using the application's own Vue runtime. */
export async function runEmbeddedPreviewPage(input: {
  componentUrl: string;
  cases: { id: string; markdown: string }[];
}) {
  const vue = (window as unknown as { Vue: typeof import("vue") }).Vue;
  const module = await import(input.componentUrl);
  const Renderer = Object.values(module).find(
    (v) => (v as { __name?: string })?.__name === "RichTextRenderer"
  ) as Component;
  if (!Renderer) throw new Error("Compiled renderer export unavailable");
  const host = document.createElement("section");
  host.style.cssText =
    "position:fixed;inset:80px 40px 40px 560px;z-index:9999;overflow:auto;background:var(--bg-color)";
  document.body.append(host);
  let app: App | undefined;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const wait = async (predicate: () => boolean) => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await sleep(25);
    }
    throw new Error("Preview condition timed out");
  };
  const walk = (
    v: VNode | null,
    name: string
  ): ComponentInternalInstance | undefined => {
    if (!v) return;
    if (v.component) {
      if ((v.component.type as { __name?: string }).__name === name)
        return v.component;
      const found = walk(v.component.subTree, name);
      if (found) return found;
    }
    if (v.suspense) {
      const found = walk(v.suspense.activeBranch, name);
      if (found) return found;
    }
    for (const child of Array.isArray(v.children) ? v.children : []) {
      if (child && typeof child === "object") {
        const found = walk(child as VNode, name);
        if (found) return found;
      }
    }
  };
  const results: { id: string; passed: boolean; details: unknown }[] = [];
  const record = (id: string, passed: boolean, details: unknown) =>
    results.push({ id, passed, details });
  const frame = () => host.querySelector("iframe")!;
  const content = vue.ref("");
  const immediate = vue.ref(true);
  const events: { time: number; type: string }[] = [];
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === "preview-fixture-tick")
      events.push({ time: performance.now(), type: e.data.type });
  };
  window.addEventListener("message", onMessage);
  try {
    app = vue.createApp({
      render: () =>
        vue.h(Renderer, {
          content: input.cases.find((c) => c.id === "html-form")!.markdown,
          version: "v2-custom-parser",
          defaultRenderHtml: true,
          defaultCodeBlockExpanded: true,
          smoothingEnabled: false,
          enableEnterAnimation: false,
        }),
    });
    app.mount(host);
    await wait(() => !!frame()?.contentDocument?.querySelector("#note"));
    const Viewer = walk(
      app._instance?.subTree ?? null,
      "HtmlInteractiveViewer"
    )!.type;
    app.unmount();
    const mount = async (html: string, streaming = false) => {
      app?.unmount();
      content.value = html;
      immediate.value = !streaming;
      app = vue.createApp({
        render: () =>
          vue.h(Viewer, {
            content: content.value,
            immediate: immediate.value,
            autoHeight: true,
            showToolbar: false,
            enableCdnLocalizer: false,
          }),
      });
      app.mount(host);
      await wait(() => !!frame()?.contentDocument?.body?.children.length);
      await sleep(150);
    };
    const html = (id: string) => {
      const source = input.cases.find((c) => c.id === id)!.markdown;
      return source.slice(source.indexOf("\n") + 1, source.lastIndexOf("```"));
    };
    const geometry = () => ({
      iframe: frame().getBoundingClientRect().height,
      body: frame().contentDocument!.body.getBoundingClientRect().height,
      root: frame().contentDocument!.documentElement.scrollHeight,
    });
    await mount(html("html-canvas-resize"));
    const initial = geometry();
    (frame().contentDocument!.querySelector("#resize") as HTMLElement).click();
    await sleep(250);
    const expanded = geometry();
    (frame().contentDocument!.querySelector("#resize") as HTMLElement).click();
    await sleep(250);
    const collapsed = geometry();
    record(
      "canvas-grow-shrink",
      expanded.iframe > initial.iframe + 300 &&
        Math.abs(collapsed.iframe - initial.iframe) <= 2,
      { initial, expanded, collapsed }
    );
    app!.unmount();
    app = undefined;
    await sleep(250);
    const tickStart = events.length;
    await sleep(500);
    record("canvas-unmount-stops-ticks", events.length === tickStart, {
      lateTicks: events.length - tickStart,
    });

    await mount(html("html-async-image"));
    const beforeImage = geometry();
    await wait(
      () =>
        !!(
          frame().contentDocument!.querySelector(
            "#late-image"
          ) as HTMLImageElement
        )?.naturalHeight
    );
    await sleep(150);
    const withImage = geometry();
    (
      frame().contentDocument!.querySelector("#late-image") as HTMLElement
    ).remove();
    await sleep(200);
    const removedImage = geometry();
    record(
      "async-image-grow-shrink",
      withImage.iframe > beforeImage.iframe + 200 &&
        removedImage.iframe < withImage.iframe - 200,
      { beforeImage, withImage, removedImage }
    );

    await mount(
      '<!doctype html><html><head></head><body><main style="height:180px">content</main><aside style="position:fixed;inset:0;pointer-events:none">HUD</aside></body></html>'
    );
    const fixed = geometry();
    record(
      "fixed-overlay-retains-viewport",
      Math.abs(fixed.iframe - 180) <= 2,
      fixed
    );
    await mount(
      '<!doctype html><html><head></head><body><main style="height:240px;position:relative"><div id="half" style="height:50%">half</div></main></body></html>'
    );
    const percentage = geometry();
    const half = frame()
      .contentDocument!.querySelector("#half")!
      .getBoundingClientRect().height;
    record(
      "percentage-content-height",
      Math.abs(percentage.iframe - 240) <= 2 && Math.abs(half - 120) <= 2,
      { ...percentage, half }
    );
    await mount(html("html-form"), true);
    const formFrame = frame();
    const formDocument = formFrame.contentDocument!;
    (formDocument.querySelector("#note") as HTMLInputElement).value =
      "保留的输入 🌿";
    (formDocument.querySelector("#increment") as HTMLElement).click();
    let loads = 0;
    formFrame.addEventListener("load", () => loads++);
    content.value = content.value.slice(0, -1);
    immediate.value = true;
    await vue.nextTick();
    await sleep(1200);
    const note = (
      frame().contentDocument!.querySelector("#note") as HTMLInputElement
    )?.value;
    const count = frame().contentDocument!.querySelector("#count")?.textContent;
    record(
      "fence-newline-retains-form",
      frame().contentDocument === formDocument &&
        loads === 0 &&
        note === "保留的输入 🌿" &&
        count === "1",
      { loads, note, count }
    );
    content.value = content.value.replace("FINAL_FORM", "CHANGED_FORM");
    await vue.nextTick();
    await sleep(250);
    record(
      "changed-document-still-navigates",
      loads === 1 &&
        frame().contentDocument !== formDocument &&
        frame().contentDocument?.body.textContent?.includes("CHANGED_FORM") ===
          true,
      { loads }
    );
    return results;
  } finally {
    app?.unmount();
    host.remove();
    window.removeEventListener("message", onMessage);
  }
}
