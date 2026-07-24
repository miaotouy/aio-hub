import { onBeforeUnmount, readonly, ref } from "vue";
import {
  getAssetPreviewSource,
  revokeAssetPreviewSource,
} from "@/tools/asset-manager/services/assetService";
import type { AssetPreviewSource } from "@/tools/asset-manager/types";
import type {
  MediaItem,
  MediaPreviewErrorCode,
  MediaPreviewState,
} from "./types";

interface PreviewDependencies {
  getSource: (assetId: string) => Promise<AssetPreviewSource>;
  revokeSource: (previewId: string) => Promise<boolean>;
  now: () => number;
}

const defaultDependencies: PreviewDependencies = {
  getSource: getAssetPreviewSource,
  revokeSource: revokeAssetPreviewSource,
  now: Date.now,
};

function errorCodeFrom(cause: unknown): MediaPreviewErrorCode {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (message.includes("expired")) return "expired";
  if (message.includes("range")) return "range-unsupported";
  if (
    message.includes("missing") ||
    message.includes("reclaimed") ||
    message.includes("not found")
  ) {
    return "asset-unavailable";
  }
  if (message.includes("unsupported") || message.includes("decode")) {
    return "unsupported-format";
  }
  return "load-failed";
}

export function useManagedMediaPreview(
  dependencies: PreviewDependencies = defaultDependencies
) {
  const state = ref<MediaPreviewState>("closed");
  const source = ref<AssetPreviewSource | null>(null);
  const item = ref<MediaItem | null>(null);
  const errorCode = ref<MediaPreviewErrorCode | null>(null);
  const revokedIds = new Set<string>();
  let requestSequence = 0;
  let expiredRetryCount = 0;

  async function revoke(sourceToRevoke: AssetPreviewSource | null) {
    if (!sourceToRevoke || revokedIds.has(sourceToRevoke.id)) return;
    revokedIds.add(sourceToRevoke.id);
    await dependencies.revokeSource(sourceToRevoke.id).catch(() => false);
  }

  async function requestSource(
    nextItem: MediaItem,
    request: number
  ): Promise<void> {
    state.value = "loading";
    try {
      const nextSource = await dependencies.getSource(nextItem.assetId);
      if (request !== requestSequence) {
        await revoke(nextSource);
        return;
      }
      if (nextSource.expiresAtMs <= dependencies.now()) {
        await revoke(nextSource);
        if (expiredRetryCount < 1) {
          expiredRetryCount += 1;
          await requestSource(nextItem, request);
          return;
        }
        errorCode.value = "expired";
        state.value = "error";
        return;
      }
      source.value = nextSource;
    } catch (cause) {
      if (request !== requestSequence) return;
      errorCode.value = errorCodeFrom(cause);
      state.value = "error";
    }
  }

  async function open(nextItem: MediaItem) {
    const request = ++requestSequence;
    const previous = source.value;
    source.value = null;
    item.value = nextItem;
    errorCode.value = null;
    expiredRetryCount = 0;
    state.value = "opening";
    await revoke(previous);
    if (request !== requestSequence) return;
    await requestSource(nextItem, request);
  }

  function markReady() {
    if (source.value && state.value === "loading") state.value = "ready";
  }

  async function markMediaError() {
    if (!item.value) return;
    const isExpired = Boolean(
      source.value && source.value.expiresAtMs <= dependencies.now()
    );
    if (isExpired && expiredRetryCount < 1) {
      expiredRetryCount += 1;
      const request = ++requestSequence;
      const previous = source.value;
      source.value = null;
      state.value = "loading";
      await revoke(previous);
      await requestSource(item.value, request);
      return;
    }
    errorCode.value =
      item.value.kind !== "image" && source.value?.supportsRange === false
        ? "range-unsupported"
        : "unsupported-format";
    state.value = "error";
    const failedSource = source.value;
    source.value = null;
    await revoke(failedSource);
  }

  async function retry() {
    if (item.value) await open(item.value);
  }

  async function close() {
    requestSequence += 1;
    const current = source.value;
    source.value = null;
    item.value = null;
    errorCode.value = null;
    state.value = "closed";
    await revoke(current);
  }

  onBeforeUnmount(() => {
    void close();
  });

  return {
    state: readonly(state),
    source: readonly(source),
    item: readonly(item),
    errorCode: readonly(errorCode),
    open,
    close,
    retry,
    markReady,
    markMediaError,
  };
}
