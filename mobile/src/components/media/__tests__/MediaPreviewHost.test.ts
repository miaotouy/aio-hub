// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaImageViewer from "../MediaImageViewer.vue";
import MediaPreviewHost from "../MediaPreviewHost.vue";
import type { MediaItem } from "../types";

const service = vi.hoisted(() => ({
  getAssetPreviewSource: vi.fn(),
  revokeAssetPreviewSource: vi.fn(),
}));

vi.mock("@/tools/asset-manager/services/assetService", () => service);

const item: MediaItem = {
  assetId: "asset-1",
  kind: "image",
  displayName: "sample.png",
  mimeType: "image/png",
};

beforeEach(() => {
  service.getAssetPreviewSource.mockResolvedValue({
    id: "preview-1",
    kind: "custom-protocol",
    url: "http://aio-asset.localhost/preview-1",
    mimeType: "image/png",
    sizeBytes: 1024,
    expiresAtMs: Date.now() + 60_000,
    supportsRange: true,
    maxRangeBytes: 1024,
    maxFullResponseBytes: 1024,
  });
  service.revokeAssetPreviewSource.mockResolvedValue(true);
  vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
  vi.spyOn(window.history, "back").mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("MediaPreviewHost", () => {
  it("closes the immersive layer before closing the inline host", async () => {
    const wrapper = mount(MediaPreviewHost, {
      attachTo: document.body,
      props: { modelValue: true, item, mode: "inline" },
    });
    await flushPromises();

    wrapper.findComponent(MediaImageViewer).vm.$emit("open");
    await flushPromises();
    expect(
      document.body.querySelector("[data-testid='media-preview-immersive']")
    ).not.toBeNull();

    const closeButton = document.body.querySelector(
      "[data-testid='media-preview-immersive'] .immersive-header button"
    ) as HTMLButtonElement;
    closeButton.click();
    await flushPromises();

    expect(
      document.body.querySelector("[data-testid='media-preview-immersive']")
    ).toBeNull();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });
});
