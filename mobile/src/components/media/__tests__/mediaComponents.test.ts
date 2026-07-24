// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MediaAudioPlayer from "../MediaAudioPlayer.vue";
import MediaImageViewer from "../MediaImageViewer.vue";
import MediaVideoPlayer from "../MediaVideoPlayer.vue";

afterEach(() => vi.restoreAllMocks());

describe("mobile media components", () => {
  it("clamps image zoom between 1x and 4x", async () => {
    const wrapper = mount(MediaImageViewer, {
      props: { src: "image://sample", alt: "sample", immersive: true },
    });
    const buttons = wrapper.findAll(".image-tools button");

    for (let index = 0; index < 10; index += 1)
      await buttons[1].trigger("click");
    expect(wrapper.attributes("data-scale")).toBe("4");

    for (let index = 0; index < 10; index += 1)
      await buttons[0].trigger("click");
    expect(wrapper.attributes("data-scale")).toBe("1");
  });

  it("requests close after a fast downward drag at 1x", async () => {
    const wrapper = mount(MediaImageViewer, {
      props: { src: "image://sample", alt: "sample", immersive: true },
    });
    Object.defineProperty(wrapper.element, "clientHeight", { value: 500 });

    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 120,
      clientY: 100,
    });
    const up = new MouseEvent("pointerup", {
      bubbles: true,
      clientX: 125,
      clientY: 240,
    });
    Object.defineProperty(down, "pointerId", { value: 1 });
    Object.defineProperty(up, "pointerId", { value: 1 });
    wrapper.element.dispatchEvent(down);
    wrapper.element.dispatchEvent(up);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("falls back to the app-level video layer when fullscreen is rejected", async () => {
    const wrapper = mount(MediaVideoPlayer, {
      props: { src: "video://sample", title: "sample" },
    });
    const video = wrapper.get("video").element as HTMLVideoElement;
    video.requestFullscreen = vi.fn().mockRejectedValue(new Error("blocked"));

    await wrapper.get(".expand-button").trigger("click");
    await Promise.resolve();

    expect(wrapper.emitted("expand")).toHaveLength(1);
  });

  it("pauses audio when leaving the component", () => {
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    const wrapper = mount(MediaAudioPlayer, {
      props: { src: "audio://sample", title: "sample" },
    });

    wrapper.unmount();

    expect(pause).toHaveBeenCalledOnce();
  });
});
