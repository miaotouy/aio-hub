import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, ref } from "vue";
import type { Asset } from "@/types/asset-management";
import type { VirtualTextAttachment } from "../../types/virtual-attachment";

vi.mock("../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => {
    const attachments = ref<Asset[]>([]);
    const virtualAttachments = ref<VirtualTextAttachment[]>([]);
    return {
      inputText: ref(""),
      attachments,
      virtualAttachments,
      activeSessionId: ref("session"),
      isProcessingAttachments: ref(false),
      hasAttachments: computed(
        () => attachments.value.length + virtualAttachments.value.length > 0
      ),
      attachmentCount: computed(() => attachments.value.length),
      temporaryModel: ref(null),
      continuationModel: ref(null),
      knowledgeReference: ref(null),
      draftClipboard: ref(null),
      getDraftSnapshot: () => ({
        virtualAttachments: virtualAttachments.value,
      }),
      addVirtualAttachment: (attachment: VirtualTextAttachment) => {
        virtualAttachments.value = [...virtualAttachments.value, attachment];
      },
      addAssets: (assets: Asset[]) => {
        attachments.value.push(...assets);
      },
    };
  },
}));
vi.mock("../../composables/input/useChatInputTokenPreview", () => ({
  useChatInputTokenPreview: () => ({}),
}));
vi.mock("@/composables/useLlmProfiles", () => ({ useLlmProfiles: () => ({}) }));
vi.mock("../../composables/chat/useTranslation", () => ({
  useTranslation: () => ({}),
}));
vi.mock("../../composables/features/useContextCompressor", () => ({
  useContextCompressor: () => ({}),
}));
vi.mock("../llmChatStore", () => ({ useLlmChatStore: () => ({}) }));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
vi.mock("@/composables/useModelSelectDialog", () => ({
  useModelSelectDialog: () => ({}),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({}),
}));
vi.mock("../../composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({}),
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({}),
}));
vi.mock("../userProfileStore", () => ({ useUserProfileStore: () => ({}) }));
vi.mock("../../macro-engine", () => ({
  MacroProcessor: class {},
  createMacroContext: vi.fn(),
}));
vi.mock("@/composables/useAttachmentProcessor", () => ({
  processInlineData: vi.fn(),
}));
vi.mock("../../composables/features/useTranscriptionManager", () => ({
  useTranscriptionManager: () => ({}),
}));
vi.mock("@/composables/useAssetManager", () => ({ assetManagerEngine: {} }));
vi.mock("@/tools/knowledge-base/services/reference", () => ({
  validateKnowledgeReferenceForAgent: vi.fn(),
}));
vi.mock("@/tools/knowledge-base/services/access", () => ({
  normalizeAgentKnowledgeAccess: vi.fn(),
}));

import { processInlineData } from "@/composables/useAttachmentProcessor";
import { useMessageInputStore } from "../messageInputStore";

function pasteEvent(text: string): ClipboardEvent {
  const event = new Event("paste", { cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { files: [], getData: () => text },
  });
  return event as ClipboardEvent;
}

describe("message input paste routing", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("extracts inline images before long text conversion", async () => {
    const store = useMessageInputStore();
    const imageText = `![image](data:image/png;base64,${"A".repeat(150000)})`;
    const asset = { id: "image", type: "image", name: "image.png" } as Asset;
    const processedText = "![image](appdata://image.png)";
    vi.mocked(processInlineData).mockResolvedValue({
      processedText,
      newAssets: [asset],
    });
    const editor = {
      getSelectionRange: () => ({ start: 2, end: 5 }),
      insertText: vi.fn(),
      focus: vi.fn(),
    };
    store.registerTextareaRef(editor);
    const event = pasteEvent(imageText);
    await store.handlePaste(event);
    expect(event.defaultPrevented).toBe(true);
    expect(store.attachments).toEqual([asset]);
    expect(store.virtualAttachments).toEqual([]);
    expect(editor.insertText).toHaveBeenCalledWith(processedText, 2, 5);
  });

  it.each([false, true])(
    "retains full long text with image extraction enabled=%s",
    async (extractBase64FromPaste) => {
      const store = useMessageInputStore();
      store.settings.extractBase64FromPaste = extractBase64FromPaste;
      const text = extractBase64FromPaste
        ? "普通长文本\r\n".repeat(700)
        : `![image](data:image/png;base64,${"A".repeat(4000)})`;
      const event = pasteEvent(text);
      await store.handlePaste(event);
      expect(event.defaultPrevented).toBe(true);
      expect(store.virtualAttachments).toEqual([
        expect.objectContaining({ text }),
      ]);
      expect(processInlineData).not.toHaveBeenCalled();
    }
  );
});
