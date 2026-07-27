// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, KeepAlive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaImageViewer from "../MediaImageViewer.vue";
import MediaVideoPlayer from "../MediaVideoPlayer.vue";
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
  it("passes its optional image selector to the inline viewer", async () => {
    const wrapper = mount(MediaPreviewHost, {
      props: {
        modelValue: true,
        item,
        imageTestId: "caller-preview-image",
      },
    });
    await flushPromises();

    expect(
      wrapper.get("[data-testid='caller-preview-image']").attributes("src")
    ).toBe("http://aio-asset.localhost/preview-1");
  });

  it("releases a managed preview while cached and reacquires it after activation", async () => {
    service.getAssetPreviewSource
      .mockResolvedValueOnce({
        id: "preview-cached-1",
        kind: "custom-protocol",
        url: "http://aio-asset.localhost/preview-cached-1",
        mimeType: "image/png",
        sizeBytes: 1024,
        expiresAtMs: Date.now() + 60_000,
        supportsRange: true,
        maxRangeBytes: 1024,
        maxFullResponseBytes: 1024,
      })
      .mockResolvedValueOnce({
        id: "preview-cached-2",
        kind: "custom-protocol",
        url: "http://aio-asset.localhost/preview-cached-2",
        mimeType: "image/png",
        sizeBytes: 1024,
        expiresAtMs: Date.now() + 60_000,
        supportsRange: true,
        maxRangeBytes: 1024,
        maxFullResponseBytes: 1024,
      });
    const Harness = defineComponent({
      components: { KeepAlive, MediaPreviewHost },
      setup() {
        const visible = ref(true);
        return { item, visible };
      },
      template: `
        <KeepAlive>
          <MediaPreviewHost v-if="visible" :model-value="true" :item="item" />
        </KeepAlive>
      `,
    });
    const wrapper = mount(Harness);
    await flushPromises();

    expect(wrapper.get("img").attributes("src")).toBe(
      "http://aio-asset.localhost/preview-cached-1"
    );

    (wrapper.vm as unknown as { visible: boolean }).visible = false;
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(service.revokeAssetPreviewSource).toHaveBeenCalledWith(
      "preview-cached-1"
    );

    (wrapper.vm as unknown as { visible: boolean }).visible = true;
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.get("img").attributes("src")).toBe(
      "http://aio-asset.localhost/preview-cached-2"
    );
  });

  it("keeps video position and playing state through app-level fullscreen fallback", async () => {
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const videoItem: MediaItem = {
      ...item,
      kind: "video",
      displayName: "sample.mp4",
      mimeType: "video/mp4",
    };
    const wrapper = mount(MediaPreviewHost, {
      attachTo: document.body,
      props: { modelValue: true, item: videoItem, mode: "inline" },
    });
    await flushPromises();

    const inlinePlayer = wrapper.findComponent(MediaVideoPlayer);
    const inlineVideo = inlinePlayer.get("video").element as HTMLVideoElement;
    Object.defineProperties(inlineVideo, {
      currentTime: { configurable: true, writable: true, value: 1.25 },
      paused: { configurable: true, value: false },
      ended: { configurable: true, value: false },
    });

    inlinePlayer.vm.$emit("expand");
    await flushPromises();
    const immersive = document.body.querySelector(
      "[data-testid='media-preview-immersive']"
    );
    expect(immersive).not.toBeNull();

    const immersiveVideo = immersive?.querySelector(
      "video"
    ) as HTMLVideoElement;
    Object.defineProperties(immersiveVideo, {
      currentTime: { configurable: true, writable: true, value: 0 },
      paused: { configurable: true, value: false },
      ended: { configurable: true, value: false },
    });
    immersiveVideo.dispatchEvent(new Event("loadedmetadata"));
    await flushPromises();
    expect(immersiveVideo.currentTime).toBe(1.25);

    immersiveVideo.currentTime = 2.5;
    window.history.back();
    await flushPromises();

    expect(
      document.body.querySelector("[data-testid='media-preview-immersive']")
    ).toBeNull();
    expect(inlineVideo.currentTime).toBe(2.5);
    expect(pause).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
  });

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
