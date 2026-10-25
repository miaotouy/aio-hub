import { shallowMount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import AgentPresetEditor from "./AgentPresetEditor.vue";
import PresetCompositionCard from "./PresetCompositionCard.vue";
import PresetMessageCard from "./PresetMessageCard.vue";
import { readText } from "@tauri-apps/plugin-clipboard-manager";

vi.mock("@/tools/llm-chat/stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ getEffectiveProfile: () => null }),
}));
vi.mock("@/tools/llm-chat/composables/ui/useAnchorRegistry", () => ({
  useAnchorRegistry: () => ({
    getSystemAnchors: () => [],
    hasAnchor: () => false,
  }),
}));
vi.mock("./usePresetTokenCalculator", async () => {
  const { ref } = await import("vue");
  return {
    usePresetTokenCalculator: () => ({
      messageTokens: ref(new Map()),
      totalTokens: ref(0),
      isCalculatingTokens: ref(false),
    }),
  };
});
vi.mock("./usePresetImportExport", async () => {
  const { ref } = await import("vue");
  return {
    usePresetImportExport: () => ({
      showSTImportDialog: ref(false),
      stImportData: ref({}),
    }),
  };
});
vi.mock("./PresetCompositionCard.vue", () => ({
  default: {
    name: "PresetCompositionCard",
    props: ["message", "saveMessage"],
    template: "<div />",
  },
}));
vi.mock("./PresetMessageCard.vue", () => ({
  default: {
    name: "PresetMessageCard",
    props: ["element", "onRadioChange"],
    template: "<div />",
  },
}));
vi.mock("./PresetCompositionConversion.vue", () => ({ default: {} }));
vi.mock("./PresetGroupPanel.vue", () => ({ default: {} }));
vi.mock("./PresetGroupEditDialog.vue", () => ({ default: {} }));
vi.mock("./STPresetImportDialog.vue", () => ({ default: {} }));
vi.mock("./AgentPresetBatchDialog.vue", () => ({ default: {} }));
vi.mock("../editors/PresetMessageEditor.vue", () => ({ default: {} }));
vi.mock(
  "@/tools/user-profile-manager/components/user-profile/EditUserProfileDialog.vue",
  () => ({ default: {} })
);
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
const wrappers: ReturnType<typeof shallowMount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
});
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const messages = (): ChatMessageNode[] =>
  [
    {
      id: "a",
      role: "system",
      content: "",
      isEnabled: true,
      groupId: "g",
      presetComposition: {
        version: 1,
        separator: "",
        parts: [{ id: "text", kind: "text", content: "before" }],
      },
    },
    {
      id: "b",
      role: "system",
      content: "other",
      isEnabled: false,
      groupId: "g",
    },
  ] as ChatMessageNode[];
const mountEditor = (
  modelValue = messages(),
  savePresetMessage?: (
    next: ChatMessageNode,
    previous: ChatMessageNode
  ) => Promise<void>
) => {
  const wrapper = shallowMount(AgentPresetEditor, {
    props: {
      modelValue,
      agent: {
        presetGroups: [
          { id: "g", name: "Choice", selectionMode: "radio", enabled: true },
        ],
      },
      savePresetMessage,
    },
    global: { renderStubDefaultSlot: true },
  });
  wrappers.push(wrapper);
  return wrapper;
};

// The callback owns persistence and may reconcile newer radio selections while saving.
it("adopts the authoritative selection returned through modelValue during a pending save", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const wrapper = mountEditor(messages(), async (next) => {
    await pending;
    await wrapper.setProps({
      modelValue: [
        { ...next, isEnabled: false },
        { ...messages()[1], isEnabled: true },
      ],
    });
  });
  const card = wrapper.getComponent(PresetCompositionCard);
  const previous = copy(card.props("message"));
  const next = copy(previous);
  next.presetComposition!.parts[0] = {
    id: "text",
    kind: "text",
    content: "saved",
  };
  const saving = card.props("saveMessage")(next, previous);
  const other = wrapper.getComponent(PresetMessageCard);
  other.props("onRadioChange")!(other.props("element"));
  finish();
  await saving;
  await flushPromises();
  expect(
    wrapper.getComponent(PresetCompositionCard).props("message")
  ).toMatchObject({
    isEnabled: false,
    presetComposition: next.presetComposition,
  });
  expect(
    wrapper.getComponent(PresetMessageCard).props("element").isEnabled
  ).toBe(true);
});

it("still emits local composition saves when no persistence callback is provided", async () => {
  const wrapper = mountEditor();
  const card = wrapper.getComponent(PresetCompositionCard);
  const previous = copy(card.props("message"));
  const next = copy(previous);
  next.presetComposition!.separator = "\n";
  await card.props("saveMessage")(next, previous);
  const emitted = wrapper.emitted("update:modelValue")!;
  expect(
    (emitted[emitted.length - 1][0] as ChatMessageNode[])[0].presetComposition
      ?.separator
  ).toBe("\n");
});

it("preserves native composition text in single-message clipboard paste", async () => {
  const pasted = {
    ...messages()[0],
    presetComposition: {
      version: 1,
      separator: "",
      parts: [
        {
          id: "raw",
          kind: "text",
          content: "<description>Literal</description> {{CHAR}}",
        },
      ],
    },
  };
  vi.mocked(readText).mockResolvedValue(JSON.stringify(pasted));
  const wrapper = mountEditor();
  wrapper.getComponent(PresetCompositionCard).vm.$emit("paste");
  await flushPromises();
  expect(
    wrapper.getComponent(PresetCompositionCard).props("message")
      .presetComposition
  ).toEqual(pasted.presetComposition);
});
