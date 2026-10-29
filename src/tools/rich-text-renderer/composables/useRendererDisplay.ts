// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  watch,
  type InjectionKey,
  type Ref,
} from "vue";

export interface RendererReadingArea {
  reservesRowGeometry?: boolean;
  register(element: Ref<HTMLElement | null>): Ref<boolean>;
}
export const rendererReadingAreaKey: InjectionKey<RendererReadingArea> = Symbol(
  "renderer-reading-area"
);
export const rendererReadingScopeKey: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol("renderer-reading-scope");
export const rendererLayoutRevisionKey: InjectionKey<Readonly<Ref<string>>> =
  Symbol("renderer-layout-revision");
/** The row shell owns occupied geometry, including content that has never been displayed. */
export const rendererRowGeometryKey: InjectionKey<boolean> = Symbol(
  "renderer-row-geometry"
);
interface ReadingInteraction {
  selection: Ref<boolean>;
  focus: Ref<Element | null>;
}
const interactionKey: InjectionKey<ReadingInteraction> = Symbol(
  "renderer-reading-interaction"
);

/** One set of document listeners per active message list. A selection restores the full copy range. */
export function provideRendererReadingInteraction(
  active: Readonly<Ref<boolean>>
) {
  const state: ReadingInteraction = {
    selection: ref(false),
    focus: shallowRef(null),
  };
  provide(interactionKey, state);
  watch(
    active,
    (enabled, _, cleanup) => {
      if (!enabled) return;
      const updateSelection = () => {
        const selection = document.getSelection();
        state.selection.value = !!selection && !selection.isCollapsed;
      };
      const updateFocus = () => {
        state.focus.value = document.activeElement;
      };
      const onFocusOut = () => {
        queueMicrotask(updateFocus);
      };
      updateSelection();
      updateFocus();
      document.addEventListener("selectionchange", updateSelection);
      document.addEventListener("focusin", updateFocus);
      document.addEventListener("focusout", onFocusOut);
      cleanup(() => {
        document.removeEventListener("selectionchange", updateSelection);
        document.removeEventListener("focusin", updateFocus);
        document.removeEventListener("focusout", onFocusOut);
        state.selection.value = false;
        state.focus.value = null;
      });
    },
    { immediate: true, flush: "sync" }
  );
  return state;
}

export function useRendererReadingInteraction() {
  return inject(interactionKey, undefined);
}

const EMBEDDED_STATE =
  'iframe, video, audio, .video-node-container, .audio-node-container, input, textarea, select, [contenteditable="true"]:not(.cm-content), details:not(.details-node), canvas, object, embed';
const RECYCLE_DELAY = 300;

/** Keep source/parser ownership; defer quiet display trees when measured or protected by row geometry. */
export function useRendererDisplay(options: {
  root: Ref<HTMLElement | null>;
  hostActive: Readonly<Ref<boolean>>;
  enabled: () => boolean;
  live: () => boolean;
  revision: () => unknown;
  held: Readonly<Ref<boolean>>;
  pending?: Readonly<Ref<boolean>>;
}) {
  const nearby = inject(rendererReadingScopeKey, undefined);
  const layoutRevision = inject(rendererLayoutRevisionKey, undefined);
  const interaction = inject(interactionKey, undefined);
  const rowGeometry = inject(rendererRowGeometryKey, false);
  const suspended = ref(rowGeometry);
  const measured = ref(false);
  const height = ref(0);
  const keepEmbedded = ref(false);
  const hasResumed = ref(false);
  let measuredWidth = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const protectedReading = computed(
    () =>
      !!interaction?.selection.value ||
      (!!interaction?.focus.value &&
        !!options.root.value?.contains(interaction.focus.value))
  );
  const active = computed(
    () =>
      !options.enabled() ||
      options.live() ||
      options.held.value ||
      keepEmbedded.value ||
      (options.hostActive.value &&
        (!suspended.value ||
          (!measured.value && !rowGeometry) ||
          !!nearby?.value ||
          protectedReading.value))
  );
  const eligible = computed(
    () =>
      options.enabled() &&
      !!nearby &&
      !nearby.value &&
      (measured.value || rowGeometry) &&
      options.hostActive.value &&
      !options.live() &&
      !options.held.value &&
      !options.pending?.value &&
      !protectedReading.value
  );
  const embedded = () => !!options.root.value?.querySelector(EMBEDDED_STATE);
  function cancelTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function schedule() {
    cancelTimer();
    if (!eligible.value) {
      if (
        !options.enabled() ||
        (!measured.value && !rowGeometry) ||
        !nearby ||
        nearby.value ||
        options.live() ||
        options.held.value ||
        protectedReading.value
      )
        suspended.value = false;
      return;
    }
    if (suspended.value) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed && eligible.value && !embedded()) suspended.value = true;
    }, RECYCLE_DELAY);
  }
  const observer = new ResizeObserver(([entry]) => {
    if (
      !entry ||
      !options.enabled() ||
      !options.hostActive.value ||
      entry.contentRect.width <= 0
    )
      return;
    if (
      measured.value &&
      Math.abs(entry.contentRect.width - measuredWidth) > 1 / 64
    ) {
      invalidate();
      return; // This notification may still describe the old fixed-height placeholder.
    }
    if (
      active.value &&
      !options.pending?.value &&
      options.hostActive.value &&
      entry.contentRect.height > 0 &&
      entry.contentRect.width > 0
    ) {
      height.value = entry.contentRect.height;
      measuredWidth = entry.contentRect.width;
      if (!options.live()) measured.value = true;
      schedule();
    }
  });
  function invalidate() {
    measured.value = false;
    suspended.value = rowGeometry && !!nearby && !nearby.value && !embedded();
    cancelTimer();
    if (!options.enabled() || options.live()) return;
    void nextTick(() => {
      const element = options.root.value;
      if (!disposed && element && options.hostActive.value) {
        observer.unobserve(element);
        observer.observe(element);
      }
    });
  }
  watch(
    options.root,
    (element, old) => {
      if (old) observer.unobserve(old);
      if (element) observer.observe(element);
    },
    { flush: "post" }
  );
  watch(
    [
      options.revision,
      () => layoutRevision?.value,
      options.live,
      options.enabled,
    ],
    invalidate,
    { deep: true }
  );
  watch(
    () => options.pending?.value,
    (pending) => {
      const element = options.root.value;
      if (!pending && element && options.hostActive.value) {
        observer.unobserve(element);
        observer.observe(element);
      }
    },
    { flush: "post" }
  );
  watch(eligible, schedule, { immediate: true, flush: "post" });
  watch(
    options.hostActive,
    (enabled) => {
      if (!options.enabled()) return;
      keepEmbedded.value = !enabled && embedded();
      if (!enabled && rowGeometry && nearby && !nearby.value)
        suspended.value = true;
      schedule();
    },
    { flush: "sync" }
  );
  watch(
    options.live,
    () => {
      if (!options.hostActive.value && options.enabled())
        keepEmbedded.value = embedded();
    },
    { flush: "post" }
  );
  watch(active, (value, previous) => {
    if (value && !previous) hasResumed.value = true;
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelTimer();
    observer.disconnect();
  });
  return {
    active,
    hasResumed,
    style: computed(() =>
      active.value ? undefined : { height: height.value + "px" }
    ),
  };
}
