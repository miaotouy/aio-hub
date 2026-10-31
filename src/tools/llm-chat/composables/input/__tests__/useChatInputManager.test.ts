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

const draftDisk = vi.hoisted(() => ({
  value: null as unknown,
  fail: false,
  loadFail: false,
}));
vi.mock("../../storage/useChatInputDraftStorage", () => ({
  loadChatInputDrafts: vi.fn(async () => {
    if (draftDisk.loadFail) throw new Error("draft read failed");
    return draftDisk.value ? JSON.parse(JSON.stringify(draftDisk.value)) : null;
  }),
  saveChatInputDrafts: vi.fn(async (state: unknown) => {
    if (draftDisk.fail) throw new Error("disk full");
    draftDisk.value = JSON.parse(JSON.stringify(state));
  }),
}));

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
  beforeEach(async () => {
    draftDisk.fail = false;
    draftDisk.loadFail = false;
    attachments.value = [];
    syncStateMock.mockReset();
    addAttachmentsMock.mockReset();
    localStorage.clear();
    const manager = useChatInputManager();
    await manager.ready;
    manager.clearAllDrafts();
    manager.setActiveSessionId(null);
    await manager.flushDrafts();
  });

  it("preserves saved and legacy drafts after a failed restore and recovers on retry", async () => {
    const manager = useChatInputManager();
    manager.setActiveSessionId("restore-session");
    await nextTick();
    manager.setContent("已保存的材料");
    await manager.flushDrafts();
    getInstance<{ destroy(): void }>("ChatInputManager")?.destroy();
    clearAllInstances();
    // Finish the previous instance's final write before simulating the next startup.
    await manager.flushDrafts();
    const saved = JSON.parse(JSON.stringify(draftDisk.value));
    localStorage.setItem("llm-chat-input-drafts", JSON.stringify(saved));
    draftDisk.loadFail = true;
    const restored = useChatInputManager();
    await restored.ready;
    expect(restored.saveStatus.value).toBe("error");
    await expect(restored.flushDrafts()).rejects.toThrow();
    expect(draftDisk.value).toEqual(saved);
    expect(localStorage.getItem("llm-chat-input-drafts")).not.toBeNull();

    draftDisk.loadFail = false;
    await restored.flushDrafts();
    restored.setActiveSessionId("restore-session");
    expect(restored.inputText.value).toBe("已保存的材料");
    expect(restored.saveStatus.value).toBe("saved");
    expect(localStorage.getItem("llm-chat-input-drafts")).toBeNull();
  });

  it("restores the pending session input and attachments from draft storage after recreation", async () => {
    const manager = useChatInputManager();
    manager.setActiveSessionId("pending-session");
    await nextTick();
    const asset = createAsset("pending-attachment");
    manager.setContent("尚未发送的输入");
    manager.addAsset(asset);
    manager.setTemporaryModel({ profileId: "profile", modelId: "model" });
    manager.setKnowledgeReference(createKnowledgeReference("pending-library"));

    window.dispatchEvent(new Event("beforeunload"));
    await manager.flushDrafts();
    const original = getInstance<{ destroy(): void }>("ChatInputManager");
    original?.destroy();
    clearAllInstances();
    attachments.value = [];
    const restored = useChatInputManager();
    // 与 Store 启动绑定顺序一致：先清空选择，再恢复稳定草稿 ID。
    restored.setActiveSessionId(null);
    restored.setActiveSessionId("pending-session");
    await restored.ready;
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

  // 保护完整 file URL 的替换边界与失败重试行为；只断言输入、附件与转换结果。
  it.each([
    [
      "file://G:\\work\\Tencent Files\\image.png",
      '"',
      "G:\\work\\Tencent Files\\image.png",
    ],
    [
      "file:///G:/work/Tencent Files/image.png",
      "'",
      "G:\\work\\Tencent Files\\image.png",
    ],
    [
      "FILE://G:\\work\\Tencent Files\\image.png",
      '"',
      "G:\\work\\Tencent Files\\image.png",
    ],
    [
      "file://G:\\work\\O'Brien\\image.png",
      '"',
      "G:\\work\\O'Brien\\image.png",
    ],
  ])("converts the complete QQ image URL %s", async (url, quote, path) => {
    const manager = useChatInputManager();
    const asset = {
      ...createAsset("qq-image"),
      name: "image.png",
      path,
    };
    addAttachmentsMock.mockImplementation(async () => {
      attachments.value.push(asset);
    });
    manager.setContent(`QQ 消息\n<img src=${quote}${url}${quote} />\n后续消息`);

    expect(await manager.convertPathsToAttachments()).toEqual({
      successCount: 1,
      failedCount: 0,
      totalCount: 1,
    });
    expect(addAttachmentsMock).toHaveBeenCalledExactlyOnceWith([asset.path], {
      notify: false,
    });
    expect(manager.inputText.value).toBe(
      `QQ 消息\n<img src=${quote}【file::qq-image】${quote} />\n后续消息`
    );
  });

  it("retains the complete file URL when an attachment import fails", async () => {
    const manager = useChatInputManager();
    const text = '<img src="file://G:\\work\\missing.png" />';
    manager.setContent(text);
    addAttachmentsMock.mockResolvedValue(undefined);

    expect(await manager.convertPathsToAttachments()).toEqual({
      successCount: 0,
      failedCount: 1,
      totalCount: 1,
    });
    expect(manager.inputText.value).toBe(text);
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
  // 保护跨工具前置/追加材料的顺序，连同正文和草稿持久化一起验证。
  it("preserves prepended and appended text material order after restoring a draft", async () => {
    const manager = useChatInputManager();
    manager.setActiveSessionId("ordered-materials");
    manager.setContent("原有问题");
    const material = {
      id: "middle",
      kind: "text" as const,
      title: "中间材料",
      text: "中间内容",
    };
    manager.addVirtualAttachment(material);
    manager.addVirtualAttachment(
      { ...material, id: "first" },
      undefined,
      "prepend"
    );
    manager.addVirtualAttachment({ ...material, id: "last" });
    await manager.flushDrafts();
    manager.setActiveSessionId("other-session");
    manager.setActiveSessionId("ordered-materials");
    expect(manager.virtualAttachments.value.map((item) => item.id)).toEqual([
      "first",
      "middle",
      "last",
    ]);
    expect(manager.inputText.value).toBe("原有问题");
  });

  it("keeps copied text materials independent across sessions and restores their full text", async () => {
    const manager = useChatInputManager();
    manager.setActiveSessionId("text-source");
    await nextTick();
    const material = {
      id: "material",
      kind: "text" as const,
      title: "代码",
      text: "  首行\r\n\t{{literal}} 😀  ",
    };
    manager.addVirtualAttachment(material);
    expect(manager.hasAttachments.value).toBe(true);
    manager.moveDraftToSession("text-source", "text-copy", "copy");
    const copied = manager.getDraftSnapshot("text-copy").virtualAttachments![0];
    expect(copied.id).not.toBe(material.id);
    await manager.updateVirtualAttachment(
      copied,
      { ...copied, text: "修改后的副本" },
      "text-copy"
    );
    expect(
      manager.getDraftSnapshot("text-source").virtualAttachments![0].text
    ).toBe(material.text);
    await manager.flushDrafts();
    getInstance<{ destroy(): void }>("ChatInputManager")?.destroy();
    clearAllInstances();
    const restored = useChatInputManager();
    restored.setActiveSessionId("text-source");
    await restored.ready;
    expect(restored.virtualAttachments.value[0]).toEqual(material);
    restored.setActiveSessionId("text-copy");
    expect(restored.virtualAttachments.value[0].text).toBe("修改后的副本");
  });

  it("retains unsaved material on disk errors and preserves edits made after submission", async () => {
    const manager = useChatInputManager();
    manager.setActiveSessionId("text-send");
    await nextTick();
    const material = {
      id: "material",
      kind: "text" as const,
      title: "材料",
      text: "正文",
    };
    manager.addVirtualAttachment(material);
    const submitted = manager.getDraftSnapshot("text-send");
    draftDisk.fail = true;
    await expect(manager.flushDrafts()).rejects.toThrow("disk full");
    expect(manager.virtualAttachments.value).toEqual([material]);
    manager.setContent("下一条问题");
    manager.clearSubmittedDraft("text-send", submitted);
    expect(manager.inputText.value).toBe("下一条问题");
    expect(manager.virtualAttachments.value).toEqual([material]);
    draftDisk.fail = false;
    await manager.flushDrafts();
    manager.clearSubmittedDraft(
      "text-send",
      manager.getDraftSnapshot("text-send")
    );
    expect(manager.virtualAttachments.value).toEqual([]);
    expect(manager.inputText.value).toBe("");
  });
});
