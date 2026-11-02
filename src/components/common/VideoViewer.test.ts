import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import VideoViewer from "./VideoViewer.vue";
import {
  acquireZIndex,
  releaseZIndex,
  resetDialogZIndexCounter,
} from "@/composables/useDialogZIndex";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
  resetDialogZIndexCounter();
});

describe("VideoViewer keyboard focus", () => {
  it("takes focus when first mounted already visible and closes once on Escape", async () => {
    const attachment = document.createElement("button");
    document.body.append(attachment);
    attachment.focus();
    wrapper = mount(VideoViewer, {
      attachTo: document.body,
      props: { visible: true, src: "video.mp4" },
      global: { stubs: { VideoPlayer: true } },
    });
    await nextTick();
    const overlay = new DOMWrapper(document.body).get('[role="dialog"]');
    expect(document.activeElement).toBe(overlay.element);
    await overlay.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("update:visible")).toEqual([[false]]);
    await wrapper.setProps({ visible: false });
    expect(document.activeElement).toBe(attachment);
  });

  it("keeps the preview open when the player consumes Escape to exit fullscreen", async () => {
    wrapper = mount(VideoViewer, {
      attachTo: document.body,
      props: { visible: true, src: "video.mp4" },
      global: { stubs: { VideoPlayer: true } },
    });
    await nextTick();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.activeElement?.dispatchEvent(event);
    expect(wrapper.emitted("close")).toBeUndefined();
  });
});

it("opens video above the current dialog and raises it again when reopened", async () => {
  const parentZ = acquireZIndex(4500);
  wrapper = mount(VideoViewer, {
    attachTo: document.body,
    props: { visible: true, src: "video.mp4" },
    global: { stubs: { VideoPlayer: true } },
  });
  const getLayer = () =>
    Number(
      (
        new DOMWrapper(document.body).get(".video-viewer-overlay")
          .element as HTMLElement
      ).style.zIndex
    );
  expect(getLayer()).toBeGreaterThan(parentZ);
  await wrapper.setProps({ visible: false });
  const nextDialogZ = acquireZIndex();
  await wrapper.setProps({ visible: true });
  expect(getLayer()).toBeGreaterThan(nextDialogZ);
  releaseZIndex(nextDialogZ);
  releaseZIndex(parentZ);
});
