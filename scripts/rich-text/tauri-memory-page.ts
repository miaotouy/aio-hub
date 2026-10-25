// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { App, Component, Ref } from "vue";
import type {
  AstNode,
  StreamSource,
} from "../../src/tools/rich-text-renderer/types";

export interface TauriMemoryPage {
  mount(mode: "source" | "props" | "static", text?: string): Promise<void>;
  push(text: string): Promise<void>;
  finish(): Promise<void>;
  resume(text: string): Promise<void>;
  signature(): Promise<string>;
  dom(): {
    elements: number;
    text: string;
    links: number;
    codeBlocks: number;
    editors: number;
    viewers: number;
    headers: number;
    headerElements: number;
    fallbackElements: number;
    hiddenFallbacks: number;
    editorElements: number;
    codeBlockElements: number;
    buttons: number;
    scrollHeight: number;
  };
  scrollStep(
    reset?: boolean
  ): Promise<{ top: number; max: number; atEnd: boolean }>;
  scrollEditors(): Promise<{ editors: number; scrollableEditors: number }>;
  dispose(): Promise<void>;
  released(): {
    componentAlive: boolean;
    elementAlive: boolean;
    subscriptions: number;
  };
  cleanup(): void;
}

declare global {
  interface Window {
    __RICH_TEXT_MEMORY__?: TauriMemoryPage;
  }
}

