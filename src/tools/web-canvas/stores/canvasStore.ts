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

import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";
import { useLocalStorage } from "@vueuse/core";
import type { CanvasMetadata, CanvasListItem, CanvasFileNode } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../config";
import type { CanvasConfig } from "../types/config";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { Command } from "@tauri-apps/plugin-shell";
import { useCanvasStorage } from "../composables/useCanvasStorage";
import { GitInternalService } from "../services/GitInternalService";
import { canvasIndexManager } from "../services/CanvasIndexManager";
import { useCanvasErrors } from "../composables/useCanvasErrors";
import { CanvasService } from "../services/CanvasService";
import { applySearchReplaceDiff } from "../utils/diff";
import { formatDateTime } from "@/utils/time";
import { customMessage } from "@/utils/customMessage";

const logger = createModuleLogger("Canvas/Store");
const errorHandler = createModuleErrorHandler("Canvas/Store");

// 文件变更事件 system
type FileChangeHandler = (canvasId: string, filepath: string) => void;
type PreviewOverlayHandler = (
  canvasId: string,
  files: Record<string, string>
) => void;

export type CanvasPreviewMutation =
  | {
      type: "write";
      path: string;
      content: string;
    }
  | {
      type: "diff";
      path: string;
      search: string;
      replace: string;
      startLine?: number;
    };

interface CanvasPreviewRequest {
  canvasId: string;
  affectedFiles: string[];
  mutation?: CanvasPreviewMutation;
}

const fileChangeHandlers = new Set<FileChangeHandler>();
const previewOverlayHandlers = new Set<PreviewOverlayHandler>();

