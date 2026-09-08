import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ElementPlus from "element-plus";
import { mount, flushPromises } from "@vue/test-utils";
import ColorFamilyPointsEditor from "../components/ColorFamilyPointsEditor.vue";
import {
  createDefaultColorPoints,
  type ColorFamilyPoint,
} from "../colorFamilyPoints";

const wrappers: ReturnType<typeof mount>[] = [];
function editor() {
  const wrapper = mount(ColorFamilyPointsEditor, {
    props: { modelValue: createDefaultColorPoints() },
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  const disk = wrapper.get('[aria-label="色相饱和度圆盘"]');
  vi.spyOn(disk.element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON() {},
  });
  Object.assign(disk.element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  return { wrapper, disk };
}
async function pointer(
  target: { element: Element },
  type: string,
  init: MouseEventInit & { pointerId: number }
) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  target.element.dispatchEvent(event);
  await nextTick();
}
const updates = (wrapper: ReturnType<typeof mount>) =>
  wrapper.emitted("update:modelValue") as [ColorFamilyPoint[]][] | undefined;
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
);
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("color point commit boundary", () => {
  it("previews drag locally, clamps to the disk and submits once on release", async () => {
    const { wrapper, disk } = editor();
    await pointer(wrapper.get('[aria-label="选择色系 红"]'), "pointerdown", {
      button: 0,
      pointerId: 1,
    });
    await pointer(disk, "pointermove", {
      pointerId: 1,
      clientX: 250,
      clientY: 150,
    });
    expect(updates(wrapper)).toBeUndefined();
    await pointer(disk, "pointerup", { pointerId: 1 });
    expect(updates(wrapper)).toHaveLength(1);
    const red = updates(wrapper)![0][0].find((point) => point.id === "red")!;
    expect(red.saturation).toBe(1);
    expect(red.hue).toBeCloseTo(18.43495);
    await pointer(disk, "lostpointercapture", { pointerId: 1 });
    expect(updates(wrapper)).toHaveLength(1);
  });
  it("rejects a drag onto another site and keeps keyboard selection usable afterwards", async () => {
    const { wrapper, disk } = editor();
    await pointer(wrapper.get('[aria-label="选择色系 红"]'), "pointerdown", {
      button: 0,
      pointerId: 1,
    });
    await pointer(disk, "pointermove", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    await pointer(disk, "pointerup", { pointerId: 1 });
    expect(updates(wrapper)).toBeUndefined();
    expect(
      wrapper.get('[aria-label="色系 2 饱和度"]').attributes("aria-valuenow")
    ).toBe(String(createDefaultColorPoints()[1].saturation * 100));
    wrapper
      .get('[aria-label="选择色系 蓝"]')
      .element.dispatchEvent(
        new MouseEvent("click", { detail: 0, bubbles: true })
      );
    await nextTick();
    expect(document.activeElement).toBe(
      wrapper.get('[aria-label="色系 7 名称"]').element
    );
  });
  it.each(["escape", "pointercancel", "lostpointercapture"])(
    "restores the draft without publishing on %s",
    async (action) => {
      const { wrapper, disk } = editor();
      await pointer(wrapper.get('[aria-label="选择色系 红"]'), "pointerdown", {
        button: 0,
        pointerId: 1,
      });
      await pointer(disk, "pointermove", {
        pointerId: 1,
        clientX: 220,
        clientY: 140,
      });
      if (action === "escape") await disk.trigger("keydown", { key: "Escape" });
      else await pointer(disk, action, { pointerId: 1 });
      await pointer(disk, "pointerup", { pointerId: 1 });
      expect(updates(wrapper)).toBeUndefined();
      expect(
        wrapper.get('[aria-label="色系 2 饱和度"]').attributes("aria-valuenow")
      ).toBe(String(createDefaultColorPoints()[1].saturation * 100));
    }
  );
  it("does not publish invalid text, empty numbers or colliding coordinates; valid edits commit on confirmation", async () => {
    const { wrapper } = editor();
    const name = wrapper.get('[aria-label="色系 2 名称"]');
    await name.setValue("../bad");
    await name.trigger("blur");
    expect(updates(wrapper)).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await name.setValue("朱红");
    await name.trigger("keydown", { key: "Enter" });
    expect(updates(wrapper)![0][0][1].name).toBe("朱红");
    await wrapper.setProps({ modelValue: updates(wrapper)![0][0] });
    const editSaturation = async (value: string) => {
      await wrapper
        .get('[aria-label="色系 2 饱和度"]')
        .trigger("keydown", { key: "Enter" });
      const input = wrapper.get('input[aria-label="色系 2 饱和度"]');
      await input.setValue(value);
      await input.trigger("blur");
    };
    await editSaturation("");
    expect(updates(wrapper)).toHaveLength(1);
    await editSaturation("0");
    expect(updates(wrapper)).toHaveLength(1);
    await editSaturation("60");
    expect(updates(wrapper)![1][0][1].saturation).toBe(0.6);
  });
  it("supports keyboard addition, deletion and confirmed preset replacement", async () => {
    const { wrapper, disk } = editor();
    const add = wrapper.get('[aria-label="添加色系点位"]');
    await add.trigger("click");
    await disk.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(updates(wrapper)![0][0]).toHaveLength(10);
    const added = updates(wrapper)![0][0][9];
    expect(document.activeElement).toBe(
      wrapper.get('[aria-label="色系 10 名称"]').element
    );
    await wrapper.setProps({ modelValue: updates(wrapper)![0][0] });
    await wrapper.get(`[aria-label="删除色系 ${added.name}"]`).trigger("click");
    expect(updates(wrapper)![1][0]).toHaveLength(9);
    await wrapper.setProps({ modelValue: updates(wrapper)![1][0] });
    const name = wrapper.get('[aria-label="色系 1 名称"]');
    await name.setValue("中性");
    await name.trigger("blur");
    await wrapper.setProps({ modelValue: updates(wrapper)![2][0] });
    const select = wrapper.findComponent({ name: "ElSelect" });
    select.vm.$emit("change", "builtin:basic");
    await flushPromises();
    const popoverButton = (text: string) =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === text
      )!;
    popoverButton("取消").click();
    await flushPromises();
    expect(updates(wrapper)).toHaveLength(3);
    select.vm.$emit("change", "builtin:basic");
    await flushPromises();
    popoverButton("替换").click();
    await flushPromises();
    expect(updates(wrapper)![3][0]).toHaveLength(7);
  });
  it("previews numeric scrubbing and publishes once on release", async () => {
    const { wrapper } = editor();
    const hue = wrapper.get('[aria-label="色系 2 色相"]');
    await pointer(hue, "pointerdown", { button: 0, pointerId: 7, clientX: 0 });
    await pointer({ element: window as unknown as Element }, "pointermove", {
      pointerId: 7,
      clientX: 80,
    });
    expect(updates(wrapper)).toBeUndefined();
    expect(
      wrapper.get('[aria-label="色系 2 色相"]').attributes("aria-valuenow")
    ).toBe("1");
    await pointer({ element: window as unknown as Element }, "pointerup", {
      pointerId: 7,
    });
    expect(updates(wrapper)).toHaveLength(1);
    expect(updates(wrapper)![0][0][1].hue).toBe(1);
  });
  it.each(["pointercancel", "escape"])(
    "cancels numeric scrubbing on %s without writing configuration",
    async (action) => {
      const { wrapper } = editor();
      const hue = wrapper.get('[aria-label="色系 2 色相"]');
      await pointer(hue, "pointerdown", {
        button: 0,
        pointerId: 7,
        clientX: 0,
      });
      await pointer({ element: window as unknown as Element }, "pointermove", {
        pointerId: 7,
        clientX: 80,
      });
      if (action === "escape") await hue.trigger("keydown", { key: "Escape" });
      else
        await pointer(
          { element: window as unknown as Element },
          "pointercancel",
          { pointerId: 7 }
        );
      expect(updates(wrapper)).toBeUndefined();
      expect(
        wrapper.get('[aria-label="色系 2 色相"]').attributes("aria-valuenow")
      ).toBe("0");
    }
  );
});