// Serialized by Playwright into the verified Tauri page; all runtime dependencies
// are resolved there, using the application's own Vue instance and compiled renderer module.
export async function installTauriMemoryPage(componentUrl: string) {
  const vue = (window as unknown as { Vue: typeof import("vue") }).Vue;
  if (!vue) throw new Error("Application Vue runtime is unavailable");
  const hook = (
    window as unknown as {
      __VUE_DEVTOOLS_GLOBAL_HOOK__?: { emit: (...args: unknown[]) => void };
    }
  ).__VUE_DEVTOOLS_GLOBAL_HOOK__;
  const originalEmit = hook?.emit;
  const module = (await import(componentUrl)) as Record<string, unknown>;
  const candidates = Object.values(module).filter(
    (value) =>
      !!value &&
      typeof value === "object" &&
      (value as { __name?: string }).__name === "RichTextRenderer"
  );
  if (candidates.length !== 1)
    throw new Error(
      "Expected the actual compiled RichTextRenderer component export"
    );
  const Renderer = candidates[0] as Component;
  // DevTools caches component events; suppress them for this isolated probe.
  if (hook) hook.emit = () => {};
  const badge = document.createElement("aside");
  badge.id = "rich-text-memory-probe-status";
  badge.setAttribute("aria-label", "独立内存测试配置");
  badge.style.cssText =
    "position:fixed;top:80px;left:560px;right:20px;z-index:9001;padding:8px 16px;background:var(--bg-color);color:var(--text-color);border:1px solid var(--border-color);font:13px sans-serif";
  badge.textContent = "独立内存探针 · V2 自研解析器 · 代码块展开 · 平滑关闭";
  document.body.append(badge);
  const host = document.createElement("section");
  host.id = "rich-text-memory-probe";
  host.style.cssText =
    "position:fixed;inset:120px 20px 20px 560px;z-index:9000;overflow:auto;background:var(--bg-color);padding:16px";
  document.body.append(host);
  let app: App | null = null;
  let target: Ref<{
    ast: AstNode[];
    $props: { version: string };
  } | null> | null = null;
  let content: Ref<string> | null = null;
  let streaming: Ref<boolean> | null = null;
  let onChunk: ((chunk: string) => void) | null = null;
  let onComplete: (() => void) | null = null;
  let mode: "source" | "props" | "static" = "source";
  let componentWeak: WeakRef<object> | null = null;
  let elementWeak: WeakRef<Element> | null = null;
  const frame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const tick = async () => {
    await vue.nextTick();
    await frame();
  };
  const astValue = (nodes: AstNode[]): unknown =>
    nodes.map((node) => {
      const props: Record<string, unknown> = { ...node.props };
      if (node.type === "list" && props.ordered) props.start ??= 1;
      return {
        type: node.type,
        props: Object.fromEntries(
          Object.entries(props).sort(([a], [b]) => a.localeCompare(b))
        ),
        ...(node.children ? { children: astValue(node.children) } : {}),
      };
    });
  const harness: TauriMemoryPage = {
    async mount(nextMode, text = "") {
      if (app) throw new Error("Dispose the previous renderer first");
      mode = nextMode;
      content = vue.ref(text);
      streaming = vue.ref(mode !== "static");
      target = vue.shallowRef(null);
      const source: StreamSource = {
        subscribe(callback) {
          onChunk = callback;
          return () => {
            onChunk = null;
          };
        },
        onComplete(callback) {
          onComplete = callback;
          return () => {
            onComplete = null;
          };
        },
      };
      app = vue.createApp({
        render: () =>
          vue.h(Renderer, {
            ref: target,
            version: "v2-custom-parser",
            ...(mode === "source"
              ? { streamSource: source }
              : { content: content!.value, isStreaming: streaming!.value }),
            smoothingEnabled: false,
            enableEnterAnimation: false,
            // Retain the production AST throttle and safety guard defaults.
            defaultCodeBlockExpanded: true,
          }),
      });
      host.scrollTop = 0;
      app.mount(host);
      badge.textContent =
        "独立内存探针 · V2 自研解析器 · 代码块展开 · 平滑关闭 · " +
        (mode === "source"
          ? "StreamSource"
          : mode === "props"
            ? "内容属性流"
            : "静态内容");
      await tick();
      if (target.value?.$props.version !== "v2-custom-parser")
        throw new Error("Mounted renderer version is not V2");
      componentWeak = new WeakRef(target.value!);
      elementWeak = new WeakRef(host.firstElementChild!);
    },
    async push(text) {
      if (mode === "source") {
        if (!onChunk) throw new Error("Stream subscriber is missing");
        onChunk(text);
      } else content!.value += text;
      await tick();
    },
    async finish() {
      if (mode === "source") {
        if (!onComplete)
          throw new Error("Stream completion subscriber is missing");
        onComplete();
      } else streaming!.value = false;
      await tick();
    },
    async resume(text) {
      if (mode !== "props")
        throw new Error("Resume requires the content-prop mode");
      streaming!.value = true;
      await tick();
      content!.value += text;
      await tick();
    },
    async signature() {
      const bytes = new TextEncoder().encode(
        JSON.stringify(astValue(target?.value?.ast ?? []))
      );
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), (x) =>
        x.toString(16).padStart(2, "0")
      ).join("");
    },
    dom() {
      return {
        elements: host.querySelectorAll("*").length,
        text: host.textContent?.slice(-300) ?? "",
        links: host.querySelectorAll("a").length,
        codeBlocks: host.querySelectorAll(".markdown-code-block").length,
        editors: host.querySelectorAll(".cm-editor").length,
        viewers: host.querySelectorAll(".cm-viewer-container").length,
        headers: host.querySelectorAll(".code-header").length,
        headerElements: host.querySelectorAll(".code-header, .code-header *")
          .length,
        fallbackElements: host.querySelectorAll(
          ".pre-fallback, .pre-fallback *"
        ).length,
        hiddenFallbacks: [
          ...host.querySelectorAll<HTMLElement>(".pre-fallback"),
        ].filter((x) => x.style.display === "none").length,
        editorElements: host.querySelectorAll(".cm-editor, .cm-editor *")
          .length,
        codeBlockElements: host.querySelectorAll(
          ".markdown-code-block, .markdown-code-block *"
        ).length,
        buttons: host.querySelectorAll(".markdown-code-block button").length,
        scrollHeight: host.scrollHeight,
      };
    },
    async scrollStep(reset = false) {
      host.scrollTop = reset
        ? 0
        : host.scrollTop + Math.max(1, host.clientHeight * 0.75);
      await tick();
      await new Promise((resolve) => setTimeout(resolve, 60));
      await tick();
      const max = Math.max(0, host.scrollHeight - host.clientHeight);
      return { top: host.scrollTop, max, atEnd: host.scrollTop >= max - 2 };
    },
    async scrollEditors() {
      const editors = [...host.querySelectorAll<HTMLElement>(".cm-scroller")];
      let scrollableEditors = 0;
      for (const editor of editors) {
        if (editor.scrollHeight <= editor.clientHeight + 2) continue;
        scrollableEditors++;
        for (let steps = 0; steps < 10000; steps++) {
          editor.scrollTop += Math.max(1, editor.clientHeight * 0.75);
          await tick();
          if (editor.scrollTop >= editor.scrollHeight - editor.clientHeight - 2)
            break;
          if (steps === 9999)
            throw new Error("Editor scroll exceeded 10000 steps");
        }
      }
      await tick();
      return { editors: editors.length, scrollableEditors };
    },
    async dispose() {
      app?.unmount();
      app = null;
      target = null;
      content = null;
      streaming = null;
      await tick();
      if (host.childElementCount)
        throw new Error("Renderer DOM remains after unmount");
    },
    released() {
      return {
        componentAlive: !!componentWeak?.deref(),
        elementAlive: !!elementWeak?.deref(),
        subscriptions: Number(!!onChunk) + Number(!!onComplete),
      };
    },
    cleanup() {
      app?.unmount();
      app = null;
      host.remove();
      badge.remove();
      if (hook && originalEmit) hook.emit = originalEmit;
      delete window.__RICH_TEXT_MEMORY__;
    },
  };
  window.__RICH_TEXT_MEMORY__ = harness;
  return {
    vue: vue.version,
    renderer: "v2-custom-parser",
    componentUrl,
    devtoolsPresent: !!hook,
  };
}
