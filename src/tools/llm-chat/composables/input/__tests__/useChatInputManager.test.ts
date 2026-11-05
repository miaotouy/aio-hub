// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, ref } from "vue";
import type { Asset } from "@/types/asset-management";
import type { KnowledgeReference } from "@/tools/knowledge-base/types";

const attachments = ref<Asset[]>([]);
const syncStateMock = vi.fn();
const addAttachmentsMock = vi.fn();

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
    addAttachments: addAttachmentsMock,
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

import { clearAllInstances, getInstance } from "@/utils/singleton";

const { useChatInputManager } = await import("../useChatInputManager");

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

function createKnowledgeReference(id: string): KnowledgeReference {
  return {
    schemaVersion: 1,
    type: "knowledge",
    libraryIds: [id],
    mode: "search",
    libraries: [{ id, name: `Library ${id}`, availability: "available" }],
  };
}

describe("useChatInputManager session drafts", () => {
  beforeEach(() => {
    attachments.value = [];
    syncStateMock.mockReset();
    addAttachmentsMock.mockReset();
    localStorage.clear();
    const manager = useChatInputManager();
    manager.clearAllDrafts();
    manager.setActiveSessionId(null);
  });

  it("restores the pending session input and attachments when refreshing before the save debounce", async () => {
    const manager = useChatInputManager();
    manager.setActiveSessionId("pending-session");
    await nextTick();
    const asset = createAsset("pending-attachment");
    manager.setContent("尚未发送的输入");
    manager.addAsset(asset);
    manager.setTemporaryModel({ profileId: "profile", modelId: "model" });
    manager.setKnowledgeReference(createKnowledgeReference("pending-library"));

    window.dispatchEvent(new Event("beforeunload"));
    expect(
      JSON.parse(localStorage.getItem("llm-chat-input-drafts")!).drafts[
        "pending-session"
      ].text
    ).toBe("尚未发送的输入");
    const original = getInstance<{ destroy(): void }>("ChatInputManager");
    original?.destroy();
    clearAllInstances();
    attachments.value = [];
    const restored = useChatInputManager();
    // 与 Store 启动绑定顺序一致：先清空选择，再恢复稳定草稿 ID。
    restored.setActiveSessionId(null);
    restored.setActiveSessionId("pending-session");
    expect(restored.inputText.value).toBe("尚未发送的输入");
    expect(restored.attachments.value).toEqual([asset]);
    expect(restored.temporaryModel.value).toEqual({
      profileId: "profile",
      modelId: "model",
    });
    expect(restored.knowledgeReference.value?.libraryIds).toEqual([
      "pending-library",
    ]);
    restored.setActiveSessionId("history-session");
    expect(restored.inputText.value).toBe("");
    restored.setActiveSessionId("pending-session");
    expect(restored.inputText.value).toBe("尚未发送的输入");
  });

  it("copies a draft with attachments to another session without clearing source", () => {
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

  it("moves a draft with attachments and clears the source session", () => {
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

  it("converts paths without per-file attachment notifications", async () => {
    const manager = useChatInputManager();
    addAttachmentsMock.mockImplementation(async ([path]: string[]) => {
      const fileName = path.split("\\").pop() || path;
      attachments.value.push({
        id: `asset-${fileName}`,
        uploadingId: `uploading-${fileName}`,
        type: "document",
        name: fileName,
        mimeType: "text/plain",
        path,
        size: 12,
        sourceModule: "llm-chat",
        createdAt: "2026-01-01T00:00:00.000Z",
        origins: [],
        importStatus: "pending",
      });
    });
    manager.setContent("C:\\first.txt\nD:\\second.txt");

    const result = await manager.convertPathsToAttachments();

    expect(addAttachmentsMock).toHaveBeenNthCalledWith(1, ["C:\\first.txt"], {
      notify: false,
    });
    expect(addAttachmentsMock).toHaveBeenNthCalledWith(2, ["D:\\second.txt"], {
      notify: false,
    });
    expect(result).toEqual({
      successCount: 2,
      failedCount: 0,
      totalCount: 2,
    });
    expect(manager.inputText.value).toBe(
      "【file::uploading:uploading-first.txt】\n【file::uploading:uploading-second.txt】"
    );
  });

  it("converts Linux paths and encoded file URIs without changing path separators", async () => {
    const manager = useChatInputManager();
    addAttachmentsMock.mockImplementation(async ([path]: string[]) => {
      attachments.value.push({
        ...createAsset(`asset-${attachments.value.length}`),
        path,
        name: path.split("/").pop()!,
      });
    });
    manager.setContent(
      "/home/mty/测试 file.txt\nfile:///tmp/hello%20world.txt"
    );
    const result = await manager.convertPathsToAttachments();
    expect(result).toEqual({ successCount: 2, failedCount: 0, totalCount: 2 });
    expect(addAttachmentsMock).toHaveBeenNthCalledWith(
      1,
      ["/home/mty/测试 file.txt"],
      { notify: false }
    );
    expect(addAttachmentsMock).toHaveBeenNthCalledWith(
      2,
      ["/tmp/hello world.txt"],
      { notify: false }
    );
    expect(manager.inputText.value).toBe(
      "【file::asset-0】\n【file::asset-1】"
    );
  });

  it("keeps a Windows file URI as a single encoded path", async () => {
    const manager = useChatInputManager();
    addAttachmentsMock.mockImplementation(async ([path]: string[]) => {
      attachments.value.push({ ...createAsset("windows-uri"), path });
    });
    manager.setContent("file:///C:/my%20file.txt");
    expect(await manager.convertPathsToAttachments()).toEqual({
      successCount: 1,
      failedCount: 0,
      totalCount: 1,
    });
    expect(addAttachmentsMock).toHaveBeenCalledWith(
      [String.raw`C:\my file.txt`],
      { notify: false }
    );
    expect(manager.inputText.value).toBe("【file::windows-uri】");
  });

  it("keeps Knowledge references isolated per session and clears them after send", () => {
    const manager = useChatInputManager();
    const reference = createKnowledgeReference("library-a");

    manager.setActiveSessionId("session-a");
    manager.setContent("query a");
    manager.setKnowledgeReference(reference);
    manager.setActiveSessionId("session-b");

    expect(manager.knowledgeReference.value).toBeNull();
    expect(manager.getDraftSnapshot("session-a").knowledgeReference).toEqual(
      reference
    );

    manager.setActiveSessionId("session-a");
    manager.clear("session-a");
    expect(manager.knowledgeReference.value).toBeNull();
    expect(manager.getDraftSnapshot("session-a").knowledgeReference).toBeNull();
  });
});
