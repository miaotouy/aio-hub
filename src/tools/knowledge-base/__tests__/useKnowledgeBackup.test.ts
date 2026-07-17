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
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  listen: vi.fn(),
  confirm: vi.fn(),
  saveWorkspace: vi.fn(),
  loadWorkspace: vi.fn(),
  loadBaseMeta: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("element-plus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("element-plus")>();
  return {
    ...actual,
    ElMessageBox: { confirm: mocks.confirm },
  };
});
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
  },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: mocks.handleError }),
}));
vi.mock("../utils/kbStorage", () => ({
  kbStorage: {
    saveWorkspace: mocks.saveWorkspace,
    loadWorkspace: mocks.loadWorkspace,
    loadBaseMeta: mocks.loadBaseMeta,
  },
}));

import { useKnowledgeBackup } from "../composables/useKnowledgeBackup";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";

const meta = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Imported",
  description: null,
  createdAt: 1,
  updatedAt: 2,
  vectorization: {
    isIndexed: false,
    lastIndexedAt: null,
    modelId: "",
    provider: "",
    dimension: 0,
  },
  entries: [],
  tags: [],
  icon: null,
};

function inspected(inspect: any) {
  return {
    sourceEntry: inspect.sourceEntry || null,
    libraryName: inspect.libraryName,
    inspect,
    error: null as string | null,
  };
}

