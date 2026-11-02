import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ImageViewer from "./ImageViewer.vue";

vi.mock("viewerjs", () => ({
  default: class {
    viewer = document.createElement("div");
    constructor(
      _element: HTMLElement,
      private options: { show?: (event: CustomEvent) => void }
    ) {
      this.viewer.tabIndex = -1;
      this.viewer.className = "viewer-container";
      this.viewer.hidden = true;
      document.body.append(this.viewer);
    }
    view() {
      this.options.show?.(new CustomEvent("show", { cancelable: true }));
      this.viewer.hidden = false;
    }
    destroy() {
      this.viewer.remove();
    }
  },
}));

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.replaceChildren();
});

describe("ImageViewer keyboard focus", () => {
  it("takes focus before the shown animation callback and returns it on unmount", async () => {
    const attachment = document.createElement("button");
    document.body.append(attachment);
    attachment.focus();
    const show = vi.fn();
    wrapper = mount(ImageViewer, {
      attachTo: document.body,
      props: { images: ["image.png"], options: { show } },
    });
    await nextTick();
    expect(document.activeElement).toBe(
      document.querySelector(".viewer-container")
    );
    expect(show).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    wrapper = undefined;
    expect(document.activeElement).toBe(attachment);
  });

  it("preserves the caller's focus opt-out", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    wrapper = mount(ImageViewer, {
      attachTo: document.body,
      props: { images: ["image.png"], options: { focus: false } },
    });
    await nextTick();
    expect(document.activeElement).toBe(trigger);
  });
});
