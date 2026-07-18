import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import DropZone from "./DropZone.vue";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  listen: vi.fn(),
  onDragDropEvent: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: mocks.onDragDropEvent }),
}));

describe("DropZone accessibility", () => {
  beforeEach(() => {
    mocks.open.mockReset();
    mocks.open.mockResolvedValue(null);
    mocks.listen.mockReset();
    mocks.listen.mockResolvedValue(() => undefined);
    mocks.onDragDropEvent.mockReset();
    mocks.onDragDropEvent.mockResolvedValue(() => undefined);
  });

  it("opens the file dialog from the keyboard when the whole zone is clickable", async () => {
    const wrapper = mount(DropZone, {
      props: { clickable: true, clickZone: true },
      global: {
        stubs: {
          ElButton: { template: "<button><slot /></button>" },
          ElIcon: { template: "<i><slot /></i>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.attributes("role")).toBe("button");
    expect(wrapper.attributes("tabindex")).toBe("0");
    await wrapper.trigger("keydown", { key: "Enter" });

    expect(mocks.open).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("shows business overlay text and clears drag state on Escape", async () => {
    const wrapper = mount(DropZone, {
      props: {
        showOverlayOnDrag: true,
        dragOverlayText: "松开以导入到目标资料库",
      },
      global: {
        stubs: {
          ElButton: { template: "<button><slot /></button>" },
          ElIcon: { template: "<i><slot /></i>" },
        },
      },
    });
    await flushPromises();

    wrapper.element.dispatchEvent(
      new Event("dragenter", { bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(wrapper.text()).toContain("松开以导入到目标资料库");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(wrapper.text()).not.toContain("松开以导入到目标资料库");
    wrapper.unmount();
  });

  it("clears drag state when processing disables the zone", async () => {
    const wrapper = mount(DropZone, {
      props: { showOverlayOnDrag: true },
      global: {
        stubs: {
          ElButton: { template: "<button><slot /></button>" },
          ElIcon: { template: "<i><slot /></i>" },
        },
      },
    });
    await flushPromises();

    wrapper.element.dispatchEvent(
      new Event("dragenter", { bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(wrapper.find(".drop-zone__drag-overlay").exists()).toBe(true);

    await wrapper.setProps({ disabled: true });
    await nextTick();
    expect(wrapper.find(".drop-zone__drag-overlay").exists()).toBe(false);
    wrapper.unmount();
  });
});
