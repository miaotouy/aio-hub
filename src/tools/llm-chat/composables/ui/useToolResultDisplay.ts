// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { computed, onScopeDispose, ref, watch } from "vue";
import {
  formatToolResult,
  normalizeToolResult,
  previewToolResult,
} from "../../utils/toolResultContent";

/** First visible text is immediate; subsequent live updates share one latest-value timer. */
export function useToolResultDisplay(options: {
  source: () => string;
  expanded: () => boolean;
  streaming: () => boolean;
}) {
  const content = ref("");
  const preview = computed(() => previewToolResult(options.source()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const current = () => {
    cancel();
    content.value = options.streaming()
      ? normalizeToolResult(options.source())
      : formatToolResult(options.source());
    return content.value;
  };
  watch(
    [options.source, options.expanded, options.streaming],
    ([, expanded, streaming], old) => {
      if (!expanded) {
        cancel();
        content.value = "";
        return;
      }
      if (!streaming || !old?.[1] || !content.value) {
        current();
        return;
      }
      if (timer === undefined) timer = setTimeout(current, 100);
    },
    { immediate: true, flush: "sync" }
  );
  onScopeDispose(cancel);
  return { content, preview, current };
}
