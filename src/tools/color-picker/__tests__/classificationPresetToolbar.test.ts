import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import ClassificationPresetToolbar from "../components/ClassificationPresetToolbar.vue";
import BrightnessThresholdSlider from "../components/BrightnessThresholdSlider.vue";
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = "";
});
function toolbar(extra: Record<string, unknown> = {}) {
  const wrapper = mount(ClassificationPresetToolbar, {
    attachTo: document.body,
    props: {
      label: "亮度",
      value: [0.5],
      builtin: [{ id: "builtin:two", name: "两档", value: [0.5] }],
      custom: [],
      selectedId: "builtin:two",
      ...extra,
    },
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function button(text: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find((b) => b.textContent?.trim() === text)!;
}
function input() {
  return document.querySelector<HTMLInputElement>('[aria-label="预设名称"]')!;
}
async function name(value: string) {
  input().value = value;
  input().dispatchEvent(new Event("input", { bubbles: true }));
  await flushPromises();
}
describe("preset edit safety", () => {
  it.each([false, true])(
    "resets to the selected preset snapshot without overwriting it (custom: %s)",
    async (custom) => {
      const preset = {
        id: custom ? "custom:saved" : "builtin:two",
        name: "已保存",
        value: [0.4],
      };
      const prepare = vi.fn().mockReturnValue(null);
      const w = toolbar({
        value: [0.8],
        selectedId: preset.id,
        builtin: custom ? [] : [preset],
        custom: custom ? [preset] : [],
        prepare,
      });
      const trigger = w.get('[aria-label="重置为当前亮度预设"]');
      await trigger.trigger("click");
      await flushPromises();
      button("取消").click();
      await flushPromises();
      expect(w.emitted("select")).toBeUndefined();
      await trigger.trigger("click");
      await flushPromises();
      button("重置").click();
      await flushPromises();
      expect(w.emitted("select")![0][0]).toEqual(preset);
      expect(w.emitted("select")![0][0]).not.toBe(preset);
      expect(w.emitted("save")).toBeUndefined();
      expect(prepare).not.toHaveBeenCalled();
      await w.setProps({ value: [0.4] });
      expect(trigger.attributes("disabled")).toBeDefined();
    }
  );
  it("disables reset when no preset is selected", () => {
    const w = toolbar({ selectedId: null });
    expect(
      w.get('[aria-label="重置为当前亮度预设"]').attributes("disabled")
    ).toBeDefined();
  });
  it("keeps the select open when the pointer leaves its anchor for a dropdown option", async () => {
    const w = toolbar();
    const select = w.get('[role="combobox"]');
    await w.get(".el-select__wrapper").trigger("click");
    await flushPromises();
    expect(select.attributes("aria-expanded")).toBe("true");
    // The surrounding confirmation popover must not restore focus on hover-out.
    await w.get(".preset-selection").trigger("mouseenter");
    await w.get(".preset-selection").trigger("mouseleave");
    const option = document.querySelector<HTMLElement>('[role="option"]')!;
    option.dispatchEvent(new MouseEvent("mouseenter"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(select.attributes("aria-expanded")).toBe("true");
    expect(document.activeElement).not.toBe(
      w.get('[aria-label="另存为亮度预设"]').element
    );
    expect(w.emitted("select")).toBeUndefined();
  });
  it("keeps the save popover open after its trigger click", async () => {
    const w = toolbar();
    const trigger = w.get('[aria-label="另存为亮度预设"]');
    await trigger.trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(input().isConnected).toBe(true);
    expect(input().value).toBe("两档 副本");
    expect(w.emitted("save")).toBeUndefined();
  });
  it("keeps builtins read-only, cancels save locally and restores focus", async () => {
    const w = toolbar();
    expect(w.find('[aria-label="覆盖亮度预设"]').exists()).toBe(false);
    expect(w.find('[aria-label="删除亮度预设"]').exists()).toBe(false);
    const trigger = w.get('[aria-label="另存为亮度预设"]');
    await trigger.trigger("click");
    await flushPromises();
    await name("取消的预设");
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flushPromises();
    expect(w.emitted("save")).toBeUndefined();
    expect(document.activeElement).toBe(trigger.element);
  });
  it("rejects duplicate names and composing Enter; saves an independent snapshot", async () => {
    const w = toolbar({
      custom: [{ id: "custom:one", name: "重复", value: [0.5] }],
    });
    await w.get('[aria-label="另存为亮度预设"]').trigger("click");
    await flushPromises();
    await name("重复");
    button("保存").click();
    await flushPromises();
    expect(w.emitted("save")).toBeUndefined();
    await name("输入法");
    input().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      })
    );
    await flushPromises();
    expect(w.emitted("save")).toBeUndefined();
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await flushPromises();
    const saved = w.emitted("save")![0][0] as { name: string; value: number[] };
    expect(saved.name).toBe("输入法");
    expect(saved.value).not.toBe(w.props("value"));
    expect(saved.value).toEqual([0.5]);
  });
  it("does not save invalid drafts or close the name input on persistence failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("disk full"));
    const prepare = vi.fn().mockReturnValue(null);
    const w = toolbar({ prepare, savePreset: save });
    await w.get('[aria-label="另存为亮度预设"]').trigger("click");
    await flushPromises();
    await name("保留输入");
    button("保存").click();
    await flushPromises();
    expect(save).not.toHaveBeenCalled();
    prepare.mockReturnValue([0.6]);
    button("保存").click();
    await flushPromises();
    expect(save).toHaveBeenCalledOnce();
    expect(input().value).toBe("保留输入");
  });
  it("overwrites the same custom id and deletes without altering current values", async () => {
    const w = toolbar({
      selectedId: "custom:one",
      custom: [{ id: "custom:one", name: "我的预设", value: [0.4] }],
    });
    await w.get('[aria-label="覆盖亮度预设"]').trigger("click");
    await flushPromises();
    button("覆盖").click();
    await flushPromises();
    expect(w.emitted("save")![0][0]).toEqual({
      id: "custom:one",
      name: "我的预设",
      value: [0.5],
    });
    await w.get('[aria-label="删除亮度预设"]').trigger("click");
    await flushPromises();
    button("删除").click();
    await flushPromises();
    expect(w.emitted("remove")![0]).toEqual(["custom:one"]);
    expect(w.props("value")).toEqual([0.5]);
  });
});
it("adds/deletes brightness points within limits and moves focus to the resulting editor", async () => {
  const w = mount(BrightnessThresholdSlider, {
    attachTo: document.body,
    props: { modelValue: [0.5] },
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(w);
  expect(
    w.get('[aria-label="删除亮度分界点 1"]').attributes("disabled")
  ).toBeDefined();
  await w.get('[aria-label="添加亮度分界点"]').trigger("click");
  const added = w.emitted("update:modelValue")![0][0] as number[];
  expect(added).toEqual([0.25, 0.5]);
  await w.setProps({ modelValue: added });
  await flushPromises();
  await w.get('[aria-label="删除亮度分界点 1"]').trigger("click");
  expect(w.emitted("update:modelValue")![1][0]).toEqual([0.5]);
  await w.setProps({ modelValue: [0.2, 0.4, 0.6, 0.8] });
  expect(
    w.get('[aria-label="添加亮度分界点"]').attributes("disabled")
  ).toBeDefined();
});
