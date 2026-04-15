import type { CanvasMetadata, CanvasListItem } from "../types";
import { canvasIndexManager } from "./CanvasIndexManager";
import type { useCanvasStorage } from "../composables/useCanvasStorage";
import { GitInternalService } from "./GitInternalService";
import { generateCanvasId } from "../utils/id";
import { useTemplateRegistry } from "../composables/useTemplateRegistry";
import { createModuleLogger } from "@/utils/logger";
import { exists, readDir } from "@tauri-apps/plugin-fs";

const logger = createModuleLogger("Canvas/Service");

export class CanvasService {
  constructor(private storage: ReturnType<typeof useCanvasStorage>) {}

  /**
   * 执行健康检查
   */
  async performHealthCheck(currentList: CanvasListItem[]): Promise<CanvasListItem[]> {
    const rootDir = await this.storage.getCanvasesRootDir();
    if (!(await exists(rootDir))) return currentList;

    const entries = await readDir(rootDir);
    const diskIds = new Set(entries.filter((e) => e.isDirectory).map((e) => e.name));
    const newList = [...currentList];
    const indexedIds = new Set(newList.map((c) => c.metadata.id));

    // 检查 Missing (索引有，磁盘无)
    newList.forEach((item) => {
      if (!diskIds.has(item.metadata.id)) {
        item.health = "missing";
      }
    });

    // 检查 Unindexed (磁盘有，索引无)
    for (const id of diskIds) {
      if (!indexedIds.has(id)) {
        const metadata = await this.storage.readCanvasMetadata(id);
        if (metadata) {
          newList.push({
            metadata,
            status: "idle",
            dirtyFileCount: 0,
            health: "unindexed",
          });
        }
      }
    }

    // 排序
    return newList.sort((a, b) => b.metadata.updatedAt - a.metadata.updatedAt);
  }

  /**
   * 创建新画布
   */
  async createCanvas(title: string, templateId?: string): Promise<CanvasMetadata> {
    const registry = useTemplateRegistry();
    const id = generateCanvasId();
    const now = Date.now();

    // 获取模板
    const template = await registry.getTemplateById(templateId ?? "blank-html");
    if (!template) throw new Error(`模板不存在: ${templateId}`);

    const metadata: CanvasMetadata = {
      id,
      name: title,
      createdAt: now,
      updatedAt: now,
      basePath: id,
      entryFile: template.entryFile,
      template: template.id,
      fileCount: 0, // 稍后更新
    };

    // 1. 确保目录存在 (磁盘先行)
    await this.storage.ensureCanvasDir(id);

    // 2. 写入初始文件 (从模板目录递归复制)
    const basePath = await this.storage.getCanvasBasePath(id);
    const copiedFiles = await registry.copyTemplateFiles(template, basePath);
    metadata.fileCount = copiedFiles.length;

    // 3. 初始化 Git
    const gitService = new GitInternalService(basePath);
    const initRes = await gitService.init();
    if (initRes === null) throw new Error("Git 初始化失败");

    const addRes = await gitService.add(copiedFiles);
    if (addRes === null) throw new Error("Git 添加文件失败");

    const commitRes = await gitService.commit(`Initial commit from template: ${template.name}`);
    if (commitRes === null) throw new Error("Git 初始提交失败");

    // 4. 写入元数据
    await this.storage.writeCanvasMetadata(id, metadata);

    // 5. 更新索引 (同步索引)
    await canvasIndexManager.upsertProject({
      id,
      name: title,
      description: metadata.description,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      relPath: `projects/${id}`,
      fileCount: metadata.fileCount,
      previewUrl: metadata.previewUrl,
    });

    return metadata;
  }

  /**
   * 修复项目
   */
  async repairProject(canvasId: string, action: "remove_index" | "reindex" | "restore_metadata") {
    logger.info("正在修复项目", { canvasId, action });

    if (action === "remove_index") {
      await canvasIndexManager.removeProject(canvasId);
    } else if (action === "reindex" || action === "restore_metadata") {
      const metadata = await this.storage.readCanvasMetadata(canvasId);
      if (metadata) {
        await canvasIndexManager.upsertProject({
          id: metadata.id,
          name: metadata.name,
          description: metadata.description,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          relPath: `projects/${metadata.id}`,
          fileCount: metadata.fileCount,
          previewUrl: metadata.previewUrl,
        });
      } else if (action === "restore_metadata") {
        // 如果元数据损毁，尝试从索引中的快照恢复
        const index = await canvasIndexManager.loadIndex();
        const p = index.projects.find((x) => x.id === canvasId);
        if (p) {
          const newMetadata: CanvasMetadata = {
            id: p.id,
            name: p.name,
            updatedAt: p.updatedAt,
            createdAt: p.updatedAt,
            basePath: p.id,
            fileCount: 0,
            entryFile: "index.html", // 默认入口
          };
          await this.storage.writeCanvasMetadata(canvasId, newMetadata);
        }
      }
    }
  }
}