export const useCanvasStore = defineStore("canvas", () => {
  const storage = useCanvasStorage();

  // --- 状态 ---

  // 所有画布列表
  const canvasList = ref<CanvasListItem[]>([]);
  // 当前激活的画布 ID
  const activeCanvasId = ref<string | null>(null);
  // 当前正在编辑的文件路径
  const activeFile = ref<string | null>(null);
  // 未提交的文件状态，按画布隔离：canvasId -> (filepath -> status)
  const dirtyFilesByCanvas = ref<Map<string, Map<string, string>>>(new Map());
  const emptyDirtyFiles = new Map<string, string>();
  // 兼容现有界面：默认暴露当前激活画布的变更状态。
  const dirtyFiles = computed(
    () =>
      dirtyFilesByCanvas.value.get(activeCanvasId.value || "") ||
      emptyDirtyFiles
  );
  // 是否正在加载
  const isLoading = ref(false);

  // --- 配置 ---
  const config = useLocalStorage<CanvasConfig>("aio-canvas-config", {
    ...DEFAULT_CANVAS_CONFIG,
  });

  /**
   * 重置配置
   */
  function resetConfig() {
    config.value = { ...DEFAULT_CANVAS_CONFIG };
  }

  // --- 子模块 ---
  const errorModule = useCanvasErrors(config);
  const canvasService = new CanvasService(storage);

  // 审批系统轻量级映射
  const previewRequests = reactive<Record<string, CanvasPreviewRequest>>({});
  // 审批阶段的内存预览覆盖层。它只用于渲染，不会写入画布目录。
  const previewOverlays = reactive<Record<string, Record<string, string>>>({});

  // --- 计算属性 ---

  // 当前激活的画布对象
  const activeCanvas = computed(() =>
    canvasList.value.find((c) => c.metadata.id === activeCanvasId.value)
  );

  // 当前激活画布是否有未提交的更改
  const hasPendingChanges = computed(() => dirtyFiles.value.size > 0);

  function getDirtyFiles(canvasId: string): Map<string, string> {
    return dirtyFilesByCanvas.value.get(canvasId) || emptyDirtyFiles;
  }

  // 外部编辑器（例如 VS Code）修改项目文件时的监听状态。
  let watchedCanvasId: string | null = null;
  let stopCanvasFileWatch: (() => void) | null = null;
  let externalChangeTimer: ReturnType<typeof setTimeout> | null = null;

  function isInternalCanvasPath(path: string): boolean {
    const normalized = path.replace(/\\/g, "/");
    return (
      normalized.includes("/.git/") || normalized.endsWith("/.canvas.json")
    );
  }

  function stopWatchingCanvasFiles() {
    stopCanvasFileWatch?.();
    stopCanvasFileWatch = null;
    watchedCanvasId = null;
    if (externalChangeTimer) {
      clearTimeout(externalChangeTimer);
      externalChangeTimer = null;
    }
  }

  async function startWatchingCanvasFiles(canvasId: string) {
    if (watchedCanvasId === canvasId && stopCanvasFileWatch) return;

    stopWatchingCanvasFiles();
    try {
      stopCanvasFileWatch = await storage.watchCanvasFiles(
        canvasId,
        (paths) => {
          if (!paths.some((path) => !isInternalCanvasPath(path))) return;

          if (externalChangeTimer) clearTimeout(externalChangeTimer);
          externalChangeTimer = setTimeout(async () => {
            externalChangeTimer = null;
            // watcher 同时会收到本应用的写入事件；重复刷新是幂等的，
            // 但统一从磁盘刷新可确保外部编辑器修改也被正确同步。
            errorModule.markErrorsAsStale(canvasId);
            await refreshGitStatus(canvasId);
            emitFileChanged(canvasId, "*");
          }, 300);
        }
      );
      watchedCanvasId = canvasId;
    } catch (error) {
      logger.warn("启动画布文件监听失败", { canvasId, error });
    }
  }

  // --- Actions ---

  /**
   * 注册文件变更监听器
   */
  function onFileChanged(handler: FileChangeHandler) {
    fileChangeHandlers.add(handler);
    return () => fileChangeHandlers.delete(handler);
  }

  /**
   * 发送文件变更事件
   */
  function emitFileChanged(canvasId: string, filepath: string) {
    fileChangeHandlers.forEach((handler) => handler(canvasId, filepath));
  }

  /**
   * 刷新 Git 状态
   */
  async function refreshGitStatus(canvasId: string) {
    const basePath = await storage.getCanvasBasePath(canvasId);
    const gitService = new GitInternalService(basePath);
    const matrix = await gitService.statusMatrix();

    const dirty = new Map<string, string>();
    if (matrix) {
      for (const [filepath, head, workdir] of matrix) {
        if (head !== workdir) {
          if (head === 0 && workdir === 2) dirty.set(filepath, "new");
          else if (head === 1 && workdir === 2) dirty.set(filepath, "modified");
          else if (head === 1 && workdir === 0) dirty.set(filepath, "deleted");
          else dirty.set(filepath, "modified");
        }
      }
    }
    const nextDirtyFilesByCanvas = new Map(dirtyFilesByCanvas.value);
    nextDirtyFilesByCanvas.set(canvasId, dirty);
    dirtyFilesByCanvas.value = nextDirtyFilesByCanvas;

    // 更新列表中的状态
    const item = canvasList.value.find((c) => c.metadata.id === canvasId);
    if (item) {
      item.dirtyFileCount = dirty.size;
      if (dirty.size > 0) {
        if (item.status === "idle") item.status = "dirty";
      } else {
        if (item.status === "dirty") item.status = "open";
      }

      // 顺便更新文件总数（如果发生了文件增删）
      const tree = await storage.getCanvasFileTree(canvasId);
      const countFiles = (nodes: CanvasFileNode[]): number => {
        let count = 0;
        for (const node of nodes) {
          if (!node.isDirectory) count++;
          if (node.children) count += countFiles(node.children);
        }
        return count;
      };
      const totalCount = countFiles(tree);
      if (item.metadata.fileCount !== totalCount) {
        item.metadata.fileCount = totalCount;
        // 异步更新磁盘元数据
        storage.readCanvasMetadata(canvasId).then((meta) => {
          if (meta) {
            meta.fileCount = totalCount;
            storage.writeCanvasMetadata(canvasId, meta);
            canvasIndexManager.upsertProject({
              ...meta,
              relPath: `projects/${canvasId}`,
            });
          }
        });
      }
    }
  }

  /**
   * 加载所有画布列表
   */
  async function loadCanvasList() {
    isLoading.value = true;
    try {
      // 1. 从索引加载
      const index = await canvasIndexManager.loadIndex();

      // 2. 初步映射
      canvasList.value = index.projects.map((p) => ({
        metadata: {
          id: p.id,
          name: p.name,
          description: p.description,
          updatedAt: p.updatedAt,
          createdAt: p.createdAt || p.updatedAt,
          basePath: p.id,
          fileCount: p.fileCount || 0,
          previewUrl: p.previewUrl,
          entryFile: "index.html",
        } as CanvasMetadata,
        status: p.id === activeCanvasId.value ? "open" : "idle",
        dirtyFileCount: 0,
        health: "healthy",
      }));

      // 3. 异步启动健康检查
      performHealthCheck();

      // 如果有激活的画布，刷新其状态
      if (activeCanvasId.value) {
        await refreshGitStatus(activeCanvasId.value);
      }
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 执行健康检查
   */
  async function performHealthCheck() {
    canvasList.value = await canvasService.performHealthCheck(canvasList.value);
  }

  /**
   * 确保当前有激活的画布，如果没有则自动创建一个
   */
  async function ensureActiveCanvas(): Promise<string> {
    if (activeCanvasId.value) return activeCanvasId.value;

    const metadata = await createCanvas(
      `canvas_${formatDateTime(new Date(), "yyyyMMdd_HHmmss")}`
    );
    if (!metadata) {
      throw new Error("自动创建画布失败");
    }

    // 通过 DOM 事件通知外部
    window.dispatchEvent(
      new CustomEvent("canvas:auto-created", {
        detail: { canvasId: metadata.id },
      })
    );

    return metadata.id;
  }

  /**
   * 创建新画布
   */
  async function createCanvas(title: string, templateId?: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const metadata = await canvasService.createCanvas(title, templateId);

        // 更新列表并打开
        await loadCanvasList();
        await openCanvas(metadata.id);

        return metadata;
      },
      { userMessage: "创建画布失败" }
    );
  }

  /**
   * 打开画布
   */
  async function openCanvas(canvasId: string) {
    activeCanvasId.value = canvasId;

    // 重新读取元数据以确保信息最新
    const metadata = await storage.readCanvasMetadata(canvasId);
    if (metadata) {
      const item = canvasList.value.find((c) => c.metadata.id === canvasId);
      if (item) {
        item.metadata = metadata;
      }
    }

    await refreshGitStatus(canvasId);
    await startWatchingCanvasFiles(canvasId);

    // 更新列表中的状态
    canvasList.value.forEach((item) => {
      if (item.metadata.id === canvasId) {
        item.status = dirtyFiles.value.size > 0 ? "dirty" : "open";
      } else {
        item.status = "idle";
      }
    });
    logger.info("画布已打开", { canvasId });
  }

  /**
   * 打开并聚焦独立预览窗口
   */
  async function openPreviewWindow(canvasId: string) {
    // 1. 确保它是激活的
    if (activeCanvasId.value !== canvasId) {
      await openCanvas(canvasId);
    }

    // 2. 发送总线事件
    window.dispatchEvent(
      new CustomEvent("canvas:request-window", {
        detail: { canvasId },
      })
    );
    logger.info("已请求打开预览窗口", { canvasId });
  }

  /**
   * 删除画布
   */
  async function deleteCanvas(canvasId: string) {
    return await errorHandler.wrapAsync(
      async () => {
        // 1. 磁盘删除
        if (watchedCanvasId === canvasId) {
          stopWatchingCanvasFiles();
        }
        await storage.deleteCanvas(canvasId);

        // 2. 索引删除
        await canvasIndexManager.removeProject(canvasId);

        if (activeCanvasId.value === canvasId) {
          activeCanvasId.value = null;
          const nextDirtyFilesByCanvas = new Map(dirtyFilesByCanvas.value);
          nextDirtyFilesByCanvas.delete(canvasId);
          dirtyFilesByCanvas.value = nextDirtyFilesByCanvas;
        }
        await loadCanvasList();
      },
      { userMessage: "删除画布失败" }
    );
  }

  /**
   * 异步读取物理文件内容
   */
  async function readCanvasFileAsync(
    canvasId: string,
    filepath: string
  ): Promise<string | null> {
    return await storage.readPhysicalFile(canvasId, filepath);
  }

  /**
   * 直接物理写入
   */
  async function writeFilePhysical(
    canvasId: string,
    filepath: string,
    content: string
  ) {
    await storage.writePhysicalFile(canvasId, filepath, content);
    emitFileChanged(canvasId, filepath);

    // 标记错误为过期
    errorModule.markErrorsAsStale(canvasId);

    await refreshGitStatus(canvasId);
  }

  /**
   * 应用 Search/Replace Diff 到物理文件
   */
  async function applyDiff(
    canvasId: string,
    filepath: string,
    search: string,
    replace: string,
    startLine?: number
  ) {
    return await errorHandler.wrapAsync(
      async () => {
        const originalContent =
          (await storage.readPhysicalFile(canvasId, filepath)) || "";
        const result = applySearchReplaceDiff(
          originalContent,
          search,
          replace,
          {
            startLine,
          }
        );
        const newContent = result.content;

        if (newContent === originalContent) {
          logger.warn("Diff 应用后内容无变化", { filepath });
          return result;
        }

        await storage.writePhysicalFile(canvasId, filepath, newContent);
        emitFileChanged(canvasId, filepath);

        // 标记错误为过期
        errorModule.markErrorsAsStale(canvasId);

        await refreshGitStatus(canvasId);
        logger.info("Diff 已应用到物理文件", {
          filepath,
          strategy: result.strategy,
          confidence: result.confidence,
          duplicates: result.duplicateCount,
        });

        return result;
      },
      { userMessage: "应用更改失败" }
    );
  }
  /**
   * 提交更改到物理磁盘并创建 Git 提交
   */
  async function commitChanges(canvasId: string, message?: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await storage.getCanvasBasePath(canvasId);
        const gitService = new GitInternalService(basePath);
        const matrix = await gitService.statusMatrix();

        if (!matrix) return;

        const filesToAdd = matrix
          .filter(([_, head, workdir]) => head !== workdir)
          .map(([filepath]) => filepath);

        if (filesToAdd.length === 0) return;

        logger.info("正在提交画布更改", {
          canvasId,
          fileCount: filesToAdd.length,
        });

        // 1. 执行 Git 提交
        await gitService.add(filesToAdd);
        await gitService.commit(message || `Update ${filesToAdd.length} files`);

        // 2. 更新元数据 (updatedAt)
        const now = Date.now();
        const metadata = await storage.readCanvasMetadata(canvasId);
        if (metadata) {
          metadata.updatedAt = now;
          await storage.writeCanvasMetadata(canvasId, metadata);

          // 同时更新索引
          await canvasIndexManager.upsertProject({
            id: canvasId,
            name: metadata.name,
            description: metadata.description,
            createdAt: metadata.createdAt,
            updatedAt: now,
            relPath: `projects/${canvasId}`,
            fileCount: metadata.fileCount,
            previewUrl: metadata.previewUrl,
          });
        }

        // 3. 刷新状态
        await refreshGitStatus(canvasId);
        await loadCanvasList();
      },
      { userMessage: "保存更改失败" }
    );
  }

  /**
   * 丢弃所有未提交的更改
   */
  async function discardChanges(canvasId: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await storage.getCanvasBasePath(canvasId);
        const gitService = new GitInternalService(basePath);
        await gitService.checkout([]);
        await refreshGitStatus(canvasId);
        emitFileChanged(canvasId, "*");
        logger.info("已丢弃未提交的更改", { canvasId });
      },
      { userMessage: "丢弃更改失败" }
    );
  }

  /**
   * 获取文件树
   */
  async function getFileTree(canvasId: string): Promise<CanvasFileNode[]> {
    const physicalTree = await storage.getCanvasFileTree(canvasId);
    const dirty = getDirtyFiles(canvasId);

    const markStatus = (nodes: CanvasFileNode[]): CanvasFileNode[] => {
      return nodes.map((node) => ({
        ...node,
        status: (dirty.get(node.path) as any) || "clean",
        children: node.children ? markStatus(node.children) : undefined,
      }));
    };

    return markStatus(physicalTree);
  }

  /**
   * 审批系统支持
   */
  function registerPreviewRequest(
    requestId: string,
    canvasId: string,
    files: string[],
    mutation?: CanvasPreviewMutation
  ) {
    previewRequests[requestId] = {
      canvasId,
      affectedFiles: files,
      mutation,
    };
  }

  function getPreviewRequest(requestId: string) {
    return previewRequests[requestId] || null;
  }

  function getPreviewRequestsForCanvas(canvasId: string) {
    return Object.entries(previewRequests)
      .filter(([, request]) => request.canvasId === canvasId)
      .map(([requestId, request]) => ({ requestId, ...request }));
  }

  function removePreviewRequest(requestId: string) {
    delete previewRequests[requestId];
  }

  function consumePreviewMutation(
    canvasId: string,
    mutation: CanvasPreviewMutation
  ) {
    const request = Object.entries(previewRequests).find(
      ([, candidate]) =>
        candidate.canvasId === canvasId &&
        JSON.stringify(candidate.mutation) === JSON.stringify(mutation)
    );
    if (request) {
      delete previewRequests[request[0]];
    }
  }

  function onPreviewOverlayChanged(handler: PreviewOverlayHandler) {
    previewOverlayHandlers.add(handler);
    return () => previewOverlayHandlers.delete(handler);
  }

  function setPreviewOverlay(canvasId: string, files: Record<string, string>) {
    previewOverlays[canvasId] = files;
    previewOverlayHandlers.forEach((handler) => handler(canvasId, files));
  }

  function getPreviewOverlay(canvasId: string) {
    return previewOverlays[canvasId] || {};
  }

  function getPreviewOverlayCanvasIds() {
    return Object.keys(previewOverlays);
  }

  /**
   * 修复项目
   */
  async function repairProject(
    canvasId: string,
    action: "remove_index" | "reindex" | "restore_metadata"
  ) {
    return await errorHandler.wrapAsync(
      async () => {
        await canvasService.repairProject(canvasId, action);
        await loadCanvasList();
      },
      { userMessage: "修复项目失败" }
    );
  }

  /**
   * 在 VSCode 中打开画布项目
   */
  async function openInVSCode(canvasId: string) {
    return await errorHandler.wrapAsync(
      async () => {
        if (!config.value.vscodePath) {
          customMessage.warning("请先在设置中配置 VSCode 路径");
          return;
        }

        const basePath = await storage.getCanvasBasePath(canvasId);
        logger.info("正在 VSCode 中打开项目", {
          canvasId,
          basePath,
          vscodePath: config.value.vscodePath,
        });

        // 使用 Command 启动 VSCode
        // 注意：code.cmd / code.exe 后面跟路径即可
        const command = Command.create(config.value.vscodePath, [basePath]);
        const child = await command.spawn();

        logger.info("VSCode 已启动", { pid: child.pid });
        customMessage.success("正在打开 VSCode...");
      },
      { userMessage: "打开 VSCode 失败，请检查路径配置是否正确" }
    );
  }

  return {
    canvasList,
    activeCanvasId,
    activeFile,
    dirtyFiles,
    getDirtyFiles,
    isLoading,
    activeCanvas,
    hasPendingChanges,
    onFileChanged,
    emitFileChanged,
    refreshGitStatus,
    loadCanvasList,
    ensureActiveCanvas,
    createCanvas,
    openCanvas,
    openPreviewWindow,
    deleteCanvas,
    readCanvasFileAsync,
    writeFilePhysical,
    applyDiff,
    commitChanges,
    discardChanges,
    getFileTree,
    registerPreviewRequest,
    getPreviewRequest,
    getPreviewRequestsForCanvas,
    removePreviewRequest,
    consumePreviewMutation,
    onPreviewOverlayChanged,
    setPreviewOverlay,
    getPreviewOverlay,
    getPreviewOverlayCanvasIds,
    repairProject,
    performHealthCheck,
    openInVSCode,
    // 运行时错误管理（转发子模块）
    runtimeErrors: errorModule.runtimeErrors,
    addRuntimeError: errorModule.addRuntimeError,
    clearRuntimeErrors: errorModule.clearRuntimeErrors,
    markErrorsAsStale: errorModule.markErrorsAsStale,
    clearStaleRuntimeErrors: errorModule.clearStaleRuntimeErrors,
    getActiveRuntimeErrors: errorModule.getActiveRuntimeErrors,
    getFormattedErrorContext: errorModule.getFormattedErrorContext,
    // 配置
    config,
    resetConfig,
  };
});
