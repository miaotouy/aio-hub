// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import {
  getStreamingMediaPath,
  resolveMediaSource,
  type MediaSourceLease,
} from "@/utils/mediaSource";

/** 源切换与组件卸载时释放授权，过期的异步结果只释放、不覆盖当前媒体。 */
export function useMediaSource(source: MaybeRefOrGetter<string | undefined>) {
  const src = ref<string>();
  const error = ref<unknown>(null);
  const pending = ref(false);
  watch(
    () => toValue(source),
    async (value, _, onCleanup) => {
      let cancelled = false;
      let lease: MediaSourceLease | undefined;
      onCleanup(() => {
        cancelled = true;
        void lease?.release();
      });
      error.value = null;
      pending.value = false;
      if (!value || getStreamingMediaPath(value) === null) {
        src.value = value || undefined;
        return;
      }
      src.value = undefined;
      pending.value = true;
      try {
        lease = await resolveMediaSource(value);
        if (cancelled) {
          await lease.release();
        } else {
          src.value = lease.url;
        }
      } catch (cause) {
        if (!cancelled) error.value = cause;
      } finally {
        if (!cancelled) pending.value = false;
      }
    },
    { immediate: true }
  );
  return { src, error, pending };
}
