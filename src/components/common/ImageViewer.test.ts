import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ImageViewer from "./ImageViewer.vue";
import {
  acquireZIndex,
  releaseZIndex,
  resetDialogZIndexCounter,
} from "@/composables/useDialogZIndex";

vi.mock("viewerjs", () => ({
  default: class {
    viewer = document.createElement("div");
    constructor(
      _element: HTMLElement,
      private options: {
        show?: (event: CustomEvent) => void;
        hidden?: (event: CustomEvent) => void;
      }
    ) {
      this.viewer.tabIndex = -1;
      this.viewer.className = "viewer-container";
      this.viewer.hidden = true;
      document.body.append(this.viewer);
    }
    view() {
      const event = new CustomEvent("show", { cancelable: true });
      this.options.show?.(event);
      if (!event.defaultPrevented) this.viewer.hidden = false;
    }
    hide() {
      this.viewer.hidden = true;
      this.options.hidden?.(new CustomEvent("hidden"));
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
  resetDialogZIndexCounter();
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

// 图片预览在高层级弹窗内打开、隐藏后重新打开时仍应覆盖来源弹窗。
it("raises the image viewer on every show even when focus is disabled", async () => {
  const parentZ = acquireZIndex(4300);
  wrapper = mount(ImageViewer, {
    attachTo: document.body,
    props: { images: ["image.png"], options: { focus: false } },
  });
  await nextTick();
  const viewer = document.querySelector<HTMLElement>(".viewer-container")!;
  expect(Number(viewer.style.zIndex)).toBeGreaterThan(parentZ);
  (wrapper.vm as unknown as { hide(): void }).hide();
  const nextDialogZ = acquireZIndex();
  (wrapper.vm as unknown as { show(): void }).show();
  await nextTick();
  expect(Number(viewer.style.zIndex)).toBeGreaterThan(nextDialogZ);
  releaseZIndex(nextDialogZ);
  releaseZIndex(parentZ);
});
