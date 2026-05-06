import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, exists, mkdir, rename } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("Canvas/IndexManager");
const errorHandler = createModuleErrorHandler("Canvas/IndexManager");

export interface CanvasIndexItem {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  relPath: string; // "projects/cp_xxx"
  fileCount?: number;
  previewUrl?: string;
}

export interface CanvasIndex {
  version: string;
  lastUpdated: number;
  projects: CanvasIndexItem[];
}

const INDEX_VERSION = "1.0.0";
const INDEX_FILENAME = "projects.json";

/**
 * 画布项目索引管理器
 * 负责维护 AppData/canvases/projects.json
 */
export class CanvasIndexManager {
  private static instance: CanvasIndexManager;
  private indexPath: string | null = null;

  private constructor() {}

  public static getInstance(): CanvasIndexManager {
    if (!CanvasIndexManager.instance) {
      CanvasIndexManager.instance = new CanvasIndexManager();
    }
    return CanvasIndexManager.instance;
  }

  /**
   * 获取索引文件绝对路径
   */
  private async getIndexPath(): Promise<string> {
    if (this.indexPath) return this.indexPath;
    const dataDir = await appDataDir();
    this.indexPath = await join(dataDir, "canvases", INDEX_FILENAME);
    return this.indexPath;
  }

  /**
   * 加载索引
   */
  public async loadIndex(): Promise<CanvasIndex> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const path = await this.getIndexPath();
          if (!(await exists(path))) {
            return this.createEmptyIndex();
          }
          const content = await readTextFile(path);
          return JSON.parse(content) as CanvasIndex;
        },
        { userMessage: "加载项目索引失败" },
      )) || this.createEmptyIndex()
    );
  }

  /**
   * 保存索引 (原子写入)
   */
  public async saveIndex(index: CanvasIndex): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const path = await this.getIndexPath();
        const tempPath = `${path}.tmp`;

        index.lastUpdated = Date.now();
        index.version = INDEX_VERSION;

        // 确保目录存在
        const dataDir = await appDataDir();
        const canvasesDir = await join(dataDir, "canvases");
        if (!(await exists(canvasesDir))) {
          await mkdir(canvasesDir, { recursive: true });
        }

        await writeTextFile(tempPath, JSON.stringify(index, null, 2));
        await rename(tempPath, path);
        logger.debug("索引文件已更新", { path });
      },
      { userMessage: "保存项目索引失败" },
    );
  }

  /**
   * 添加或更新项目索引
   */
  public async upsertProject(item: CanvasIndexItem): Promise<void> {
    const index = await this.loadIndex();
    const existingIndex = index.projects.findIndex((p) => p.id === item.id);

    if (existingIndex >= 0) {
      index.projects[existingIndex] = item;
    } else {
      index.projects.push(item);
    }

    await this.saveIndex(index);
  }

  /**
   * 移除项目索引
   */
  public async removeProject(id: string): Promise<void> {
    const index = await this.loadIndex();
    const originalCount = index.projects.length;
    index.projects = index.projects.filter((p) => p.id !== id);

    if (index.projects.length !== originalCount) {
      await this.saveIndex(index);
    }
  }

  private createEmptyIndex(): CanvasIndex {
    return {
      version: INDEX_VERSION,
      lastUpdated: Date.now(),
      projects: [],
    };
  }
}

export const canvasIndexManager = CanvasIndexManager.getInstance();
