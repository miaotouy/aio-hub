import { appDataDir, join, resolveResource } from "@tauri-apps/api/path";
import { readDir, readTextFile, mkdir, exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { CanvasTemplateDef, ResolvedTemplate, TemplateSource } from "../types/template";

const logger = createModuleLogger("canvas/useTemplateRegistry");
const errorHandler = createModuleErrorHandler("canvas/useTemplateRegistry");

/**
 * 画布模板注册中心
 * 负责模板的发现、加载、初始化和复制
 */
export function useTemplateRegistry() {
  /** 获取模板根目录 (AppData/canvases/templates/) */
  async function getTemplatesRootDir(): Promise<string> {
    const appData = await appDataDir();
    return await join(appData, "canvases", "templates");
  }

  /**
   * 初始化内置模板
   * 将 public/canvases/templates/builtin/ 同步到 AppData
   * 策略：比较 template.json 中的 version 字段，仅在版本更新时覆盖
   */
  async function initBuiltinTemplates(): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        const templatesRoot = await getTemplatesRootDir();
        const builtinDest = await join(templatesRoot, "builtin");

        // 确保目录存在
        if (!(await exists(builtinDest))) {
          await mkdir(builtinDest, { recursive: true });
        }

        // 获取内置模板资源路径 (在生产环境下，这些文件在资源目录中)
        // 注意：在开发环境下，Vite 将 public 映射到根目录
        // 但在 Tauri 中，我们需要通过 resolveResource 找到打包后的资源
        const builtinSrc = await resolveResource("canvases/templates/builtin");

        if (!(await exists(builtinSrc))) {
          logger.warn("未找到内置模板资源目录", { builtinSrc });
          return;
        }

        const entries = await readDir(builtinSrc);
        for (const entry of entries) {
          if (entry.isDirectory) {
            await syncTemplateFolder(await join(builtinSrc, entry.name), await join(builtinDest, entry.name));
          }
        }

        logger.info("内置模板初始化完成");
      },
      { userMessage: "初始化内置模板失败" },
    );
  }

  /**
   * 递归同步模板文件夹
   */
  async function syncTemplateFolder(src: string, dest: string) {
    if (!(await exists(dest))) {
      await mkdir(dest, { recursive: true });
    }

    const srcJsonPath = await join(src, "template.json");
    const destJsonPath = await join(dest, "template.json");

    let shouldUpdate = true;
    if (await exists(destJsonPath)) {
      try {
        const srcJson = JSON.parse(await readTextFile(srcJsonPath)) as CanvasTemplateDef;
        const destJson = JSON.parse(await readTextFile(destJsonPath)) as CanvasTemplateDef;
        // 简单版本比较，如果不一致则更新
        shouldUpdate = srcJson.version !== destJson.version;
      } catch (e) {
        shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      logger.info(`正在更新模板: ${src} -> ${dest}`);
      await copyRecursive(src, dest);
    }
  }

  /**
   * 递归复制目录
   */
  async function copyRecursive(src: string, dest: string) {
    if (!(await exists(dest))) {
      await mkdir(dest, { recursive: true });
    }

    const entries = await readDir(src);
    for (const entry of entries) {
      const srcPath = await join(src, entry.name);
      const destPath = await join(dest, entry.name);

      if (entry.isDirectory) {
        await copyRecursive(srcPath, destPath);
      } else {
        // 使用二进制复制，最安全
        const data = await readFile(srcPath);
        await writeFile(destPath, data);
      }
    }
  }

  /**
   * 扫描并返回所有可用模板
   * 合并 builtin/ 和 user/ 两个来源
   */
  async function getAllTemplates(): Promise<ResolvedTemplate[]> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const templatesRoot = await getTemplatesRootDir();
          const results: ResolvedTemplate[] = [];

          // 扫描 builtin 和 user 目录
          const sources: TemplateSource[] = ["builtin", "user"];
          for (const source of sources) {
            const sourceDir = await join(templatesRoot, source);
            if (!(await exists(sourceDir))) continue;

            const entries = await readDir(sourceDir);
            for (const entry of entries) {
              if (entry.isDirectory) {
                const template = await loadTemplate(source, await join(sourceDir, entry.name));
                if (template) results.push(template);
              }
            }
          }

          return results;
        },
        { userMessage: "加载模板列表失败" },
      )) ?? []
    );
  }

  /**
   * 加载单个模板元数据
   */
  async function loadTemplate(source: TemplateSource, bundlePath: string): Promise<ResolvedTemplate | null> {
    const jsonPath = await join(bundlePath, "template.json");
    if (!(await exists(jsonPath))) return null;

    try {
      const content = await readTextFile(jsonPath);
      const def = JSON.parse(content) as CanvasTemplateDef;
      const filesPath = await join(bundlePath, "files");

      const template: ResolvedTemplate = {
        ...def,
        source,
        bundlePath,
        filesPath,
      };

      if (def.preview) {
        template.previewPath = await join(bundlePath, def.preview);
      }

      return template;
    } catch (e) {
      logger.error("加载模板失败", e as Error, { bundlePath });
      return null;
    }
  }

  /**
   * 按 ID 获取单个模板
   */
  async function getTemplateById(id: string): Promise<ResolvedTemplate | null> {
    const all = await getAllTemplates();
    return all.find((t) => t.id === id) || null;
  }

  /**
   * 获取所有模板 ID 列表
   */
  async function getTemplateIds(): Promise<string[]> {
    const all = await getAllTemplates();
    return all.map((t) => t.id);
  }

  /**
   * 将模板的 files/ 目录递归复制到目标画布目录
   * 返回复制的文件列表（相对路径）
   */
  async function copyTemplateFiles(template: ResolvedTemplate, targetDir: string): Promise<string[]> {
    const copiedFiles: string[] = [];

    // 简化版递归复制，专门用于 copyTemplateFiles
    const copyTask = async (src: string, dest: string, relPath: string = "") => {
      const entries = await readDir(src);
      for (const entry of entries) {
        const srcPath = await join(src, entry.name);
        const destPath = await join(dest, entry.name);
        const currentRelPath = relPath ? relPath + "/" + entry.name : entry.name;

        if (entry.isDirectory) {
          if (!(await exists(destPath))) {
            await mkdir(destPath, { recursive: true });
          }
          await copyTask(srcPath, destPath, currentRelPath);
        } else {
          const data = await readFile(srcPath);
          await writeFile(destPath, data);
          copiedFiles.push(currentRelPath);
        }
      }
    };

    await errorHandler.wrapAsync(
      async () => {
        if (!(await exists(targetDir))) {
          await mkdir(targetDir, { recursive: true });
        }
        await copyTask(template.filesPath, targetDir);
      },
      { userMessage: "复制模板文件失败" },
    );

    return copiedFiles;
  }

  /**
   * 获取模板缩略图的可访问 URL
   */
  async function getPreviewUrl(template: ResolvedTemplate): Promise<string | null> {
    if (!template.previewPath || !(await exists(template.previewPath))) {
      return null;
    }
    return convertFileSrc(template.previewPath);
  }

  return {
    getTemplatesRootDir,
    initBuiltinTemplates,
    getAllTemplates,
    getTemplateById,
    getTemplateIds,
    copyTemplateFiles,
    getPreviewUrl,
  };
}
