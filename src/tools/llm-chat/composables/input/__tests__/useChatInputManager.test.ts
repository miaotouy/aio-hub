import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { Asset } from "@/types/asset-management";

const attachments = ref<Asset[]>([]);
const syncStateMock = vi.fn();

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
  configurable: true,
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));

vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({
    windowType: "main",
    syncState: syncStateMock,
    onMessage: vi.fn(() => vi.fn()),
  }),
}));

vi.mock("@/composables/useStateSyncEngine", () => ({
  registerSyncSource: vi.fn(() => vi.fn()),
}));

vi.mock("../../../core/context-processors/transcription-processor", () => ({
  generateAssetPlaceholder: (id: string) => `【file::${id}】`,
  generateUploadingPlaceholder: (id: string) => `【file::uploading:${id}】`,
}));

vi.mock("../../features/useAttachmentManager", () => ({
  useAttachmentManager: () => ({
    attachments,
    isProcessing: ref(false),
    hasAttachments: computed(() => attachments.value.length > 0),
    count: computed(() => attachments.value.length),
    isFull: computed(() => false),
    maxCount: 100,
    onImportComplete: vi.fn(),
    addAttachments: vi.fn(),
    addAsset: (asset: Asset) => {
      attachments.value.push(asset);
      return true;
    },
    addAssets: (assetsToAdd: Asset[]) => {
      attachments.value.push(...assetsToAdd);
      return assetsToAdd.length;
    },
    removeAttachmentById: (assetId: string) => {
      attachments.value = attachments.value.filter(
        (asset) => asset.id !== assetId
      );
    },
    clearAttachments: () => {
      attachments.value = [];
    },
    syncAttachments: (newAssets: Asset[]) => {
      attachments.value = [...newAssets];
    },
  }),
}));

function createAsset(id: string): Asset {
  return {
    id,
    type: "document",
    name: `${id}.txt`,
    mimeType: "text/plain",
    path: `texts/${id}.txt`,
    size: 12,
    sourceModule: "llm-chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    origins: [],
  };
}

describe("useChatInputManager session drafts", () => {
  beforeEach(async () => {
    attachments.value = [];
    syncStateMock.mockReset();
    localStorage.clear();
    const { useChatInputManager } = await import("../useChatInputManager");
    const manager = useChatInputManager();
    manager.clearAllDrafts();
    manager.setActiveSessionId(null);
  });

  it("copies a draft with attachments to another session without clearing source", async () => {
    const { useChatInputManager } = await import("../useChatInputManager");
    const manager = useChatInputManager();
    const asset = createAsset("asset-copy");

    manager.setActiveSessionId("session-a");
    manager.setContent("draft text");
    manager.addAsset(asset);
    manager.moveDraftToSession("session-a", "session-b", "copy");

    expect(manager.getDraftSnapshot("session-a").text).toBe("draft text");
    expect(
      manager.getDraftSnapshot("session-a").attachments.map((item) => item.id)
    ).toEqual(["asset-copy"]);
    expect(manager.getDraftSnapshot("session-b").text).toBe("draft text");
    expect(
      manager.getDraftSnapshot("session-b").attachments.map((item) => item.id)
    ).toEqual(["asset-copy"]);
  });

  it("moves a draft with attachments and clears the source session", async () => {
    const { useChatInputManager } = await import("../useChatInputManager");
    const manager = useChatInputManager();
    const asset = createAsset("asset-move");

    manager.setActiveSessionId("session-a");
    manager.setContent("move me");
    manager.addAsset(asset);
    manager.moveDraftToSession("session-a", "session-b", "move");

    expect(manager.getDraftSnapshot("session-a").text).toBe("");
    expect(manager.getDraftSnapshot("session-a").attachments).toEqual([]);
    expect(manager.getDraftSnapshot("session-b").text).toBe("move me");
    expect(
      manager.getDraftSnapshot("session-b").attachments.map((item) => item.id)
    ).toEqual(["asset-move"]);
  });
});
