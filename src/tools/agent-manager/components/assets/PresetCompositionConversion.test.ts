import { mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../../types/agent";
import PresetCompositionConversion from "./PresetCompositionConversion.vue";

vi.mock("../editors/PresetCompositionEditor.vue", () => ({
  default: { template: "<div />" },
}));
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
const group = {
  id: "group",
  name: "工作模式",
  selectionMode: "radio",
  enabled: true,
} as PresetMessageGroup;
const plain = (id: string, content: string) =>
  ({
    id,
    type: "message",
    role: "system",
    content,
    isEnabled: true,
    groupId: group.id,
  }) as ChatMessageNode;
const nested = (id: string) =>
  ({
    ...plain(id, ""),
    presetComposition: {
      version: 1,
      separator: "",
      parts: [
        { id: "text", kind: "text", content: "共同规则" },
        {
          id: "choice",
          kind: "choice",
          selectedOptionId: "a",
          options: [
            { id: "a", content: "简洁" },
            { id: "b", content: "详细" },
          ],
        },
      ],
    },
  }) as ChatMessageNode;
const stubs = {
  BaseDialog: {
    template: '<div><slot name="content" /><slot name="footer" /></div>',
  },
  ElSelect: { template: "<div><slot /></div>" },
  ElOption: { template: "<div />" },
  ElCheckbox: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', !modelValue)" /><slot /></label>',
  },
  ElButton: {
    props: ["disabled"],
    emits: ["click"],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
};
const mountConversion = (messages: ChatMessageNode[]) =>
  mount(PresetCompositionConversion, {
    props: { group, messages },
    global: { stubs },
  });
const applyButton = (wrapper: ReturnType<typeof mountConversion>) =>
  wrapper
    .findAll("button")
    .find((button) => button.text().includes("应用转换"))!;
const confirmBox = (wrapper: ReturnType<typeof mountConversion>) =>
  wrapper.find('input[type="checkbox"]');

it("requires confirmation before flattening a composition member", async () => {
  const wrapper = mountConversion([plain("a", "第一条"), nested("b")]);
  expect(wrapper.text()).toContain("内部其他备选与停用片段不再保留");
  expect(applyButton(wrapper).attributes("disabled")).toBeDefined();
  await confirmBox(wrapper).setValue(true);
  expect(applyButton(wrapper).attributes("disabled")).toBeUndefined();
});

it("converts plain members without an extra confirmation", () => {
  const wrapper = mountConversion([plain("a", "第一条"), plain("b", "第二条")]);
  expect(wrapper.text()).not.toContain("成员中包含组合消息");
  expect(applyButton(wrapper).attributes("disabled")).toBeUndefined();
});
