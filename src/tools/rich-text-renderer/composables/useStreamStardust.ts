// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import {
  createStreamStardust,
  type StreamEffect,
  type StreamStardustOptions,
} from "../utils/streamStardust";

export function useStreamStardust(
  root: Ref<HTMLElement | null>,
  effect: () => StreamEffect,
  active: () => boolean,
  streaming: () => boolean,
  options?: () => StreamStardustOptions
) {
  const reduced = ref(false);
  let media: MediaQueryList | undefined;
  let controller: ReturnType<typeof createStreamStardust> | undefined;
  let live = false;
  const onMotionChange = () => {
    reduced.value = media?.matches ?? false;
  };
  function releaseMotionListener() {
    media?.removeEventListener("change", onMotionChange);
    media = undefined;
  }
  watch(
    () => [root.value, effect(), active(), streaming(), reduced.value] as const,
    ([element, mode, enabled, isStreaming], previous) => {
      const requested = !!element && mode !== "none" && enabled;
      // Static history and disabled effects do not subscribe to media changes.
      if (requested && isStreaming && !media) {
        media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        media?.addEventListener("change", onMotionChange);
        onMotionChange();
      }
      const reduce = media?.matches ?? reduced.value;
      if (!requested || reduce) {
        controller?.destroy();
        controller = undefined;
        live = false;
      } else if (isStreaming) {
        if (!live || previous?.[0] !== element || previous?.[1] !== mode) {
          controller?.destroy();
          controller = createStreamStardust(
            element!,
            mode as Exclude<StreamEffect, "none">,
            options?.()
          );
        }
        live = true;
      } else if (live) {
        controller?.finish();
        live = false;
      }
      if (!requested || !isStreaming) releaseMotionListener();
    },
    { flush: "post", immediate: true }
  );
  onBeforeUnmount(() => {
    controller?.destroy();
    releaseMotionListener();
  });
  return () => (controller ? { ...controller.stats } : null);
}
