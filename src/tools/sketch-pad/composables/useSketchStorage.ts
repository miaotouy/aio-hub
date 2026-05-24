import { ref } from "vue";
import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists, writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { SketchProject, HybridSketchFile, HybridLayer, SketchIndex, AssetRef } from "../types";
import type Konva from "konva";

const logger = createModuleLogger("SketchPad/Storage");
const errorHandler = createModuleErrorHandler("SketchPad/Storage");

const INDEX_FILENAME = "index.json";

export function useSketchStorage() {
  const projects = ref<SketchProject[]>([]);
  const currentProjectId = ref<string>("");

  async function getSketchRootDir() {
    const dataDir = await appDataDir();
    return await join(dataDir, "sketch-pad");
  }

  async function getSketchBasePath(id: string) {
    const root = await getSketchRootDir();
    return await join(root, "sketches", id);
  }

  async function ensureSketchDir(id: string) {
    const basePath = await getSketchBasePath(id);
    if (!(await exists(basePath))) {
      await mkdir(basePath, { recursive: true });
    }
    // 确保 layers 目录存在
    const layersPath = await join(basePath, "layers");
    if (!(await exists(layersPath))) {
      await mkdir(layersPath, { recursive: true });
    }
    return basePath;
  }

  async function loadIndex(): Promise<SketchIndex> {
    const root = await getSketchRootDir();
    const indexPath = await join(root, INDEX_FILENAME);

    if (!(await exists(indexPath))) {
      return { projects: [] };
    }

    try {
      const content = await readTextFile(indexPath);
      const index = JSON.parse(content) as SketchIndex;
      projects.value = index.projects;
      return index;
    } catch (error) {
      logger.error("加载索引失败", error as Error);
      return { projects: [] };
    }
  }

  async function saveIndex(index: SketchIndex) {
    const root = await getSketchRootDir();
    if (!(await exists(root))) {
      await mkdir(root, { recursive: true });
    }
    const indexPath = await join(root, INDEX_FILENAME);
    await writeTextFile(indexPath, JSON.stringify(index, null, 2));
    projects.value = index.projects;
  }

  async function saveProject(
    project: SketchProject,
    layers: HybridLayer[],
    canvases: Map<string, HTMLCanvasElement>,
    stage: Konva.Stage,
    assetRefs: AssetRef[] = [],
  ) {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await ensureSketchDir(project.id);

        // 1. 保存图层文件
        for (const layer of layers) {
          if (layer.type === "raster") {
            const canvas = canvases.get(layer.id);
            if (canvas) {
              // 将 canvas 转换为 Uint8Array
              const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
              if (blob) {
                const buffer = await blob.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                const layerPath = await join(basePath, "layers", `${layer.id}.png`);
                await writeFile(layerPath, uint8);
              }
            }
          } else if (layer.type === "object") {
            const layerPath = await join(basePath, "layers", `${layer.id}.json`);
            await writeTextFile(layerPath, JSON.stringify(layer.objects, null, 2));
          }
        }

        // 2. 保存 manifest.json（包含 assetRefs）
        const manifest: HybridSketchFile = {
          version: 1,
          project,
          layers,
          assetRefs,
        };
        const manifestPath = await join(basePath, "sketch.json");
        await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));

        // 3. 生成并保存缩略图
        // 临时隐藏 overlay 层
        const overlay = stage.findOne(".overlay");
        if (overlay) overlay.hide();
        const dataUrl = stage.toDataURL({ pixelRatio: 1 });
        if (overlay) overlay.show();

        // 直接解码 base64 data URL，避免 fetch 触发 CSP 拦截
        const base64Data = dataUrl.split(",")[1];
        const binaryStr = atob(base64Data);
        const uint8 = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          uint8[i] = binaryStr.charCodeAt(i);
        }

        const root = await getSketchRootDir();
        const thumbDir = await join(root, "thumbnails");
        if (!(await exists(thumbDir))) {
          await mkdir(thumbDir, { recursive: true });
        }
        const thumbPath = await join(thumbDir, `${project.id}.png`);
        await writeFile(thumbPath, uint8);

        project.thumbnailPath = thumbPath;

        // 4. 更新索引
        const index = await loadIndex();
        const existingIndex = index.projects.findIndex((p) => p.id === project.id);
        if (existingIndex !== -1) {
          index.projects[existingIndex] = project;
        } else {
          index.projects.push(project);
        }
        index.lastOpenedId = project.id;
        await saveIndex(index);

        logger.info("项目保存成功", { id: project.id });
        return true;
      },
      { userMessage: "保存项目失败" },
    );
  }

  async function loadProject(id: string): Promise<HybridSketchFile | null> {
    return await errorHandler.wrapAsync(
      async () => {
        const basePath = await getSketchBasePath(id);
        const manifestPath = await join(basePath, "sketch.json");

        if (!(await exists(manifestPath))) {
          return null;
        }

        const content = await readTextFile(manifestPath);
        const manifest = JSON.parse(content) as HybridSketchFile;

        currentProjectId.value = id;
        return manifest;
      },
      { userMessage: "加载项目失败" },
    );
  }

  async function deleteProject(id: string) {
    return await errorHandler.wrapAsync(
      async () => {
        // 使用 Rust 后端的安全删除指令
        await invoke("delete_directory_in_app_data", {
          relativePath: `sketch-pad/sketches/${id}`,
        });

        // 删除缩略图
        const root = await getSketchRootDir();
        const thumbPath = await join(root, "thumbnails", `${id}.png`);
        if (await exists(thumbPath)) {
          await invoke("delete_file_in_app_data", {
            relativePath: `sketch-pad/thumbnails/${id}.png`,
          });
        }

        // 更新索引
        const index = await loadIndex();
        index.projects = index.projects.filter((p) => p.id !== id);
        if (index.lastOpenedId === id) {
          index.lastOpenedId = index.projects[0]?.id || undefined;
        }
        await saveIndex(index);

        logger.info("项目已成功删除", { id });
        return true;
      },
      { userMessage: "删除项目失败" },
    );
  }

  return {
    projects,
    currentProjectId,
    loadIndex,
    saveProject,
    loadProject,
    deleteProject,
  };
}
