// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  cloneVNode,
  computed,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  provide,
  shallowRef,
  watch,
  type InjectionKey,
  type Ref,
  type VNode,
} from "vue";
import type { AstNode } from "../types";
import type { RendererLayoutState } from "./useRendererLayoutState";
import {
  rendererLayoutRevisionKey,
  useRendererReadingInteraction,
} from "./useRendererDisplay";
import {
  rendererViewportKey,
  type provideRendererViewState,
} from "./useRendererViewState";

const CANDIDATES = new Set([
  "paragraph",
  "heading",
  "code_block",
  "mermaid",
  "list",
  "blockquote",
  "alert",
  "hr",
  "table",
  "katex_block",
  "llm_think",
  "vcp_tool",
  "vcp_role",
  "vcp_daily_note",
]);
const EMBEDDED =
  'iframe,video,audio,input:not(.cm-content),textarea,select,[contenteditable="true"]:not(.cm-content),details:not(.details-node),canvas,object,embed';
const FOCUSABLE =
  'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';
const MARGIN = 700;
const DELAY = 300;
interface Snapshot {
  tag: string;
  attrs: Record<string, string>;
  height: number;
  marginTop: string;
  marginBottom: string;
  focusable: boolean;
}
interface Entry {
  node: AstNode;
  element: HTMLElement | null;
  nearby: boolean;
  suspended: boolean;
  resumed: boolean;
  version: number;
  snapshot?: Snapshot;
  focusPending?: boolean;
  bind: (value: unknown) => void;
}
interface Blocks {
  revision: Ref<number>;
  sync(nodes: AstNode[]): void;
  version(node: AstNode): number;
  render(node: AstNode, render: (restored: boolean) => VNode): VNode;
}
export const rendererBlockMountingKey: InjectionKey<Blocks> = Symbol(
  "renderer-block-mounting"
);

