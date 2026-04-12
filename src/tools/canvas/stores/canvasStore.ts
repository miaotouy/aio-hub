import { defineStore } from "pinia";
import { ref, reactive, computed } from "vue";
import type {
  CanvasMetadata,
  CanvasListItem,
  CanvasFileNode,
  DiffOperation,
} from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useCanvasStorage } from "../composables/useCanvasStorage";
import { GitInternalService } from "../services/GitInternalService";
import { CANVAS_TEMPLATES } from "../templates";
import { nanoid } from "nanoid";

const logger = createModuleLogger("Canvas/Store");
const errorHandler = createModuleErrorHandler("Canvas/Store");

export const useCanvasStore = defineStore("canvas", () => {
  const storage = useCanvasStorage();

  // --- 状态 ---

  // 所有画布列表
  const canvasList = ref<CanvasListItem[]>([]);
  // 当前激活的画布 ID
  const activeCanvasId = ref<string | null>(null);
  // 影子文件内存缓存: canvasId -> { filepath -> content }
  const pendingUpdates = reactive<Record<string, Record<string, string>>>({});
  // 撤销栈: canvasId -> DiffOperation[]
  const undoStacks = reactive<Record<string, DiffOperation[]>>({});
  // 是否正在加载
  const isLoading = ref(false);

  // --- 计算属性 ---

  // 当前激活的画布对象
  const activeCanvas = computed(() =>
    canvasList.value.find((c) => c.metadata.id === activeCanvasId.value),
  );

  // 当前激活画布的影子文件
  const activePendingUpdates = computed(() =>
    activeCanvasId.value ? (pendingUpdates[activeCanvasId.value] ?? {}) : {},
  );

  // 当前激活画布是否有未提交的更改
  const hasPendingChanges = computed(
    () => Object.keys(activePendingUpdates.value).length > 0,
  );

  // --- Actions ---

  /**
   * 加载所有画布列表
   */
  async function loadCanvasList() {
    isLoading.value = true;
    try {
      const metadatas = await storage.listAllCanvases();
      canvasList.value = metadatas.map((metadata) => ({
        metadata,
        status: metadata.id === activeCanvasId.value ? "open" : "idle",
        pendingFileCount: Object.keys(pendingUpdates[metadata.id] ?? {}).length,
      }));
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 创建新画布
   */
  async function createCanvas(title: string, templateId?: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const id = nanoid();
        const now = Date.now();
        const template = CANVAS_TEMPLATES.find((t) => t.id === templateId) || CANVAS_TEMPLATES[0];

        const metadata: CanvasMetadata = {
          id,
          name: title,
          createdAt: now,
          updatedAt: now,
          basePath: id,
          entryFile: template.entryFile,
          template: templateId,
          fileCount: Object.keys(template.files).length,
        };

        // 1. 确保目录存在
        await storage.ensureCanvasDir(id);

        // 2. 写入初始文件
        for (const [path, content] of Object.entries(template.files)) {
          await storage.writePhysicalFile(id, path, content);
        }

        // 3. 初始化 Git
        const basePath = await storage.getCanvasBasePath(id);
        const gitService = new GitInternalService(basePath);
        await gitService.init();
        await gitService.add(Object.keys(template.files));
        await gitService.commit("Initial commit from template");

        // 4. 写入元数据
        await storage.writeCanvasMetadata(id, metadata);

        // 5. 更新列表并打开
        await loadCanvasList();
        await openCanvas(id);

        return metadata;
      },
      { userMessage: "创建画布失败" },
    );
  }

  /**
   * 打开画布
   */
  async function openCanvas(canvasId: string) {
    activeCanvasId.value = canvasId;
    // 更新列表中的状态
    canvasList.value.forEach((item) => {
      if (item.metadata.id === canvasId) {
        item.status = "open";
      } else if (item.status === "open") {
        item.status = "idle";
      }
    });
    logger.info("画布已打开", { canvasId });
  }

  /**
   * 删除画布
   */
  async function deleteCanvas(canvasId: string) {
    return await errorHandler.wrapAsync(
      async () => {
        await storage.deleteCanvas(canvasId);
        if (activeCanvasId.value === canvasId) {
          activeCanvasId.value = null;
        }
        delete pendingUpdates[canvasId];
        delete undoStacks[canvasId];
        await loadCanvasList();
      },
      { userMessage: "删除画布失败" },
    );
  }

  /**
   * 异步读取文件内容（优先从影子文件读取）
   */
  async function readCanvasFileAsync(
    canvasId: string,
    filepath: string,
  ): Promise<string | null> {
    // 1. 优先从影子文件读
    const pending = pendingUpdates[canvasId]?.[filepath];
    if (pending !== undefined) return pending;

    // 2. 否则从物理文件读
    return await storage.readPhysicalFile(canvasId, filepath);
  }

  /**
   * 写入文件到内存缓存（影子文件）
   */
  function writeFile(canvasId: string, filepath: string, content: string) {
    if (!pendingUpdates[canvasId]) {
      pendingUpdates[canvasId] = {};
    }
    pendingUpdates[canvasId][filepath] = content;

    // 更新列表中的待处理文件数
    const item = canvasList.value.find((c) => c.metadata.id === canvasId);
    if (item) {
      item.pendingFileCount = Object.keys(pendingUpdates[canvasId]).length;
      if (item.status === "idle") item.status = "pending";
    }
  }

  /**
   * 解析并应用 Search/Replace Diff 到影子文件
   */
  async function applyDiff(canvasId: string, filepath: string, diff: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const originalContent = (await readCanvasFileAsync(canvasId, filepath)) || "";
        const newContent = applySearchReplaceDiff(originalContent, diff);

        if (newContent === originalContent) {
          logger.warn("Diff 应用后内容无变化", { filepath });
          return;
        }

        // 保存到撤销栈
        if (!undoStacks[canvasId]) undoStacks[canvasId] = [];
        undoStacks[canvasId].push({
          id: nanoid(),
          timestamp: Date.now(),
          filePath: filepath,
          previousContent: originalContent,
          newContent: newContent,
          description: `Update ${filepath}`,
        });

        // 写入影子文件
        writeFile(canvasId, filepath, newContent);
        logger.info("Diff 已应用到影子文件", { filepath });
      },
      { userMessage: "应用更改失败" },
    );
  }

  /**
   * 撤销最后一次 Diff
   */
  function undoDiff(canvasId: string) {
    const stack = undoStacks[canvasId];
    if (!stack || stack.length === 0) return;

    const lastOp = stack.pop()!;
    writeFile(canvasId, lastOp.filePath, lastOp.previousContent);
    logger.info("已撤销更改", { filepath: lastOp.filePath });
  }

  /**
   * 提交更改到物理磁盘（并创建 Git 提交）
   */
  async function commitChanges(canvasId: string, message?: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const updates = pendingUpdates[canvasId];
        if (!updates || Object.keys(updates).length === 0) return;

        logger.info("正在提交画布更改", {
          canvasId,
          fileCount: Object.keys(updates).length,
        });

        // 1. 写入物理文件
        const filesToCommit: string[] = [];
        for (const [filepath, content] of Object.entries(updates)) {
          await storage.writePhysicalFile(canvasId, filepath, content);
          filesToCommit.push(filepath);
        }

        // 2. 执行 Git 提交
        const basePath = await storage.getCanvasBasePath(canvasId);
        const gitService = new GitInternalService(basePath);
        await gitService.add(filesToCommit);
        await gitService.commit(message || `Update ${filesToCommit.length} files`);

        // 3. 更新元数据（updatedAt）
        const metadata = await storage.readCanvasMetadata(canvasId);
        if (metadata) {
          metadata.updatedAt = Date.now();
          await storage.writeCanvasMetadata(canvasId, metadata);
        }

        // 4. 清空缓存
        delete pendingUpdates[canvasId];
        delete undoStacks[canvasId];

        // 5. 刷新列表
        await loadCanvasList();
      },
      { userMessage: "保存更改失败" },
    );
  }

  /**
   * 丢弃所有未提交的更改
   */
  function discardChanges(canvasId: string) {
    logger.info("丢弃未提交的更改", { canvasId });
    delete pendingUpdates[canvasId];
    delete undoStacks[canvasId];

    const item = canvasList.value.find((c) => c.metadata.id === canvasId);
    if (item) {
      item.pendingFileCount = 0;
      if (item.status === "pending") item.status = "open";
    }
  }

  /**
   * 获取合并了影子文件的文件树
   */
  async function getFileTree(canvasId: string): Promise<CanvasFileNode[]> {
    const physicalTree = await storage.getCanvasFileTree(canvasId);
    const updates = pendingUpdates[canvasId] || {};

    // 递归标记修改状态
    const mergeUpdates = (nodes: CanvasFileNode[]): CanvasFileNode[] => {
      return nodes.map((node) => {
        const hasPending = updates[node.path] !== undefined;
        return {
          ...node,
          status: hasPending ? "modified" : node.status,
          children: node.children ? mergeUpdates(node.children) : undefined,
        };
      });
    };

    let mergedTree = mergeUpdates(physicalTree);

    // 处理影子文件中新增但物理磁盘尚不存在的文件（New 状态）
    const pendingPaths = Object.keys(updates);
    
    for (const fullPath of pendingPaths) {
      const parts = fullPath.split("/");
      let currentLevel = mergedTree;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        let node = currentLevel.find((n) => n.path === currentPath);

        if (!node) {
          // 创建新节点
          node = {
            name: part,
            path: currentPath,
            isDirectory: !isLast,
            status: isLast ? "new" : "clean",
            children: isLast ? undefined : [],
          };
          currentLevel.push(node);
          // 排序：目录在前，文件名在后，按名称排序
          currentLevel.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        } else if (isLast && node.status === "clean") {
          // 如果物理树中已存在，mergeUpdates 已经处理过 status 了，这里确保万一
          node.status = "modified";
        }

        if (node.isDirectory) {
          if (!node.children) node.children = [];
          currentLevel = node.children;
        }
      }
    }

    return mergedTree;
  }

  /**
   * 核心 Diff 应用逻辑：解析 Search/Replace 块
   * 增强版：支持缩进容错、行尾空格容错、多块累积
   */
  function applySearchReplaceDiff(originalContent: string, diff: string): string {
    const SEARCH_MARKER = "<<<<<<< SEARCH";
    const DIVIDER_MARKER = "=======";
    const REPLACE_MARKER = ">>>>>>> REPLACE";

    let result = originalContent;
    const lines = diff.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line === SEARCH_MARKER) {
        let searchContentLines: string[] = [];
        let replaceContentLines: string[] = [];
        i++;

        // 读取 SEARCH 部分 (保留原始行，不 trim)
        while (i < lines.length && lines[i].trim() !== DIVIDER_MARKER) {
          searchContentLines.push(lines[i]);
          i++;
        }
        i++; // 跳过 =======

        // 读取 REPLACE 部分 (保留原始行)
        while (i < lines.length && lines[i].trim() !== REPLACE_MARKER) {
          replaceContentLines.push(lines[i]);
          i++;
        }

        const searchStr = searchContentLines.join("\n");
        const replaceStr = replaceContentLines.join("\n");

        if (searchStr === "") {
          // 如果 SEARCH 为空，追加到末尾
          result += (result.endsWith("\n") ? "" : "\n") + replaceStr;
        } else {
          // 1. 尝试精确匹配
          if (result.includes(searchStr)) {
            result = result.replace(searchStr, replaceStr);
          } else {
            // 2. 模糊匹配尝试
            const resultLines = result.split(/\r?\n/);
            let matchedIndex = -1;

            // 策略 A: 忽略行尾空格匹配
            const searchLinesNoTrailing = searchContentLines.map(l => l.trimEnd());
            for (let j = 0; j <= resultLines.length - searchLinesNoTrailing.length; j++) {
              let match = true;
              for (let k = 0; k < searchLinesNoTrailing.length; k++) {
                if (resultLines[j + k].trimEnd() !== searchLinesNoTrailing[k]) {
                  match = false;
                  break;
                }
              }
              if (match) {
                matchedIndex = j;
                break;
              }
            }

            // 策略 B: 忽略前导空格匹配 (但替换时尝试保持原缩进)
            if (matchedIndex === -1) {
              const searchLinesTrimmed = searchContentLines.map(l => l.trim());
              for (let j = 0; j <= resultLines.length - searchLinesTrimmed.length; j++) {
                let match = true;
                for (let k = 0; k < searchLinesTrimmed.length; k++) {
                  if (resultLines[j + k].trim() !== searchLinesTrimmed[k]) {
                    match = false;
                    break;
                  }
                }
                if (match) {
                  matchedIndex = j;
                  break;
                }
              }
            }

            if (matchedIndex !== -1) {
              // 执行替换
              const before = resultLines.slice(0, matchedIndex);
              const after = resultLines.slice(matchedIndex + searchContentLines.length);
              
              // 简单的缩进修复：取匹配到的第一行的前导空格，应用到 replaceStr 的每一行
              const originalIndentation = resultLines[matchedIndex].match(/^\s*/)?.[0] || "";
              const searchFirstLineIndentation = searchContentLines[0].match(/^\s*/)?.[0] || "";
              
              const fixedReplaceLines = replaceContentLines.map(line => {
                // 如果 replace 行的缩进与 search 第一行一致，则替换为原文件缩进
                if (line.startsWith(searchFirstLineIndentation)) {
                  return originalIndentation + line.substring(searchFirstLineIndentation.length);
                }
                return line;
              });

              result = [...before, ...fixedReplaceLines, ...after].join("\n");
            } else {
              const context = searchContentLines.slice(0, 3).join("\n");
              logger.warn("Diff 匹配失败", { searchStr: context });
              throw new Error(`无法匹配代码块。未找到以下内容（前几行）：\n${context}\n请确保 SEARCH 部分与文件内容逻辑一致。`);
            }
          }
        }
      }
      i++;
    }

    return result;
  }

  return {
    canvasList,
    activeCanvasId,
    pendingUpdates,
    isLoading,
    activeCanvas,
    activePendingUpdates,
    hasPendingChanges,
    loadCanvasList,
    createCanvas,
    deleteCanvas,
    openCanvas,
    readCanvasFileAsync,
    writeFile,
    applyDiff,
    commitChanges,
    discardChanges,
    undoDiff,
    getFileTree,
  };
});