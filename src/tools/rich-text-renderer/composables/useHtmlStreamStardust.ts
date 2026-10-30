// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { shallowRef, type Ref } from "vue";
import { useStreamStardust } from "./useStreamStardust";
import { collectStreamText } from "../utils/streamTextTargets";
import type { StreamEffect } from "../utils/streamStardust";

/** Attach to the existing same-origin preview; keep its sandbox policy intact. */
export function useHtmlStreamStardust(
  iframe: Ref<HTMLIFrameElement | null>,
  effect: () => StreamEffect,
  active: () => boolean,
  streaming: () => boolean
) {
  const body = shallowRef<HTMLElement | null>(null);
  let previousText: string[] = [];
  const stats = useStreamStardust(body, effect, active, streaming, () => {
    const previous = previousText;
    previousText = collectStreamText(body.value!).map((text) => text.data);
    return { html: true, previousText: previous };
  });
  return {
    stats,
    beforeNavigate() {
      if (body.value && effect() !== "none")
        previousText = collectStreamText(body.value).map((text) => text.data);
      body.value = null;
    },
    onLoad() {
      try {
        body.value = iframe.value?.contentDocument?.body ?? null;
      } catch {
        // User navigation may leave the same-origin preview document.
        body.value = null;
      }
    },
  };
}
