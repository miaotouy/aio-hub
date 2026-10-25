import { shallowMount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import PresetMessageEditor from "./PresetMessageEditor.vue";
import PresetCompositionEditor from "./PresetCompositionEditor.vue";
import {
  compilePresetComposition,
  type PresetComposition,
} from "@aiohub/agent-preset-core";

const { askToLeave } = vi.hoisted(() => ({ askToLeave: vi.fn() }));
vi.mock("@/utils/monaco", () => ({}));
vi.mock("@/components/common/RichCodeEditor.vue", () => ({ default: {} }));
vi.mock("@/tools/rich-text-renderer/RichTextRenderer.vue", () => ({
  default: {},
}));
vi.mock("./PresetBodyToolbar.vue", () => ({ default: {} }));
vi.mock("./PresetAttachmentPicker.vue", () => ({ default: {} }));
vi.mock("./PresetCompositionEditor.vue", () => ({
  default: {
    props: ["modelValue", "initialPartId"],
    emits: ["update:modelValue"],
    template: `<textarea :value="modelValue.parts[0].content" @input="$emit('update:modelValue', { ...modelValue, parts: [{ ...modelValue.parts[0], content: $event.target.value }] })" />`,
  },
}));
vi.mock("../assets/PresetInlineLeaveGuard.vue", () => ({
  default: {
    setup(_: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose({ ask: askToLeave });
      return () => null;
    },
  },
}));
vi.mock("@/tools/llm-chat/composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({ settings: { uiPreferences: {} } }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ getProfileById: vi.fn() }),
}));
vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => ({ currentFullSession: null }),
}));
vi.mock("@/tools/llm-chat/macro-engine", () => ({
  MacroRegistry: { getInstance: () => ({ getAllMacros: () => [{}] }) },
  initializeMacroEngine: vi.fn(),
}));
vi.mock("../../utils/agentAssetUtils", () => ({}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { error: vi.fn(), warning: vi.fn() },
}));

const wrappers: ReturnType<typeof shallowMount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
});

// Protect saved-draft/leave contracts through editor events and the public dialog guard.
it.each(["s", "Enter"])(
  "keeps edits typed during a pending Ctrl+%s save dirty and open",
  async (key) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const saveMessage = vi
      .fn()
      .mockImplementationOnce(() => pending)
      .mockResolvedValue(undefined);
    askToLeave.mockResolvedValue("continue");
    const wrapper = shallowMount(PresetMessageEditor, {
      props: {
        visible: true,
        isEditMode: true,
        initialForm: {
          role: "system",
          content: "",
          presetComposition: {
            version: 1,
            separator: "",
            parts: [{ id: "text", kind: "text", content: "submitted" }],
          },
        },
        saveMessage,
      },
      global: {
        stubs: {
          BaseDialog: {
            name: "BaseDialog",
            props: ["beforeClose"],
            template:
              '<div><slot name="content" /><slot name="footer" /></div>',
          },
          PresetCompositionEditor: false,
          PresetInlineLeaveGuard: false,
        },
      },
    });
    wrappers.push(wrapper);
    const input = wrapper.get("textarea");
    await input.trigger("keydown", { key, ctrlKey: true });
    expect(saveMessage).toHaveBeenCalledTimes(1);
    await input.setValue("typed during save");
    finish();
    await flushPromises();
    expect(
      saveMessage.mock.calls[0][0].presetComposition.parts[0].content
    ).toBe("submitted");
    expect(wrapper.emitted("update:visible")).toBeUndefined();
    const beforeClose = wrapper
      .getComponent({ name: "BaseDialog" })
      .props("beforeClose");
    expect(await beforeClose()).toBe(false);
    expect(askToLeave).toHaveBeenCalledTimes(1);

    await input.trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();
    expect(
      saveMessage.mock.calls[1][0].presetComposition.parts[0].content
    ).toBe("typed during save");
    expect(wrapper.emitted("update:visible")).toEqual([[false]]);
  }
);

// Entry contract: blank messages can start with a choice; existing bodies survive the same switch.
it.each(["", "  <description>原文</description> {{CHAR}}\n"])(
  "starts composition editing directly and preserves the original body %j",
  async (content) => {
    const saveMessage = vi.fn().mockResolvedValue(undefined);
    askToLeave.mockResolvedValue("continue");
    const wrapper = shallowMount(PresetMessageEditor, {
      props: {
        visible: true,
        isEditMode: false,
        initialForm: { role: "system", name: "Rules", content },
        saveMessage,
      },
      global: {
        stubs: {
          BaseDialog: {
            name: "BaseDialog",
            props: ["beforeClose"],
            template:
              '<div><slot name="content" /><slot name="footer" /></div>',
          },
          ElRadioGroup: {
            name: "ElRadioGroup",
            props: ["modelValue"],
            emits: ["change"],
            template: "<div><slot /></div>",
          },
          PresetInlineLeaveGuard: false,
        },
      },
    });
    wrappers.push(wrapper);
    const modeControl = wrapper
      .findAllComponents({ name: "ElRadioGroup" })
      .find((group) => group.attributes("aria-label") === "内容形式")!;
    modeControl.vm.$emit("change", "composition");
    await wrapper.vm.$nextTick();

    const editor = wrapper.getComponent(PresetCompositionEditor);
    const draft: PresetComposition = JSON.parse(
      JSON.stringify(editor.props("modelValue"))
    );
    expect(compilePresetComposition(draft).content).toBe(content);
    const choice = draft.parts.find((part) => part.kind === "choice")!;
    expect(editor.props("initialPartId")).toBe(choice.id);
    expect(choice.selectedOptionId).toBe(choice.options[0].id);
    const beforeClose = wrapper
      .getComponent({ name: "BaseDialog" })
      .props("beforeClose");
    expect(await beforeClose()).toBe(false);

    choice.options[0].content = "new alternative";
    editor.vm.$emit("update:modelValue", draft);
    await wrapper.vm.$nextTick();
    await wrapper
      .get(".preset-message-editor")
      .trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "system",
        name: "Rules",
        content: "",
        presetComposition: draft,
      })
    );
    expect(
      compilePresetComposition(saveMessage.mock.calls[0][0].presetComposition)
        .content
    ).toBe(content + "new alternative");
    expect(wrapper.emitted("update:visible")).toBeUndefined();
  }
);
