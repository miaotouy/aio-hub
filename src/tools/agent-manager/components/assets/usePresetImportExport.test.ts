import { afterEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../../types/agent";
import { usePresetImportExport } from "./usePresetImportExport";

vi.mock("@/tools/llm-chat/composables/ui/useAnchorRegistry", () => ({
  useAnchorRegistry: () => ({ hasAnchor: () => false }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
afterEach(() => vi.clearAllMocks());
const original = (): ChatMessageNode[] =>
  [
    {
      id: "ordinary",
      role: "system",
      content: "  <description>Literal</description>\r\n{{CHAR}} <user> ",
    },
    {
      id: "composed",
      role: "system",
      content: "",
      presetComposition: {
        version: 1,
        separator: "\r\n",
        parts: [
          {
            id: "text",
            kind: "text",
            content: "<scenario>Literal</scenario> {{WORLD}}",
          },
          {
            id: "choice",
            kind: "choice",
            selectedOptionId: "a",
            options: [
              { id: "a", content: "<user> {{CHAR}}" },
              { id: "b", content: "  <description>Inactive</description>\r\n" },
            ],
          },
        ],
      },
    },
  ] as ChatMessageNode[];
function createImporter(messages: ChatMessageNode[] = []) {
  const localMessages = ref(messages);
  const sync = vi.fn();
  const api = usePresetImportExport({
    localMessages,
    presetGroups: ref<PresetMessageGroup[]>([]),
    agentName: ref("Agent"),
    importFileInput: ref<HTMLInputElement | null>(null),
    onSyncToParent: sync,
  });
  return { ...api, localMessages, sync };
}
async function importFile(
  api: ReturnType<typeof createImporter>,
  text: string
) {
  await api.handleFileSelected({
    target: { files: [{ text: async () => text }], value: "preset.json" },
  } as unknown as Event);
}

// Protect native round trips, including inactive bodies; format-specific macro conversion stays at its parser.
it.each(["json", "yaml"] as const)(
  "preserves every body through native %s export and file import",
  async (format) => {
    const source = createImporter(original());
    await source.handleCopy(format);
    const exported = vi.mocked(writeText).mock.lastCall![0];
    const target = createImporter();
    await importFile(target, exported);
    expect(target.localMessages.value).toEqual(original());
    expect(target.sync).toHaveBeenCalledTimes(1);
  }
);

it("preserves native bodies through clipboard import", async () => {
  const source = createImporter(original());
  await source.handleCopy();
  vi.mocked(readText).mockResolvedValue(vi.mocked(writeText).mock.lastCall![0]);
  const target = createImporter();
  await target.handlePaste();
  expect(target.localMessages.value).toEqual(original());
});

it("still converts Tavern macros at the prompt-file parser boundary", async () => {
  const target = createImporter();
  await importFile(
    target,
    JSON.stringify({
      prompts: [
        { identifier: "main", role: "system", content: "{{CHAR}} <user>" },
      ],
      prompt_order: [
        { character_id: 1, order: [{ identifier: "main", enabled: true }] },
      ],
    })
  );
  expect(target.showSTImportDialog.value).toBe(true);
  target.handleConfirmSTImport(target.stImportData.value);
  expect(target.localMessages.value[0].content).toBe("{{char}} {{user}}");
  expect(target.sync).toHaveBeenCalledTimes(1);
});