/** Measure native block roots before disposal. Placeholders keep their tag, margins and border box. */
export function provideRendererBlockMounting(options: {
  root: Ref<HTMLElement | null>;
  nodes: Ref<AstNode[]>;
  enabled: () => boolean;
  hostActive: Readonly<Ref<boolean>>;
  live: () => boolean;
  held: Readonly<Ref<boolean>>;
  layout: () => unknown;
  state: ReturnType<typeof provideRendererViewState>;
  layoutState?: RendererLayoutState;
}) {
  const revision = shallowRef(0);
  const entries = new Map<string, Entry>();
  const targets = new WeakMap<Element, Entry>();
  const viewport = inject(rendererViewportKey, undefined);
  const layoutRevision = inject(rendererLayoutRevisionKey, undefined);
  const reading = useRendererReadingInteraction();
  const screenshot = inject<Readonly<Ref<boolean>>>(
    "screenshotMode",
    shallowRef(false)
  );
  const protectedReading = computed(
    () =>
      !!reading?.selection.value ||
      (!!reading?.focus.value &&
        !!options.root.value?.contains(reading.focus.value))
  );
  const enabled = computed(
    () =>
      typeof IntersectionObserver !== "undefined" &&
      typeof ResizeObserver !== "undefined" &&
      options.enabled() &&
      options.nodes.value.length >= 40 &&
      !options.live() &&
      !screenshot.value
  );
  const protectedDisplay = computed(
    () => protectedReading.value || options.held.value
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: IntersectionObserver | undefined;
  let resize: ResizeObserver | undefined;
  let disposed = false;
  let width = 0;
  let shiftTab = false;
  let scrollFrame = 0;
  const bump = (entry: Entry) => {
    entry.version++;
    revision.value++;
  };
  function cancel() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function resume(entry: Entry) {
    if (!entry.suspended) return;
    options.state.setSubtreeSuspended(entry.node, false);
    entry.suspended = false;
    entry.resumed = true;
    bump(entry);
  }
  function restoreAll() {
    cancel();
    const root = options.root.value;
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    // Root offsets count Vue fragment markers too; retain block boundaries across reconstruction.
    const boundary = (container: Node, offset: number, end: boolean) => {
      if (container !== root || !root) return;
      let node: ChildNode | null =
        root.childNodes[end ? offset - 1 : offset] ?? null;
      while (node && !(node instanceof HTMLElement))
        node = end ? node.previousSibling : node.nextSibling;
      if (!(node instanceof HTMLElement)) return;
      const entry = targets.get(node);
      return () =>
        entry?.element ??
        (node instanceof HTMLElement && node.isConnected ? node : undefined);
    };
    const start =
      range && boundary(range.startContainer, range.startOffset, false);
    const end = range && boundary(range.endContainer, range.endOffset, true);
    const backwards =
      !!range &&
      selection?.anchorNode === range.endContainer &&
      selection?.anchorOffset === range.endOffset;
    const restoring = [...entries.values()].some((entry) => entry.suspended);
    for (const entry of entries.values()) resume(entry);
    if (restoring && range && selection && (start || end))
      void nextTick(() => {
        if (!selection.rangeCount || selection.getRangeAt(0) !== range) return;
        const a = start?.(),
          b = end?.();
        if (a) range.setStartBefore(a);
        if (b) range.setEndAfter(b);
        if (backwards)
          selection.setBaseAndExtent(
            range.endContainer,
            range.endOffset,
            range.startContainer,
            range.startOffset
          );
      });
  }
  function scaleFor(style: CSSStyleDeclaration): number | undefined {
    const zoomValue = style.getPropertyValue("zoom");
    const zoom = parseFloat(zoomValue) || 1;
    let scale = zoomValue.endsWith("%") ? zoom / 100 : zoom;
    if (style.transform && style.transform !== "none") {
      if (typeof DOMMatrixReadOnly === "undefined") return;
      const matrix = new DOMMatrixReadOnly(style.transform);
      if (
        !matrix.is2D ||
        Math.abs(matrix.b) > 1e-6 ||
        Math.abs(matrix.c) > 1e-6
      )
        return;
      scale *= Math.abs(matrix.d);
    }
    return scale > 0 ? scale : undefined;
  }
  function ancestorScale(): number | undefined {
    let scale = 1;
    let element = options.root.value;
    while (element) {
      const next = scaleFor(getComputedStyle(element));
      if (next === undefined) return;
      scale *= next;
      element = element.parentElement;
    }
    return scale;
  }
  function snapshot(entry: Entry, parentScale: number): Snapshot | undefined {
    const element = entry.element;
    if (
      !element?.isConnected ||
      element.matches(EMBEDDED) ||
      element.querySelector(EMBEDDED)
    )
      return;
    const style = getComputedStyle(element);
    if (
      style.display === "contents" ||
      style.position === "absolute" ||
      style.position === "fixed"
    )
      return;
    const ownScale = scaleFor(style);
    if (ownScale === undefined) return;
    // RO blockSize rounds to a different grid at fractional DPI. Preserve the actual layout edge.
    const height =
      element.getBoundingClientRect().height / (parentScale * ownScale) +
      0.0001;
    if (!Number.isFinite(height) || height <= 0) return;
    const attrs = Object.fromEntries(
      [...element.attributes].map((a) => [a.name, a.value])
    );
    attrs.class = (attrs.class ?? "").replace(/\brich-text-node\b/g, "").trim();
    return {
      tag: element.tagName.toLowerCase(),
      attrs,
      height,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      focusable: !!element.querySelector(FOCUSABLE),
    };
  }
  function schedule() {
    if (
      timer !== undefined ||
      !enabled.value ||
      protectedDisplay.value ||
      !options.hostActive.value
    )
      return;
    timer = setTimeout(() => {
      timer = undefined;
      if (
        disposed ||
        !enabled.value ||
        protectedDisplay.value ||
        !options.hostActive.value
      )
        return;
      const scale = ancestorScale();
      if (scale === undefined) return;
      for (const entry of entries.values()) {
        // Preserve the trailing block used by the chat bottom anchor.
        if (
          entry.nearby ||
          entry.suspended ||
          entry.node === options.nodes.value[options.nodes.value.length - 1] ||
          entry.node.meta.status !== "stable" ||
          options.layoutState?.hasPending(entry.node)
        )
          continue;
        const saved = snapshot(entry, scale);
        if (!saved) continue;
        entry.snapshot = saved;
        options.state.setSubtreeSuspended(entry.node, true);
        entry.suspended = true;
        bump(entry);
      }
    }, DELAY);
  }
  function checkViewport() {
    scrollFrame = 0;
    if (disposed || !enabled.value || !options.hostActive.value) return;
    const area = viewport?.value?.getBoundingClientRect() ?? {
      top: 0,
      bottom: innerHeight,
    };
    for (const entry of entries.values()) {
      if (!entry.element) continue;
      const rect = entry.element.getBoundingClientRect();
      const nearby =
        rect.width > 0 &&
        rect.bottom > area.top - MARGIN &&
        rect.top < area.bottom + MARGIN;
      entry.nearby = nearby;
      if (nearby) resume(entry);
    }
    schedule();
  }
  function scheduleViewport() {
    if (!scrollFrame && enabled.value)
      scrollFrame = requestAnimationFrame(checkViewport);
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === "Tab") shiftTab = event.shiftKey;
  }
  function createEntry(node: AstNode): Entry {
    const entry: Entry = {
      node,
      element: null,
      nearby: true,
      suspended: false,
      resumed: false,
      version: 1,
      bind(value) {
        let element =
          value instanceof HTMLElement
            ? value
            : (value as { $el?: unknown } | null)?.$el;
        // Multi-root nodes put the visible block before their teleported viewer.
        if (element instanceof Text || element instanceof Comment)
          element = element.nextElementSibling;
        if (
          element instanceof HTMLElement &&
          !options.root.value?.contains(element)
        )
          element = undefined;
        if (entry.element === element) return;
        if (entry.element) {
          observer?.unobserve(entry.element);
        }
        entry.element = element instanceof HTMLElement ? element : null;
        if (!entry.element || disposed) return;
        targets.set(entry.element, entry);
        observer?.observe(entry.element);
        scheduleViewport();
        if (entry.focusPending && !entry.suspended) {
          entry.focusPending = false;
          void nextTick(() => {
            const focusable = [
              ...(entry.element?.querySelectorAll<HTMLElement>(FOCUSABLE) ??
                []),
            ];
            const target = shiftTab
              ? focusable[focusable.length - 1]
              : focusable[0];
            target?.focus({ preventScroll: true });
          });
        }
      },
    };
    return entry;
  }
  const blocks: Blocks = {
    revision,
    sync(nodes) {
      if (!enabled.value && entries.size === 0) return;
      const ids = new Set(nodes.map((node) => node.id));
      for (const [id, entry] of entries)
        if (!ids.has(id)) {
          if (entry.element) observer?.unobserve(entry.element);
          options.state.setSubtreeSuspended(entry.node, false);
          options.state.forgetSubtree(entry.node);
          entries.delete(id);
        }
      for (const node of nodes) {
        if (!CANDIDATES.has(node.type)) continue;
        const entry = entries.get(node.id);
        if (!entry) entries.set(node.id, createEntry(node));
        else if (entry.node !== node) {
          resume(entry);
          entry.node = node;
          entry.snapshot = undefined;
        }
      }
    },
    version(node) {
      return entries.get(node.id)?.version ?? 0;
    },
    render(node, render) {
      const entry = entries.get(node.id);
      if (!entry) return render(false);
      if (!entry.suspended || !entry.snapshot)
        return cloneVNode(render(entry.resumed), { ref: entry.bind });
      const saved = entry.snapshot;
      return h(saved.tag, {
        ...saved.attrs,
        key: node.id,
        ref: entry.bind,
        "data-render-placeholder": "",
        style: [
          saved.attrs.style,
          {
            height: saved.height + "px",
            boxSizing: "border-box",
            marginTop: saved.marginTop,
            marginBottom: saved.marginBottom,
            overflow: "hidden",
          },
        ],
        tabindex: saved.focusable ? 0 : undefined,
        onFocus: () => {
          entry.focusPending = true;
          resume(entry);
        },
        onPointerdown: () => resume(entry),
      });
    },
  };
  provide(rendererBlockMountingKey, blocks);
  watch(
    [enabled, protectedDisplay],
    ([active, protectedValue]) => {
      if (!active || protectedValue) restoreAll();
      if (active) {
        blocks.sync(options.nodes.value);
        startTracking();
        scheduleViewport();
      } else stopTracking();
    },
    { flush: "sync", immediate: true }
  );
  watch(options.nodes, (nodes) => blocks.sync(nodes), { flush: "sync" });
  watch(() => options.layoutState?.pending.value, scheduleViewport);
  watch(
    [options.layout, () => layoutRevision?.value],
    () => {
      restoreAll();
      width = 0;
      scheduleViewport();
    },
    { deep: true }
  );
  watch(
    options.root,
    (root, old) => {
      if (old) resize?.unobserve(old);
      if (root) resize?.observe(root);
      scheduleViewport();
    },
    { flush: "post" }
  );
  watch(options.hostActive, (active) => {
    if (active) scheduleViewport();
    else cancel();
  });
  function startTracking() {
    if (
      observer ||
      typeof IntersectionObserver === "undefined" ||
      typeof ResizeObserver === "undefined"
    )
      return;
    observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const entry = targets.get(change.target);
          if (!entry || entry.element !== change.target) continue;
          entry.nearby = change.isIntersecting;
          if (entry.nearby && options.hostActive.value) resume(entry);
        }
        schedule();
      },
      { root: viewport?.value ?? null, rootMargin: `${MARGIN}px` }
    );
    resize = new ResizeObserver((changes) => {
      for (const change of changes) {
        if (!options.hostActive.value || change.contentRect.width <= 0)
          continue;
        if (change.target === options.root.value) {
          if (width > 0 && Math.abs(width - change.contentRect.width) > 1 / 64)
            restoreAll();
          width = change.contentRect.width;
          scheduleViewport();
        }
      }
    });
    for (const entry of entries.values())
      if (entry.element) {
        observer.observe(entry.element);
      }
    if (options.root.value) resize.observe(options.root.value);
    window.addEventListener("scroll", scheduleViewport, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", scheduleViewport, { passive: true });
    document.addEventListener("keydown", keydown, true);
  }
  function stopTracking() {
    cancel();
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    observer?.disconnect();
    resize?.disconnect();
    observer = undefined;
    resize = undefined;
    window.removeEventListener("scroll", scheduleViewport, true);
    window.removeEventListener("resize", scheduleViewport);
    document.removeEventListener("keydown", keydown, true);
  }
  onBeforeUnmount(() => {
    disposed = true;
    stopTracking();
    entries.clear();
  });
  return blocks;
}