describe("useKnowledgeBackup", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.confirm.mockReset();
    mocks.listen.mockResolvedValue(() => undefined);
    mocks.loadWorkspace.mockResolvedValue({
      version: "2.0.0",
      config: {},
      bases: [],
    });
  });

  it("quietly handles a cancelled file picker", async () => {
    mocks.open.mockResolvedValue(null);
    const backup = useKnowledgeBackup();

    await backup.importBackups();

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(backup.dialogVisible.value).toBe(false);
  });

  it("keeps successful imports when another selected package fails", async () => {
    mocks.open.mockResolvedValue(["C:/a.aio-kb", "C:/broken.aio-kb"]);
    mocks.invoke.mockImplementation((command: string, payload?: any) => {
      if (command === "kb_inspect_backups") {
        return Promise.resolve(
          [
            {
              sourcePath: payload.sourcePath,
              format: "aiohub.knowledge-library",
              formatVersion: 1,
              libraryId: meta.id,
              libraryName: payload.sourcePath.includes("broken")
                ? "Broken"
                : "Imported",
              entryCount: 0,
              assetCount: 0,
              hasConflict: false,
              legacyContentOnly: false,
              warnings: [],
            },
          ].map(inspected)
        );
      }
      if (command === "kb_import_backup") {
        if (payload.sourcePath.includes("broken")) {
          return Promise.reject(new Error("checksum failed"));
        }
        return Promise.resolve({
          sourcePath: payload.sourcePath,
          status: "success",
          libraryId: meta.id,
          libraryName: "Imported",
          entryCount: 0,
          restoredAssetCount: 0,
          missingAssetCount: 0,
          replacedExisting: false,
          importedAsCopy: false,
          legacyContentOnly: false,
          vectorsNeedRebuild: true,
          warnings: [],
        });
      }
      if (command === "kb_list_bases") return Promise.resolve([meta]);
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const store = useKnowledgeBaseStore();
    store.workspace = {
      version: "2.0.0",
      config: store.config,
      bases: [],
    };
    const backup = useKnowledgeBackup();

    await backup.importBackups();

    expect(backup.items.value.map((item) => item.status)).toEqual([
      "success",
      "failed",
    ]);
    expect(backup.failed.value).toBe(1);
    expect(mocks.saveWorkspace).toHaveBeenCalledOnce();
  });

  it("uses copy strategy when the conflict dialog secondary action is chosen", async () => {
    mocks.open.mockResolvedValue("C:/conflict.aio-kb");
    mocks.confirm.mockRejectedValue("cancel");
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "kb_inspect_backups") {
        return Promise.resolve(
          [
            {
              sourcePath: "C:/conflict.aio-kb",
              format: "aiohub.knowledge-library",
              formatVersion: 1,
              libraryId: meta.id,
              libraryName: "Imported",
              entryCount: 0,
              assetCount: 0,
              hasConflict: true,
              conflictingLibraryName: "Existing",
              conflictingEntryCount: 12,
              legacyContentOnly: false,
              warnings: [],
            },
          ].map(inspected)
        );
      }
      if (command === "kb_import_backup") {
        return Promise.resolve({
          status: "skipped",
          libraryName: "Imported",
          entryCount: 0,
          restoredAssetCount: 0,
          warnings: [],
        });
      }
      return Promise.resolve([]);
    });
    const backup = useKnowledgeBackup();

    await backup.importBackups();

    expect(mocks.invoke).toHaveBeenCalledWith("kb_import_backup", {
      sourcePath: "C:/conflict.aio-kb",
      sourceEntry: null,
      options: { conflictStrategy: "copy" },
    });
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining("目标库：12 个条目"),
      "备份导入冲突",
      expect.any(Object)
    );
  });

  it("cancels the import when replacement confirmation is declined", async () => {
    mocks.open.mockResolvedValue("C:/conflict.aio-kb");
    mocks.confirm
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce("cancel");
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "kb_inspect_backups") {
        return Promise.resolve(
          [
            {
              sourcePath: "C:/conflict.aio-kb",
              format: "aiohub.knowledge-library",
              formatVersion: 1,
              libraryId: meta.id,
              libraryName: "Imported",
              entryCount: 3,
              assetCount: 0,
              hasConflict: true,
              conflictingLibraryName: "Existing",
              conflictingEntryCount: 12,
              legacyContentOnly: false,
              warnings: [],
            },
          ].map(inspected)
        );
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const backup = useKnowledgeBackup();

    await backup.importBackups();

    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    expect(mocks.confirm).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("现有 12 个目标条目"),
      "确认替换知识库",
      expect.any(Object)
    );
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      "kb_import_backup",
      expect.anything()
    );
    expect(backup.items.value).toEqual([
      expect.objectContaining({ status: "skipped" }),
    ]);
  });

  it("imports each indexed library from a multi-library zip", async () => {
    mocks.open.mockResolvedValue("C:/all-libraries.zip");
    mocks.invoke.mockImplementation((command: string, payload?: any) => {
      if (command === "kb_inspect_backups") {
        return Promise.resolve(
          [
            {
              sourcePath: payload.sourcePath,
              sourceEntry: "libraries/A",
              format: "aiohub.knowledge-library",
              formatVersion: 1,
              libraryId: "a",
              libraryName: "A",
              entryCount: 1,
              assetCount: 0,
              hasConflict: false,
              legacyContentOnly: false,
              warnings: [],
            },
            {
              sourcePath: payload.sourcePath,
              sourceEntry: "libraries/B",
              format: "aiohub.knowledge-library",
              formatVersion: 1,
              libraryId: "b",
              libraryName: "B",
              entryCount: 2,
              assetCount: 0,
              hasConflict: false,
              legacyContentOnly: false,
              warnings: [],
            },
          ]
            .map(inspected)
            .concat([
              {
                sourceEntry: "libraries/Broken",
                libraryName: "Broken",
                inspect: null,
                error: "checksum failed",
              },
            ])
        );
      }
      if (command === "kb_import_backup") {
        return Promise.resolve({
          sourcePath: payload.sourcePath,
          status: "skipped",
          libraryName: payload.sourceEntry.endsWith("A") ? "A" : "B",
          entryCount: 0,
          restoredAssetCount: 0,
          legacyContentOnly: false,
          warnings: [],
        });
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    const backup = useKnowledgeBackup();

    await backup.importBackups();

    expect(mocks.invoke).toHaveBeenCalledWith("kb_import_backup", {
      sourcePath: "C:/all-libraries.zip",
      sourceEntry: "libraries/A",
      options: { conflictStrategy: "copy" },
    });
    expect(mocks.invoke).toHaveBeenCalledWith("kb_import_backup", {
      sourcePath: "C:/all-libraries.zip",
      sourceEntry: "libraries/B",
      options: { conflictStrategy: "copy" },
    });
    expect(backup.items.value).toHaveLength(3);
    expect(backup.total.value).toBe(3);
    expect(backup.failed.value).toBe(1);
  });

  it("tracks export progress and sends a backend cancellation signal", async () => {
    mocks.open.mockResolvedValue("C:/backups");
    let progressHandler: ((event: { payload: any }) => void) | undefined;
    mocks.listen.mockImplementation(
      (_event: string, handler: typeof progressHandler) => {
        progressHandler = handler;
        return Promise.resolve(() => undefined);
      }
    );
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "kb_export_backups") {
        progressHandler?.({
          payload: {
            operation: "export",
            current: 1,
            total: 2,
            failed: 0,
            libraryId: "a",
          },
        });
        return Promise.resolve({
          exportedAt: "now",
          targetDirectory: "C:/backups",
          outputPath: "C:/backups/multiple_aio-kb-v1.zip",
          succeeded: [],
          failed: [],
          cancelled: true,
        });
      }
      return Promise.resolve(undefined);
    });
    const store = useKnowledgeBaseStore();
    store.bases = [
      { id: "a", name: "A" } as any,
      { id: "b", name: "B" } as any,
    ];
    const backup = useKnowledgeBackup();

    const exporting = backup.exportMany(["a", "b"]);
    backup.requestCancel();
    await exporting;

    expect(mocks.invoke).toHaveBeenCalledWith("kb_cancel_backup_operation");
    expect(backup.items.value.every((item) => item.status === "skipped")).toBe(
      true
    );
  });

  it("exports all libraries through the backend persisted-data mode", async () => {
    mocks.open.mockResolvedValue("C:/backups");
    mocks.invoke.mockResolvedValue({
      exportedAt: "now",
      targetDirectory: "C:/backups",
      outputPath: "C:/backups/all_aio-kb-v1.zip",
      succeeded: [
        {
          libraryId: "a",
          libraryName: "A",
          outputPath: "C:/backups/all_aio-kb-v1.zip",
          entryCount: 1,
          assetCount: 0,
          warnings: [],
        },
      ],
      failed: [],
      cancelled: false,
    });
    const store = useKnowledgeBaseStore();
    store.bases = [
      { id: "a", name: "A" } as any,
      { id: "b", name: "B" } as any,
    ];
    const backup = useKnowledgeBackup();

    await backup.exportAll();

    expect(mocks.invoke).toHaveBeenCalledWith("kb_export_backups", {
      kbIds: [],
      targetDirectory: "C:/backups",
    });
    expect(backup.items.value).toHaveLength(1);
  });
});
