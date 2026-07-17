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

import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessageBox } from "element-plus";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { kbStorage } from "../utils/kbStorage";
import type { KnowledgeBaseMeta, KnowledgeBaseIndex } from "../types";
import type {
  BackupBatchExportResult,
  BackupExportResult,
  BackupImportReport,
  BackupInspectItem,
  BackupInspectResult,
  BackupOperationItem,
  BackupProgressEvent,
} from "../types/backup";

const errorHandler = createModuleErrorHandler("knowledge-base/backup");

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function useKnowledgeBackup() {
  const store = useKnowledgeBaseStore();
  const dialogVisible = ref(false);
  const running = ref(false);
  const operation = ref<"import" | "export">("export");
  const current = ref(0);
  const total = ref(0);
  const failed = ref(0);
  const currentName = ref("");
  const items = ref<BackupOperationItem[]>([]);
  const cancelRequested = ref(false);

  const progress = computed(() =>
    total.value > 0 ? Math.round((current.value / total.value) * 100) : 0
  );

  function begin(nextOperation: "import" | "export", count: number) {
    operation.value = nextOperation;
    current.value = 0;
    total.value = count;
    failed.value = 0;
    currentName.value = "";
    items.value = [];
    cancelRequested.value = false;
    running.value = true;
    dialogVisible.value = true;
  }

  function requestCancel() {
    cancelRequested.value = true;
    if (operation.value === "export") {
      void invoke("kb_cancel_backup_operation");
    }
  }

  async function selectTargetDirectory(): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择知识库备份目录",
    });
    return typeof selected === "string" ? selected : null;
  }

  async function exportSingle(kbId: string) {
    const directory = await selectTargetDirectory();
    if (!directory) return;
    const base = store.bases.find((item) => item.id === kbId);
    begin("export", 1);
    currentName.value = base?.name || kbId;
    try {
      const result = await invoke<BackupExportResult>("kb_export_backup", {
        kbId,
        targetDirectory: directory,
      });
      current.value = 1;
      items.value = [
        {
          key: result.libraryId,
          name: result.libraryName,
          status: "success",
          detail: `${result.entryCount} 个条目，${result.assetCount} 个资产`,
          warnings: result.warnings,
        },
      ];
      customMessage.success("知识库备份导出完成");
    } catch (error) {
      failed.value = 1;
      current.value = 1;
      items.value = [
        {
          key: kbId,
          name: base?.name || kbId,
          status: "failed",
          detail: String(error),
          warnings: [],
        },
      ];
      errorHandler.error(error, "导出知识库备份失败");
    } finally {
      running.value = false;
    }
  }

  async function exportMany(kbIds: string[], persistedAll = false) {
    if (kbIds.length === 0) {
      customMessage.warning("没有可导出的知识库");
      return;
    }
    const directory = await selectTargetDirectory();
    if (!directory) return;
    begin("export", kbIds.length);
    const nameById = new Map(store.bases.map((base) => [base.id, base.name]));
    const unlisten = await listen<BackupProgressEvent>(
      "kb-backup-progress",
      ({ payload }) => {
        if (payload.operation !== "export") return;
        current.value = payload.current;
        total.value = payload.total;
        failed.value = payload.failed;
        currentName.value =
          nameById.get(payload.libraryId) || payload.libraryId;
      }
    );
    try {
      const result = await invoke<BackupBatchExportResult>(
        "kb_export_backups",
        { kbIds: persistedAll ? [] : kbIds, targetDirectory: directory }
      );
      current.value = total.value;
      failed.value = result.failed.length;
      items.value = [
        ...result.succeeded.map((item) => ({
          key: item.libraryId,
          name: item.libraryName,
          status: "success" as const,
          detail: `${item.entryCount} 个条目，${item.assetCount} 个资产`,
          warnings: item.warnings,
        })),
        ...result.failed.map((item) => ({
          key: item.libraryId,
          name: nameById.get(item.libraryId) || item.libraryId,
          status: "failed" as const,
          detail: item.error,
          warnings: [],
        })),
      ];
      if (result.cancelled) {
        const processedIds = new Set([
          ...result.succeeded.map((item) => item.libraryId),
          ...result.failed.map((item) => item.libraryId),
        ]);
        items.value.push(
          ...kbIds
            .filter((id) => !processedIds.has(id))
            .map((id) => ({
              key: id,
              name: nameById.get(id) || id,
              status: "skipped" as const,
              detail: "用户停止了后续导出",
              warnings: [],
            }))
        );
      }
      const message = result.cancelled
        ? `导出已停止：完成 ${result.succeeded.length}，失败 ${result.failed.length}`
        : result.failed.length
          ? `已导出 ${result.succeeded.length} 个知识库，${result.failed.length} 个失败`
          : `已导出 ${result.succeeded.length} 个知识库`;
      if (result.failed.length || result.cancelled) {
        customMessage.warning(message);
      } else {
        customMessage.success(message);
      }
    } catch (error) {
      errorHandler.error(error, "批量导出知识库备份失败");
    } finally {
      unlisten();
      running.value = false;
    }
  }

  async function exportAll() {
    return exportMany(
      store.bases.map((base) => base.id),
      true
    );
  }

  async function chooseConflictStrategy(
    inspect: BackupInspectResult
  ): Promise<"copy" | "replace" | "cancel"> {
    if (!inspect.hasConflict) return "copy";
    const targetName = inspect.conflictingLibraryName || inspect.libraryName;
    const targetEntryCount = inspect.conflictingEntryCount;
    const targetEntrySummary =
      targetEntryCount == null ? "条目数未知" : `${targetEntryCount} 个条目`;
    const targetReplacementScope =
      targetEntryCount == null
        ? "现有目标内容"
        : `现有 ${targetEntryCount} 个目标条目`;
    try {
      await ElMessageBox.confirm(
        `目标环境已存在同 ID 知识库「${targetName}」\nID：${inspect.libraryId}\n目标库：${targetEntrySummary}\n备份「${inspect.libraryName}」：${inspect.entryCount} 个条目`,
        "备份导入冲突",
        {
          type: "warning",
          confirmButtonText: "替换现有库",
          cancelButtonText: "导入为副本",
          distinguishCancelAndClose: true,
          lockScroll: false,
        }
      );
    } catch (action) {
      return action === "cancel" ? "copy" : "cancel";
    }
    try {
      await ElMessageBox.confirm(
        `即将替换知识库「${targetName}」（${inspect.libraryId}），${targetReplacementScope}将由备份「${inspect.libraryName}」的 ${inspect.entryCount} 个条目取代。`,
        "确认替换知识库",
        {
          type: "error",
          confirmButtonText: "确认替换",
          cancelButtonText: "取消",
          confirmButtonClass: "el-button--danger",
          lockScroll: false,
        }
      );
      return "replace";
    } catch {
      return "cancel";
    }
  }

  async function syncWorkspaceFromBackend() {
    const metas = await invoke<KnowledgeBaseMeta[]>("kb_list_bases");
    const workspace = store.workspace || (await kbStorage.loadWorkspace());
    const previousById = new Map(
      workspace.bases.map((base) => [base.id, base])
    );
    workspace.bases = metas.map((meta): KnowledgeBaseIndex => {
      const previous = previousById.get(meta.id);
      const rawTags = (meta.tags || []) as unknown[];
      return {
        ...previous,
        id: meta.id,
        name: meta.name,
        description: meta.description,
        entryCount: meta.entries.length,
        updatedAt: meta.updatedAt,
        totalTokens: 0,
        isIndexed: false,
        path: `bases/${meta.id}`,
        tags: rawTags.map((tag) =>
          typeof tag === "string"
            ? tag
            : String((tag as { name?: unknown }).name || "")
        ),
        icon: meta.icon,
      };
    });
    if (
      workspace.lastActiveBaseId &&
      !workspace.bases.some((base) => base.id === workspace.lastActiveBaseId)
    ) {
      workspace.lastActiveBaseId = undefined;
    }
    await kbStorage.saveWorkspace(workspace);
    await store.loadBases();
    if (store.activeBaseId) {
      const active = await kbStorage.loadBaseMeta(store.activeBaseId);
      if (active) {
        store.activeBaseMeta = active;
        store.loadedEntryIds = active.entries.map((entry) => entry.id);
        store.entriesCache.clear();
        store.vectorizedIds.clear();
      } else {
        store.activeBaseId = null;
        store.activeBaseMeta = null;
        store.loadedEntryIds = [];
        store.entriesCache.clear();
      }
    }
  }

  async function importBackups() {
    let selected: string | string[] | null;
    try {
      selected = await open({
        directory: false,
        multiple: true,
        title: "选择知识库备份",
        filters: [
          { name: "AIO 知识库备份", extensions: ["aio-kb"] },
          { name: "AIO 多库备份容器", extensions: ["zip"] },
          { name: "兼容的旧版导出", extensions: ["json", "yaml", "yml"] },
        ],
      });
    } catch (error) {
      errorHandler.error(error, "选择知识库备份失败");
      return;
    }
    const paths = Array.isArray(selected)
      ? selected
      : typeof selected === "string"
        ? [selected]
        : [];
    if (paths.length === 0) return;

    begin("import", paths.length);
    for (const path of paths) {
      if (cancelRequested.value) {
        items.value.push({
          key: path,
          name: fileName(path),
          status: "skipped",
          detail: "用户停止了后续导入",
          warnings: [],
        });
        current.value += 1;
        continue;
      }
      currentName.value = fileName(path);
      try {
        const inspectionItems = await invoke<BackupInspectItem[]>(
          "kb_inspect_backups",
          { sourcePath: path }
        );
        total.value += Math.max(0, inspectionItems.length - 1);
        for (const inspectionItem of inspectionItems) {
          const inspect = inspectionItem.inspect;
          if (!inspect || inspectionItem.error) {
            failed.value += 1;
            items.value.push({
              key: `${path}#${inspectionItem.sourceEntry || ""}`,
              name: inspectionItem.libraryName,
              status: "failed",
              detail: inspectionItem.error || "无法检查此知识库备份",
              warnings: [],
            });
            current.value += 1;
            continue;
          }
          if (cancelRequested.value) {
            items.value.push({
              key: `${path}#${inspect.sourceEntry || ""}`,
              name: inspect.libraryName,
              status: "skipped",
              detail: "用户停止了后续导入",
              warnings: [],
            });
            current.value += 1;
            continue;
          }
          currentName.value = inspect.libraryName;
          try {
            const strategy = await chooseConflictStrategy(inspect);
            if (strategy === "cancel") {
              items.value.push({
                key: `${path}#${inspect.sourceEntry || ""}`,
                name: inspect.libraryName,
                status: "skipped",
                detail: "已取消此备份的导入",
                warnings: inspect.warnings,
              });
            } else {
              const report = await invoke<BackupImportReport>(
                "kb_import_backup",
                {
                  sourcePath: path,
                  sourceEntry: inspect.sourceEntry || null,
                  options: { conflictStrategy: strategy },
                }
              );
              items.value.push({
                key: `${path}#${inspect.sourceEntry || ""}`,
                name: report.libraryName,
                status: report.status,
                detail: report.legacyContentOnly
                  ? `${report.entryCount} 个条目，旧版内容恢复`
                  : `${report.entryCount} 个条目，${report.restoredAssetCount} 个资产`,
                warnings: report.warnings,
              });
            }
          } catch (error) {
            failed.value += 1;
            items.value.push({
              key: `${path}#${inspect.sourceEntry || ""}`,
              name: inspect.libraryName,
              status: "failed",
              detail: String(error),
              warnings: inspect.warnings,
            });
          } finally {
            current.value += 1;
          }
        }
      } catch (error) {
        failed.value += 1;
        items.value.push({
          key: path,
          name: fileName(path),
          status: "failed",
          detail: String(error),
          warnings: [],
        });
        current.value += 1;
      }
    }

    try {
      if (items.value.some((item) => item.status === "success")) {
        await syncWorkspaceFromBackend();
      }
      const succeeded = items.value.filter(
        (item) => item.status === "success"
      ).length;
      const skipped = items.value.filter(
        (item) => item.status === "skipped"
      ).length;
      if (failed.value > 0) {
        customMessage.warning(
          `导入完成：成功 ${succeeded}，跳过 ${skipped}，失败 ${failed.value}`
        );
      } else {
        customMessage.success(`导入完成：成功 ${succeeded}，跳过 ${skipped}`);
      }
    } catch (error) {
      errorHandler.error(error, "知识库已导入，但刷新工作区失败");
    } finally {
      running.value = false;
    }
  }

  return {
    dialogVisible,
    running,
    operation,
    current,
    total,
    failed,
    currentName,
    items,
    progress,
    cancelRequested,
    requestCancel,
    exportSingle,
    exportMany,
    exportAll,
    importBackups,
  };
}
