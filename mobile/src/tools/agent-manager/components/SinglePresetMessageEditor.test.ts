// @vitest-environment jsdom
import { shallowMount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import {
  compilePresetComposition,
  createPresetPart,
} from "@aiohub/agent-preset-core";
import SinglePresetMessageEditor from "./SinglePresetMessageEditor.vue";
import PresetCompositionEditor from "./PresetCompositionEditor.vue";
import { customDialog } from "@/utils/feedback";
import type { PresetMessage } from "../types/agent";
vi.mock("@/i18n", () => ({
  useI18n: () => ({ tRaw: (key: string) => key.split(".").pop() }),
}));
vi.mock("@/utils/feedback", () => ({
  customDialog: vi.fn(),
  customMessage: vi.fn(),
}));
vi.mock("./PresetCompositionEditor.vue", () => ({
  default: {
    props: ["modelValue"],
    template: "<div />",
  },
}));
const wrappers: ReturnType<typeof shallowMount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.resetAllMocks();
});
const plain = (): PresetMessage => ({
  id: "message",
  parentId: null,
  childrenIds: [],
  role: "user",
  status: "complete",
  content: "原始正文\n{{user}}",
  timestamp: "2026-10-25T00:00:00Z",
  groupId: "g",
  injectionStrategy: { type: "depth", depth: 2 },
  presetAttachments: [{ assetId: "attachment" }],
  modelMatch: { enabled: true, patterns: ["model"] },
});
function editor(message = plain()) {
  const wrapper = shallowMount(SinglePresetMessageEditor, {
    props: { open: true, message, groups: [] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const modeButtons = (wrapper: ReturnType<typeof editor>) =>
  wrapper.findAll("button[aria-pressed]");

// Conversion is a public editing contract: exact body and outer message settings survive.
it("converts existing plain text to a single-version composition and saves only the structure", async () => {
  const source = plain();
  const wrapper = editor(source);
  await modeButtons(wrapper)[1].trigger("click");
  const composition = wrapper
    .findComponent(PresetCompositionEditor)
    .props("modelValue");
  expect(compilePresetComposition(composition).content).toBe(source.content);
  await wrapper.get(".save-button").trigger("click");
  expect(wrapper.emitted("save")?.[0]?.[0]).toEqual({
    ...source,
    content: "",
    presetComposition: composition,
  });
  expect(source.content).toBe("原始正文\n{{user}}");
});

it("requires confirmation to flatten, preserves settings, and protects the resulting unsaved draft", async () => {
  const active = createPresetPart("当前正文");
  active.options.push({ id: "other", content: "其他版本" });
  const inactive = { ...createPresetPart("停用正文"), enabled: false };
  const source = {
    ...plain(),
    content: "",
    presetComposition: {
      version: 1 as const,
      separator: "\n",
      parts: [active, inactive],
    },
  };
  const wrapper = editor(source);
  vi.mocked(customDialog).mockResolvedValueOnce(false);
  await modeButtons(wrapper)[0].trigger("click");
  await flushPromises();
  expect(
    wrapper.findComponent(PresetCompositionEditor).props("modelValue")
  ).toEqual(source.presetComposition);
  vi.mocked(customDialog).mockResolvedValueOnce(true);
  await modeButtons(wrapper)[0].trigger("click");
  await flushPromises();
  expect(wrapper.get("textarea").element.value).toBe("当前正文");
  vi.mocked(customDialog).mockResolvedValueOnce(false);
  await wrapper.get(".icon-button").trigger("click");
  await flushPromises();
  expect(wrapper.emitted("close")).toBeUndefined();
  await wrapper.get(".save-button").trigger("click");
  expect(wrapper.emitted("save")?.[0]?.[0]).toEqual({
    ...plain(),
    content: "当前正文",
  });
  expect(source.presetComposition.parts).toHaveLength(2);
});
