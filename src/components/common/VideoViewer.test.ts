import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import VideoViewer from "./VideoViewer.vue";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
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
    const overlay = wrapper.get('[role="dialog"]');
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
