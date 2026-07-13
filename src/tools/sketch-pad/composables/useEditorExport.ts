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

import Konva from "konva";
import { nanoid } from "nanoid";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { EditorSession } from "./useEditorSession";
import { useSketchStorage } from "./useSketchStorage";
import { useSketchPadStore } from "../stores/sketchPadStore";
import { useSendSketchToChat } from "./useSendSketchToChat";
import { useImageAsset } from "./useImageAsset";
import { packageSketch } from "../core/sketch-packager";
import { canvasToBlob, exportStageToCanvas } from "../core/konva-export";
import { generateDefaultSketchName } from "../constants";
import type { SketchProject } from "../types";
import { customMessage } from "@/utils/customMessage";

/**
 * 编辑器导出功能
 * 负责保存、增量保存、图片导出、发送到 Chat、图片导入
 */
export function useEditorExport(session: EditorSession) {
  const { state, runtime, actions } = session;
  const storage = useSketchStorage();
  const store = useSketchPadStore();
  const { sendToChat } = useSendSketchToChat();
  const { importImageFromDialog } = useImageAsset();

  /**
   * 保存前同步矢量图层数据：从 Konva 运行时节点序列化回 layers 数据模型
   */
  function syncObjectLayersBeforeSave(): void {
    const objectData = runtime.capabilities.collectObjectLayerData();
    if (!objectData || objectData.size === 0) return;

    for (const [layerId, objects] of objectData) {
      const layer = state.layers.value.find((l) => l.id === layerId);
      if (layer && layer.type === "object") {
        layer.objects = objects;
      }
    }
  }

  /**
   * 保存项目
   */
  async function handleSave(): Promise<void> {
    if (!state.project.value) return;

    const stage = runtime.capabilities.getStage();
    const canvases = runtime.capabilities.getCanvases();
    if (!stage) return;

    // 保存前同步矢量图层数据
    syncObjectLayersBeforeSave();

    state.project.value.updatedAt = new Date().toISOString();
    const success = await storage.saveProject(
      state.project.value,
      state.layers.value,
      canvases,
      stage,
      state.assetRefs.value
    );

    if (success) {
      state.isDirty.value = false;
      customMessage.success("保存成功");
      await store.loadIndex();
    }
  }

  /**
   * 增量保存（创建副本）
   */
  async function handleIncrementalSave(): Promise<void> {
    if (!state.project.value) return;

    // 先保存当前项目
    await handleSave();

    const stage = runtime.capabilities.getStage();
    const canvases = runtime.capabilities.getCanvases();
    if (!stage) return;

    // 创建副本
    const newProj: SketchProject = {
      id: nanoid(),
      name: `${state.project.value.name} (副本)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      width: state.project.value.width,
      height: state.project.value.height,
    };

    const success = await storage.saveProject(
      newProj,
      state.layers.value,
      canvases,
      stage,
      state.assetRefs.value
    );
    if (success) {
      state.project.value = newProj;
      state.isDirty.value = false;
      customMessage.success("增量保存成功（已创建副本）");
      await store.loadIndex();
    }
  }

  /**
   * 导出为指定格式
   */
  async function handleExport(
    format: "aiosk" | "png" | "jpg" | "webp"
  ): Promise<void> {
    if (!state.project.value) return;

    const stage = runtime.capabilities.getStage();
    const canvases = runtime.capabilities.getCanvases();
    if (!stage) return;

    if (format === "aiosk") {
      await handleExportAiosk(stage, canvases);
    } else {
      await handleExportImage(format, stage);
    }
  }

  /**
   * 导出为 .aiosk 项目文件
   */
  async function handleExportAiosk(
    stage: Konva.Stage,
    canvases: Map<string, HTMLCanvasElement>
  ): Promise<void> {
    if (!state.project.value) return;

    syncObjectLayersBeforeSave();

    const bytes = await packageSketch(
      state.project.value,
      state.layers.value,
      canvases,
      stage
    );
    if (bytes) {
      const filePath = await save({
        filters: [{ name: "AIO Hub Sketch File", extensions: ["aiosk"] }],
        defaultPath: `${state.project.value.name}.aiosk`,
      });

      if (filePath) {
        await writeFile(filePath, bytes);
        customMessage.success("导出成功");
      }
    }
  }

  /**
   * 导出为图片格式 (png / jpg / webp)
   */
  async function handleExportImage(
    format: "png" | "jpg" | "webp",
    stage: Konva.Stage
  ): Promise<void> {
    if (!state.project.value) return;

    // 隐藏 overlay 层（Transformer 等辅助元素）和边界层
    const overlay = stage.findOne(".overlay");
    const borderLayer = stage.findOne("#border-layer");
    if (overlay) overlay.hide();
    if (borderLayer) borderLayer.hide();

    // 确定 MIME 类型和文件扩展名
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
    };
    const mimeType = mimeMap[format];
    const ext = format === "jpg" ? "jpg" : format;

    let blob: Blob;
    try {
      const canvas = exportStageToCanvas(stage, {
        x: 0,
        y: 0,
        width: state.project.value.width,
        height: state.project.value.height,
        pixelRatio: 2,
      });
      blob = await canvasToBlob(
        canvas,
        mimeType,
        format === "png" ? undefined : 0.92
      );
    } finally {
      // 恢复隐藏的层
      if (overlay) overlay.show();
      if (borderLayer) borderLayer.show();
      stage.batchDraw();
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    // 弹出保存对话框
    const filePath = await save({
      filters: [{ name: `${format.toUpperCase()} 图片`, extensions: [ext] }],
      defaultPath: `${state.project.value.name}.${ext}`,
    });

    if (filePath) {
      await writeFile(filePath, bytes);
      customMessage.success(`已导出为 ${format.toUpperCase()} 图片`);
    }
  }

  /**
   * 发送到 Chat
   */
  async function handleSendToChat(): Promise<void> {
    const stage = runtime.capabilities.getStage();
    if (stage) {
      await sendToChat(
        stage,
        state.project.value?.name || generateDefaultSketchName(),
        {
          width: state.project.value?.width,
          height: state.project.value?.height,
        }
      );
    }
  }

  /**
   * 导入图片到当前画布
   */
  async function handleImportImage(): Promise<void> {
    const context = { assetRefs: state.assetRefs.value };
    const imageObj = await importImageFromDialog(context);
    if (!imageObj) return;

    // 确保当前有对象图层
    const activeLayerData = state.activeLayer.value;
    if (!activeLayerData || activeLayerData.type !== "object") {
      // 自动切换到对象图层或创建一个
      const objectLayer = state.layers.value.find((l) => l.type === "object");
      if (objectLayer) {
        state.activeLayerId.value = objectLayer.id;
      } else {
        const newLayer = actions.addLayer("object", "图片图层");
        state.activeLayerId.value = newLayer.id;
      }
    }

    await runtime.capabilities.addImageToActiveLayer(imageObj);
    state.isDirty.value = true;
  }

  /**
   * 自动保存（静默，不显示提示）
   */
  async function handleAutoSave(): Promise<void> {
    if (!state.project.value) return;

    const stage = runtime.capabilities.getStage();
    const canvases = runtime.capabilities.getCanvases();
    if (!stage) return;

    // 自动保存前也需要同步矢量数据
    syncObjectLayersBeforeSave();

    state.project.value.updatedAt = new Date().toISOString();
    await storage.saveProject(
      state.project.value,
      state.layers.value,
      canvases,
      stage,
      state.assetRefs.value
    );
    state.isDirty.value = false;
  }

  return {
    syncObjectLayersBeforeSave,
    handleSave,
    handleIncrementalSave,
    handleExport,
    handleSendToChat,
    handleImportImage,
    handleAutoSave,
  };
}
