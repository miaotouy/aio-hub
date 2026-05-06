import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { CanvasMetadata, CanvasFileNode } from "../types";

const logger = createModuleLogger("Canvas/Storage");
const errorHandler = createModuleErrorHandler("Canvas/Storage");

/**
 * 画布存储管理 Composable
 */
export function useCanvasStorage() {
  /**
   * 获取画布根路径
   */
  async function getCanvasBasePath(canvasId: string) {
    const dataDir = await appDataDir();
    return await join(dataDir, "canvases", "projects", canvasId);
  }

  /**
   * 获取所有画布列表的根目录 (物理存储位置)
   */
  async function getCanvasesRootDir() {
    const dataDir = await appDataDir();
    return await join(dataDir, "canvases", "projects");
  }

  /**
   * 确保画布目录存在
   */
  async function ensureCanvasDir(canvasId: string) {
    const basePath = await getCanvasBasePath(canvasId);
    if (!(await exists(basePath))) {
      await mkdir(basePath, { recursive: true });
    }
    return basePath;
  }

  /**
   * 读取物理文件
   */
  async function readPhysicalFile(canvasId: string, filepath: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await getCanvasBasePath(canvasId);
        const fullPath = await join(basePath, filepath);
        return await readTextFile(fullPath);
      },
      { userMessage: "读取文件失败" },
    );
  }

  /**
   * 写入物理文件
   */
  async function writePhysicalFile(canvasId: string, filepath: string, content: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await ensureCanvasDir(canvasId);
        const fullPath = await join(basePath, filepath);

        // 确保父目录存在
        // 处理 Windows 路径分隔符
        const normalizedPath = fullPath.replace(/\\/g, "/");
        const parentDir = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
        if (parentDir && !(await exists(parentDir))) {
          await mkdir(parentDir, { recursive: true });
        }

        await writeTextFile(fullPath, content);
        logger.debug("物理文件写入成功", { fullPath });
      },
      { userMessage: "写入文件失败" },
    );
  }

  /**
   * 删除物理文件
   */
  async function deletePhysicalFile(canvasId: string, filepath: string) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await getCanvasBasePath(canvasId);
        const fullPath = await join(basePath, filepath);
        if (await exists(fullPath)) {
          // 这里使用 invoke 调用 Rust 后端的删除，或者直接使用 fs.remove
          // 为了保持一致性，如果只是删除文件，可以使用 remove
          await invoke("delete_file_in_app_data", {
            relativePath: `canvases/projects/${canvasId}/${filepath}`,
          });
          logger.info("物理文件已删除", { fullPath });
        }
      },
      { userMessage: "删除文件失败" },
    );
  }

  /**
   * 读取单个画布的元数据
   */
  async function readCanvasMetadata(canvasId: string): Promise<CanvasMetadata | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await getCanvasBasePath(canvasId);
        const metadataPath = await join(basePath, ".canvas.json");

        if (!(await exists(metadataPath))) {
          return null;
        }

        const content = await readTextFile(metadataPath);
        return JSON.parse(content) as CanvasMetadata;
      },
      { userMessage: "读取画布元数据失败" },
    );
  }

  /**
   * 写入单个画布的元数据
   */
  async function writeCanvasMetadata(canvasId: string, metadata: CanvasMetadata) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await ensureCanvasDir(canvasId);
        const metadataPath = await join(basePath, ".canvas.json");
        await writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));
      },
      { userMessage: "写入画布元数据失败" },
    );
  }

  /**
   /**
    * 列出所有画布 (基于索引加载)
    */
  async function listAllCanvases(): Promise<CanvasMetadata[]> {
    const result = await errorHandler.wrapAsync(
      async () => {
        const { canvasIndexManager } = await import("../services/CanvasIndexManager");
        const index = await canvasIndexManager.loadIndex();
        const canvases: CanvasMetadata[] = [];

        for (const p of index.projects) {
          canvases.push({
            id: p.id,
            name: p.name,
            updatedAt: p.updatedAt,
            createdAt: p.updatedAt,
            basePath: p.id,
            fileCount: 0,
            entryFile: "index.html", // 默认入口
          });
        }

        return canvases.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      { userMessage: "获取画布列表失败" },
    );
    return result ?? [];
  }
  /**
   * 删除画布（安全回收站）
   */
  async function deleteCanvas(canvasId: string) {
    return await errorHandler.wrapAsync(
      async () => {
        // 使用 Rust 后端的安全删除指令
        await invoke("delete_directory_in_app_data", {
          relativePath: `canvases/projects/${canvasId}`,
        });
        logger.info("画布已成功删除（进入回收站）", { canvasId });
      },
      { userMessage: "删除画布失败" },
    );
  }

  /**
   * 获取文件树
   */
  async function getCanvasFileTree(canvasId: string): Promise<CanvasFileNode[]> {
    const result = await errorHandler.wrapAsync(
      async () => {
        const basePath = await getCanvasBasePath(canvasId);
        // 调用 Rust 后端的高性能目录树生成指令
        const result = await invoke<{ structure: any }>("generate_directory_tree", {
          path: basePath,
          showFiles: true,
          showHidden: false,
          maxDepth: 0,
          ignorePatterns: ["__USE_GITIGNORE__"],
        });

        // 过滤掉 .git 和 .canvas.json，并转换 snake_case 为 camelCase，同时拼接相对路径
        const filterNodes = (nodes: any[], parentPath: string = ""): CanvasFileNode[] => {
          if (!nodes) return [];
          return nodes
            .filter((node) => node.name !== ".git" && node.name !== ".canvas.json")
            .map((node) => {
              const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
              return {
                name: node.name,
                path: currentPath,
                isDirectory: node.is_dir,
                size: node.size,
                children: node.children ? filterNodes(node.children, currentPath) : undefined,
                status: "clean" as const,
              };
            });
        };

        // 从根节点的子节点开始过滤
        return filterNodes(result.structure.children);
      },
      { userMessage: "获取文件树失败" },
    );
    return result ?? [];
  }
  return {
    getCanvasBasePath,
    getCanvasesRootDir,
    ensureCanvasDir,
    readPhysicalFile,
    writePhysicalFile,
    readCanvasMetadata,
    writeCanvasMetadata,
    listAllCanvases,
    deleteCanvas,
    getCanvasFileTree,
    deletePhysicalFile,
  };
}
