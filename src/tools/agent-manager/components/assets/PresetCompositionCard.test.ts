import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { compilePresetComposition } from "@aiohub/agent-preset-core";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import PresetCompositionCard from "./PresetCompositionCard.vue";

vi.mock("./PresetMessageCard.vue", () => ({
  default: {
    template:
      '<article><slot name="header-actions" /><slot name="details" /></article>',
  },
}));
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
const message = (): ChatMessageNode =>
  ({
    id: "host",
    role: "system",
    content: "",
    isEnabled: true,
    presetComposition: {
      version: 1,
      separator: "|",
      parts: [
        {
          id: "text",
          kind: "choice",
          selectedOptionId: "text-version",
          options: [{ id: "text-version", content: "规则" }],
        },
        {
          id: "choice",
          kind: "choice",
          selectedOptionId: "b",
          options: [
            { id: "a", content: "简洁" },
            { id: "b", content: "详细" },
          ],
        },
      ],
    },
  }) as ChatMessageNode;
const stubs = {
  ElTooltip: { template: "<span><slot /></span>" },
  ElButton: {
    template: '<button :disabled="disabled"><slot /></button>',
    props: ["disabled"],
  },
};

// Protects persisted per-entry participation, edit/selection separation and failed-save recovery.
// Uses input state, public save calls and compiler output, independent of layout and CSS.
it("saves entry participation separately from editing and retains single-choice state across toggles", async () => {
  const original = message();
  const saveMessage = vi.fn(async (next: ChatMessageNode) => {
    await wrapper.setProps({ message: next });
  });
  const wrapper = mount(PresetCompositionCard, {
    props: { message: original, saveMessage },
    global: { stubs },
  });
  wrappers.push(wrapper);
  await wrapper.get("button[aria-expanded]").trigger("click");
  await wrapper.get('button[aria-label^="编辑片段 1"]').trigger("click");
  expect(wrapper.emitted("edit")).toEqual([["text"]]);
  expect(saveMessage).not.toHaveBeenCalled();
  await wrapper.get('input[aria-label="选入片段 1"]').setValue(false);
  await flushPromises();
  expect(saveMessage.mock.calls[0]).toEqual([
    expect.objectContaining({
      presetComposition: expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({ id: "text", enabled: false }),
        ]),
      }),
    }),
    original,
  ]);
  expect(
    compilePresetComposition(wrapper.props("message").presetComposition!)
      .content
  ).toBe("详细");
  await wrapper.get('input[aria-label="选入片段 2"]').setValue(false);
  await flushPromises();
  expect(wrapper.props("message").presetComposition!.parts[1]).toMatchObject({
    selectedOptionId: "b",
    enabled: false,
  });
  expect(
    wrapper
      .get('button[aria-label="片段 2：上一个版本"]')
      .attributes("disabled")
  ).toBeDefined();
  await wrapper.get('input[aria-label="选入片段 2"]').setValue(true);
  await flushPromises();
  expect(
    compilePresetComposition(wrapper.props("message").presetComposition!)
      .content
  ).toBe("详细");
  expect(
    original.presetComposition!.parts.every((part) => part.enabled !== false)
  ).toBe(true);
});

it("retains checkbox state on save failure and retries the same requested participation", async () => {
  const original = message();
  const saveMessage = vi.fn(async (next: ChatMessageNode) => {
    await wrapper.setProps({ message: next });
  });
  saveMessage.mockRejectedValueOnce(new Error("保存失败"));
  const wrapper = mount(PresetCompositionCard, {
    props: { message: original, saveMessage },
    global: { stubs },
  });
  wrappers.push(wrapper);
  await wrapper.get("button[aria-expanded]").trigger("click");
  await wrapper.get('input[aria-label="选入片段 1"]').setValue(false);
  await flushPromises();
  expect(
    (wrapper.get('input[aria-label="选入片段 1"]').element as HTMLInputElement)
      .checked
  ).toBe(true);
  expect(wrapper.get('[role="alert"]').text()).toContain("保存失败");
  await wrapper.get('[role="alert"] button').trigger("click");
  await flushPromises();
  expect(saveMessage).toHaveBeenCalledTimes(2);
  expect(saveMessage.mock.calls[1][0]).toEqual(saveMessage.mock.calls[0][0]);
  expect(
    (wrapper.get('input[aria-label="选入片段 1"]').element as HTMLInputElement)
      .checked
  ).toBe(false);
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
});
