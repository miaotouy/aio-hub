// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ElMessageBox } from "element-plus";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import VirtualTextAttachments from "../VirtualTextAttachments.vue";
import type { VirtualTextAttachment } from "../../types/virtual-attachment";

vi.mock("@composables/useTheme", async () => {
  const { ref } = await import("vue");
  return { useTheme: () => ({ isDark: ref(false) }) };
});
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

let wrapper:
  VueWrapper<InstanceType<typeof VirtualTextAttachments>> | undefined;
const original: VirtualTextAttachment = {
  id: "material",
  kind: "text",
  title: "原始材料",
  text: "original\r\n{{literal}}",
};
const commit = vi.fn();

async function open(props: Record<string, unknown> = {}) {
  wrapper = mount(VirtualTextAttachments, {
    props: {
      attachments: [{ ...original }],
      allowBranch: true,
      commit,
      ...props,
    },
    global: {
      stubs: {
        BaseDialog: {
          props: ["modelValue"],
          template:
            '<div v-if="modelValue" role="dialog"><slot /><slot name="footer" /></div>',
        },
      },
    },
  });
  await wrapper.get(".text-attachment-open").trigger("click");
  await flushPromises();
  return wrapper;
}
function button(label: string) {
  return wrapper!.findAll("button").find((item) => item.text() === label)!;
}
async function edit() {
  await wrapper!
    .get('input[aria-label="文本附件标题"]')
    .setValue("修改后的材料");
  wrapper!
    .getComponent(RichCodeEditor)
    .vm.setContent("edited\r\n{{literal}}\n😀");
  await flushPromises();
}
beforeEach(() => {
  commit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

// 保存方式与完整文本属于公共契约；工作副本始终独立于原消息。
it.each([false, true])(
  "opens history ready to edit and commits with branch=%s",
  async (branch) => {
    await open();
    expect(wrapper!.get(".cm-content").attributes("contenteditable")).toBe(
      "true"
    );
    expect(button("保存到消息").attributes("disabled")).toBeDefined();
    await edit();
    await button(branch ? "保存到新分支" : "保存到消息").trigger("click");
    await flushPromises();
    expect(commit).toHaveBeenCalledExactlyOnceWith(
      original,
      {
        ...original,
        title: "修改后的材料",
        text: "edited\n{{literal}}\n😀",
      },
      branch
    );
    expect(wrapper!.props("attachments")).toEqual([original]);
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false);
  }
);

it("keeps edits on failed save and allows a retry", async () => {
  commit.mockRejectedValueOnce(new Error("保存失败，请重试"));
  await open();
  await edit();
  await button("保存到消息").trigger("click");
  await flushPromises();
  expect(wrapper!.get('[role="alert"]').text()).toBe("保存失败，请重试");
  expect(wrapper!.getComponent(RichCodeEditor).vm.getContent()).toContain(
    "edited"
  );
  expect(wrapper!.props("attachments")).toEqual([original]);
  await button("保存到消息").trigger("click");
  await flushPromises();
  expect(commit).toHaveBeenCalledTimes(2);
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(false);
});

it("confirms discard and reopens the unchanged source", async () => {
  const confirm = vi
    .spyOn(ElMessageBox, "confirm")
    .mockRejectedValueOnce("cancel");
  await open();
  await edit();
  await button("取消").trigger("click");
  await flushPromises();
  expect(wrapper!.getComponent(RichCodeEditor).vm.getContent()).toContain(
    "edited"
  );
  confirm.mockResolvedValueOnce(
    "confirm" as Awaited<ReturnType<typeof ElMessageBox.confirm>>
  );
  await button("取消").trigger("click");
  await flushPromises();
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(false);
  await wrapper!.get(".text-attachment-open").trigger("click");
  await flushPromises();
  expect(wrapper!.getComponent(RichCodeEditor).vm.getContent()).toBe(
    "original\n{{literal}}"
  );
  expect(commit).not.toHaveBeenCalled();
});

it.each([{ editable: false }, { busy: true }])(
  "keeps protected messages read only: %j",
  async (props) => {
    await open(props);
    expect(wrapper!.get(".cm-content").attributes("contenteditable")).toBe(
      "false"
    );
    expect((wrapper!.get("input").element as HTMLInputElement).readOnly).toBe(
      true
    );
    if (props.busy) {
      await button("保存到消息").trigger("click");
      await button("保存到新分支").trigger("click");
    }
    expect(commit).not.toHaveBeenCalled();
  }
);
