// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ElMessageBox } from "element-plus";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import VirtualTextAttachments from "../VirtualTextAttachments.vue";
import type { VirtualTextAttachment } from "../../types/virtual-attachment";

vi.mock("@composables/useTheme", async () => {
  const { ref } = await import("vue");
  return { useTheme: () => ({ isDark: ref(false) }) };
});
vi.mock("@/composables/useThemeAppearance", async () => {
  const { ref } = await import("vue");
  return { useThemeAppearance: () => ({ appearanceSettings: ref({}) }) };
});
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

vi.mock("@/tools/rich-text-renderer/RichTextRenderer.vue", () => ({
  default: {
    props: ["content"],
    template: '<div class="renderer-stub">{{ content }}</div>',
  },
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

async function open(props: Record<string, unknown> = {}, realDialog = false) {
  wrapper = mount(VirtualTextAttachments, {
    attachTo: document.body,
    props: {
      attachments: [{ ...original }],
      allowBranch: true,
      commit,
      ...props,
    },
    global: {
      stubs: {
        teleport: true,
        BaseDialog: realDialog
          ? false
          : {
              props: ["modelValue"],
              template:
                '<div v-if="modelValue" role="dialog"><slot /><slot name="footer" /></div>',
            },
      },
      directives: { loading: () => undefined },
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
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, "createRange").mockImplementation(() =>
    Object.assign(createRange(), {
      getClientRects: () => [],
      getBoundingClientRect: () => new DOMRect(),
    })
  );
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

// 焦点契约覆盖打开和留白点击；重构编辑器内部结构时仍按用户可输入状态验收。
it("focuses the source on open and restores focus from editor background", async () => {
  await open({}, true);
  const content = wrapper!.get(".cm-content").element;
  expect(document.activeElement).toBe(content);
  const title = wrapper!.get('input[aria-label="文本附件标题"]');
  await title.trigger("focus");
  (title.element as HTMLInputElement).focus();
  await wrapper!.get(".text-source-editor").trigger("mousedown", { button: 0 });
  expect(document.activeElement).toBe(content);
});

// 模式切换只影响展示，保留未保存内容、选区和撤销历史，并提交原始材料。
it("previews current edits and returns to the same focused editor before saving", async () => {
  await open();
  const editor = wrapper!.getComponent(RichCodeEditor);
  const view = editor.vm.editorView!;
  const text = "# 材料\n\n**重点**\n\n- 项目一\n- 项目二\n\n{{literal}}";
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
  view.dispatch({ selection: { anchor: 4 } });
  await flushPromises();
  await wrapper!.get('input[value="preview"]').setValue(true);
  await flushPromises();
  expect(wrapper!.getComponent(RichTextRenderer).props("content")).toBe(text);
  expect(wrapper!.get(".text-source-editor").isVisible()).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  expect(wrapper!.props("attachments")).toEqual([original]);
  await wrapper!.get('input[value="source"]').setValue(true);
  await flushPromises();
  expect(editor.vm.editorView).toBe(view);
  expect(view.state.selection.main.anchor).toBe(4);
  expect(document.activeElement).toBe(wrapper!.get(".cm-content").element);
  await wrapper!
    .get(".cm-content")
    .trigger("keydown", { key: "z", ctrlKey: true });
  await flushPromises();
  expect(editor.vm.getContent()).toBe("original\n{{literal}}");
  await wrapper!
    .get(".cm-content")
    .trigger("keydown", { key: "y", ctrlKey: true });
  await flushPromises();
  expect(editor.vm.getContent()).toBe(text);
  await button("保存到消息").trigger("click");
  await flushPromises();
  expect(commit).toHaveBeenCalledExactlyOnceWith(
    original,
    { ...original, text },
    false
  );
});
