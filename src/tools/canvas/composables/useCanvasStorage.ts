import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
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
    return await join(dataDir, "canvases", canvasId);
  }

  /**
   * 获取所有画布列表的根目录
   */
  async function getCanvasesRootDir() {
    const dataDir = await appDataDir();
    return await join(dataDir, "canvases");
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
    * 列出所有画布
    */
  async function listAllCanvases(): Promise<CanvasMetadata[]> {
    const result = await errorHandler.wrapAsync(
      async () => {
        const rootDir = await getCanvasesRootDir();
        if (!(await exists(rootDir))) {
          await mkdir(rootDir, { recursive: true });
          return [];
        }

        const entries = await readDir(rootDir);
        const canvases: CanvasMetadata[] = [];

        for (const entry of entries) {
          if (entry.isDirectory) {
            const metadata = await readCanvasMetadata(entry.name);
            if (metadata) {
              canvases.push(metadata);
            }
          }
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
          relative_path: `canvases/${canvasId}`,
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
        const tree = await invoke<CanvasFileNode[]>("generate_directory_tree", {
          path: basePath,
          recursive: true,
          show_size: true,
        });

        // 过滤掉 .git 和 .canvas.json
        const filterNodes = (nodes: CanvasFileNode[]): CanvasFileNode[] => {
          return nodes
            .filter((node) => node.name !== ".git" && node.name !== ".canvas.json")
            .map((node) => ({
              ...node,
              children: node.children ? filterNodes(node.children) : undefined,
              status: "clean" as const,
            }));
        };

        return filterNodes(tree);
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
  };
}
