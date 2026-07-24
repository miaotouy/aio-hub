// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetPreviewSource } from "@/tools/asset-manager/types";
import type { MediaItem } from "../types";
import { useManagedMediaPreview } from "../useManagedMediaPreview";

const item: MediaItem = {
  assetId: "asset-1",
  kind: "image",
  displayName: "sample.png",
  mimeType: "image/png",
};

function descriptor(
  id: string,
  expiresAtMs = Date.now() + 60_000
): AssetPreviewSource {
  return {
    id,
    kind: "custom-protocol",
    url: `http://aio-asset.localhost/${id}`,
    mimeType: "image/png",
    sizeBytes: 1024,
    expiresAtMs,
    supportsRange: true,
    maxRangeBytes: 1024,
    maxFullResponseBytes: 1024,
  };
}

function mountComposable(
  getSource: (assetId: string) => Promise<AssetPreviewSource>,
  revokeSource = vi.fn(async () => true),
  now = () => Date.now()
) {
  let preview!: ReturnType<typeof useManagedMediaPreview>;
  const wrapper = mount(
    defineComponent({
      setup() {
        preview = useManagedMediaPreview({ getSource, revokeSource, now });
        return () => null;
      },
    })
  );
  return { preview, revokeSource, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("useManagedMediaPreview", () => {
  it("revokes a descriptor that arrives after the preview closes", async () => {
    let resolveSource!: (value: AssetPreviewSource) => void;
    const { preview, revokeSource } = mountComposable(
      () =>
        new Promise((resolve) => {
          resolveSource = resolve;
        })
    );

    const opening = preview.open(item);
    await Promise.resolve();
    await preview.close();
    resolveSource(descriptor("late-preview"));
    await opening;

    expect(preview.state.value).toBe("closed");
    expect(preview.source.value).toBeNull();
    expect(revokeSource).toHaveBeenCalledOnce();
    expect(revokeSource).toHaveBeenCalledWith("late-preview");
  });

  it("makes repeated cleanup idempotent", async () => {
    const { preview, revokeSource } = mountComposable(async () =>
      descriptor("preview-1")
    );

    await preview.open(item);
    await Promise.all([preview.close(), preview.close()]);

    expect(revokeSource).toHaveBeenCalledOnce();
    expect(preview.state.value).toBe("closed");
  });

  it("retries one already-expired descriptor before exposing the source", async () => {
    const now = 10_000;
    const getSource = vi
      .fn()
      .mockResolvedValueOnce(descriptor("expired", now - 1))
      .mockResolvedValueOnce(descriptor("fresh", now + 60_000));
    const { preview, revokeSource } = mountComposable(
      getSource,
      vi.fn(async () => true),
      () => now
    );

    await preview.open(item);

    expect(getSource).toHaveBeenCalledTimes(2);
    expect(revokeSource).toHaveBeenCalledWith("expired");
    expect(preview.source.value?.id).toBe("fresh");
    expect(preview.state.value).toBe("loading");
  });

  it("maps unavailable asset errors to a stable component code", async () => {
    const { preview } = mountComposable(async () => {
      throw new Error("asset reclaimed");
    });

    await preview.open(item);

    expect(preview.state.value).toBe("error");
    expect(preview.errorCode.value).toBe("asset-unavailable");
  });
});
