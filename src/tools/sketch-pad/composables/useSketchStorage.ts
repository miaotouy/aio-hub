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

import { ref } from "vue";
import { appDataDir, join } from "@tauri-apps/api/path";
import {
  readTextFile,
  readFile,
  writeTextFile,
  mkdir,
  exists,
  writeFile,
  readDir,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type {
  SketchProject,
  HybridSketchFile,
  HybridLayer,
  SketchIndex,
  AssetRef,
} from "../types";
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

  /**
   * 同步索引与实际目录状态
   * - 移除索引中目录已不存在的孤儿记录
   * - 发现实际目录中存在但索引中没有的项目，尝试恢复
   */
  async function syncIndex(): Promise<SketchIndex> {
    const index = await loadIndex();
    const root = await getSketchRootDir();
    const sketchesDir = await join(root, "sketches");

    // 确保 sketches 目录存在
    if (!(await exists(sketchesDir))) {
      await mkdir(sketchesDir, { recursive: true });
      // 如果目录都不存在，索引中的项目全是孤儿
      if (index.projects.length > 0) {
        logger.warn("sketches 目录不存在，清理所有索引记录", {
          count: index.projects.length,
        });
        index.projects = [];
        await saveIndex(index);
      }
      return index;
    }

    let dirty = false;

    // 1. 校验索引中的项目，移除目录已不存在的孤儿
    const validProjects: SketchProject[] = [];
    for (const project of index.projects) {
      const projectDir = await join(sketchesDir, project.id);
      if (await exists(projectDir)) {
        validProjects.push(project);
      } else {
        logger.warn("索引中的项目目录不存在，移除孤儿记录", {
          id: project.id,
          name: project.name,
        });
        dirty = true;
      }
    }

    // 2. 扫描实际目录，发现未索引的项目
    try {
      const entries = await readDir(sketchesDir);
      const indexedIds = new Set(validProjects.map((p) => p.id));

      for (const entry of entries) {
        if (!entry.isDirectory || !entry.name) continue;
        const dirId = entry.name;
        if (indexedIds.has(dirId)) continue;

        // 尝试从 sketch.json 恢复项目信息
        const manifestPath = await join(sketchesDir, dirId, "sketch.json");
        if (await exists(manifestPath)) {
          try {
            const content = await readTextFile(manifestPath);
            const manifest = JSON.parse(content) as HybridSketchFile;
            if (manifest.project) {
              validProjects.push(manifest.project);
              logger.info("从目录恢复未索引的项目", {
                id: dirId,
                name: manifest.project.name,
              });
              dirty = true;
            }
          } catch {
            logger.warn("无法解析项目 manifest，跳过", { dirId });
          }
        } else {
          logger.warn("发现无 manifest 的孤儿目录，跳过", { dirId });
        }
      }
    } catch (error) {
      logger.warn("扫描 sketches 目录失败", { error });
    }

    // 3. 修正 lastOpenedId
    if (
      index.lastOpenedId &&
      !validProjects.some((p) => p.id === index.lastOpenedId)
    ) {
      index.lastOpenedId = validProjects[0]?.id || undefined;
      dirty = true;
    }

    if (dirty) {
      index.projects = validProjects;
      await saveIndex(index);
      logger.info("索引已同步更新", { projectCount: validProjects.length });
    } else {
      index.projects = validProjects;
      projects.value = validProjects;
    }

    return index;
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
    assetRefs: AssetRef[] = []
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
              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png")
              );
              if (blob) {
                const buffer = await blob.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                const layerPath = await join(
                  basePath,
                  "layers",
                  `${layer.id}.png`
                );
                await writeFile(layerPath, uint8);
              }
            }
          } else if (layer.type === "object") {
            const layerPath = await join(
              basePath,
              "layers",
              `${layer.id}.json`
            );
            await writeTextFile(
              layerPath,
              JSON.stringify(layer.objects, null, 2)
            );
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
        const existingIndex = index.projects.findIndex(
          (p) => p.id === project.id
        );
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
      { userMessage: "保存项目失败" }
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
      { userMessage: "加载项目失败" }
    );
  }

  /**
   * 加载项目中所有位图图层的像素数据
   * 返回 Map<layerId, Uint8Array>
   */
  async function loadRasterLayers(
    id: string,
    layers: HybridLayer[]
  ): Promise<Map<string, Uint8Array>> {
    const result = new Map<string, Uint8Array>();

    const basePath = await getSketchBasePath(id);

    for (const layer of layers) {
      if (layer.type !== "raster") continue;

      const layerPath = await join(basePath, "layers", `${layer.id}.png`);
      if (await exists(layerPath)) {
        try {
          const data = await readFile(layerPath);
          result.set(layer.id, new Uint8Array(data));
        } catch (error) {
          logger.warn("读取位图图层失败", { layerId: layer.id, error });
        }
      }
    }

    return result;
  }

  async function deleteProject(id: string) {
    return await errorHandler.wrapAsync(
      async () => {
        // 使用 Rust 后端的安全删除指令，容忍目录已不存在的情况
        const sketchDir = await getSketchBasePath(id);
        if (await exists(sketchDir)) {
          await invoke("delete_directory_in_app_data", {
            relativePath: `sketch-pad/sketches/${id}`,
          });
        } else {
          logger.warn("项目目录已不存在，跳过文件删除", { id });
        }

        // 删除缩略图（同样容忍不存在）
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
      { userMessage: "删除项目失败" }
    );
  }

  return {
    projects,
    currentProjectId,
    loadIndex,
    syncIndex,
    saveProject,
    loadProject,
    loadRasterLayers,
    deleteProject,
  };
}
