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

describe("useChatInputManager session drafts", () => {
  beforeEach(() => {
    attachments.value = [];
    syncStateMock.mockReset();
    localStorage.clear();
    const manager = useChatInputManager();
    manager.clearAllDrafts();
    manager.setActiveSessionId(null);
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
});
