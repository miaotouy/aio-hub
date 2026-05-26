import Konva from "konva";
import type { HistoryEntry } from "./useHybridHistory";
import type { EditorSession } from "./useEditorSession";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/HistoryApplicator");

/**
 * 历史记录应用器
 * 负责将 undo/redo 操作实际应用到 Konva 画布和图层数据模型上
 */
export function useHistoryApplicator(session: EditorSession) {
  const { state, runtime, actions } = session;

  /**
   * 应用一条历史记录（撤销或重做方向）
   */
  function applyHistoryEntry(entry: HistoryEntry, direction: "undo" | "redo"): void {
    const stage = runtime.capabilities.getStage();
    const canvases = runtime.capabilities.getCanvases();

    if (!stage) {
      logger.warn("applyHistoryEntry: stage 不可用", { type: entry.type, direction });
      return;
    }

    switch (entry.type) {
      case "raster-pixels":
        applyRasterPixels(entry, direction, canvases, stage);
        break;

      case "object-add":
        applyObjectAdd(entry, direction, stage);
        break;

      case "object-remove":
        applyObjectRemove(entry, direction, stage);
        break;

      case "object-modify":
        applyObjectModify(entry, direction, stage);
        break;

      case "object-reorder":
        applyObjectReorder(entry, direction, stage);
        break;

      case "layer-add":
        applyLayerAdd(entry, direction);
        break;

      case "layer-remove":
        applyLayerRemove(entry, direction, canvases, stage);
        break;

      case "layer-reorder":
        applyLayerReorder(entry, direction);
        break;

      case "layer-modify":
        applyLayerModify(entry, direction);
        break;

      case "layer-rasterize":
        applyLayerRasterize(entry, direction, canvases, stage);
        break;
    }
  }

  // ─── 各类型的具体应用逻辑 ───

  function applyRasterPixels(
    entry: Extract<HistoryEntry, { type: "raster-pixels" }>,
    direction: "undo" | "redo",
    canvases: Map<string, HTMLCanvasElement>,
    stage: Konva.Stage,
  ): void {
    const canvas = canvases.get(entry.layerId);
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      const imgData = direction === "undo" ? entry.before : entry.after;
      ctx.putImageData(imgData, 0, 0);
      stage.batchDraw();
    }
  }

  function applyObjectAdd(
    entry: Extract<HistoryEntry, { type: "object-add" }>,
    direction: "undo" | "redo",
    stage: Konva.Stage,
  ): void {
    const konvaLayer = stage.findOne(`#${entry.layerId}`) as Konva.Layer;
    if (!konvaLayer) return;

    if (direction === "undo") {
      const node = konvaLayer.findOne(`#${entry.object.id}`);
      node?.destroy();
    } else {
      const node = runtime.capabilities.createKonvaNode(entry.object);
      if (node) konvaLayer.add(node);
    }
    stage.batchDraw();

    // 同步对象图层数据模型
    syncObjectLayerData(entry.layerId);
  }

  function applyObjectRemove(
    entry: Extract<HistoryEntry, { type: "object-remove" }>,
    direction: "undo" | "redo",
    stage: Konva.Stage,
  ): void {
    const konvaLayer = stage.findOne(`#${entry.layerId}`) as Konva.Layer;
    if (!konvaLayer) return;

    if (direction === "undo") {
      const node = runtime.capabilities.createKonvaNode(entry.object);
      if (node) konvaLayer.add(node);
    } else {
      const node = konvaLayer.findOne(`#${entry.object.id}`);
      node?.destroy();
    }
    stage.batchDraw();

    // 同步对象图层数据模型
    syncObjectLayerData(entry.layerId);
  }

  function applyObjectModify(
    entry: Extract<HistoryEntry, { type: "object-modify" }>,
    direction: "undo" | "redo",
    stage: Konva.Stage,
  ): void {
    const konvaLayer = stage.findOne(`#${entry.layerId}`) as Konva.Layer;
    if (!konvaLayer) return;

    const node = konvaLayer.findOne(`#${entry.objectId}`) as Konva.Shape;
    if (!node) return;

    const attrs = direction === "undo" ? entry.before : entry.after;

    // 逐个属性设置，处理特殊映射
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "content" && node instanceof Konva.Text) {
        node.text(value as string);
      } else if (key === "color" && node instanceof Konva.Text) {
        node.fill(value as string);
      } else if (key === "arrowSize" && node instanceof Konva.Arrow) {
        node.pointerLength(value as number);
        node.pointerWidth(value as number);
      } else {
        node.setAttr(key, value === null ? undefined : value);
      }
    }
    stage.batchDraw();
  }

  function applyObjectReorder(
    entry: Extract<HistoryEntry, { type: "object-reorder" }>,
    direction: "undo" | "redo",
    stage: Konva.Stage,
  ): void {
    const konvaLayer = stage.findOne(`#${entry.layerId}`) as Konva.Layer;
    if (!konvaLayer) return;

    const order = direction === "undo" ? entry.before : entry.after;
    order.forEach((id, idx) => {
      const node = konvaLayer.findOne(`#${id}`);
      if (node) node.zIndex(idx);
    });
    stage.batchDraw();

    // 同步对象图层数据模型
    syncObjectLayerData(entry.layerId);
  }

  function applyLayerAdd(
    entry: Extract<HistoryEntry, { type: "layer-add" }>,
    direction: "undo" | "redo",
  ): void {
    if (direction === "undo") {
      actions.deleteLayer(entry.layer.id);
    } else {
      state.layers.value.splice(entry.index, 0, entry.layer);
      state.activeLayerId.value = entry.layer.id;
    }
  }

  function applyLayerRemove(
    entry: Extract<HistoryEntry, { type: "layer-remove" }>,
    direction: "undo" | "redo",
    canvases: Map<string, HTMLCanvasElement>,
    stage: Konva.Stage,
  ): void {
    if (direction === "undo") {
      state.layers.value.splice(entry.index, 0, entry.layer);
      state.activeLayerId.value = entry.layer.id;

      // 恢复位图图层的像素数据
      if (entry.layer.type === "raster" && entry.imageData) {
        setTimeout(() => {
          const canvas = canvases.get(entry.layer.id);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx && entry.imageData) {
              ctx.putImageData(entry.imageData, 0, 0);
              stage.batchDraw();
            }
          }
        }, 50);
      }
    } else {
      actions.deleteLayer(entry.layer.id);
    }
  }

  function applyLayerReorder(
    entry: Extract<HistoryEntry, { type: "layer-reorder" }>,
    direction: "undo" | "redo",
  ): void {
    const order = direction === "undo" ? entry.before : entry.after;
    actions.reorderLayers(order);
  }

  function applyLayerModify(
    entry: Extract<HistoryEntry, { type: "layer-modify" }>,
    direction: "undo" | "redo",
  ): void {
    const layer = state.layers.value.find((l) => l.id === entry.layerId);
    if (layer) {
      const attrs = direction === "undo" ? entry.before : entry.after;
      Object.assign(layer, attrs);
    }
  }

  function applyLayerRasterize(
    entry: Extract<HistoryEntry, { type: "layer-rasterize" }>,
    direction: "undo" | "redo",
    canvases: Map<string, HTMLCanvasElement>,
    stage: Konva.Stage,
  ): void {
    if (direction === "undo") {
      actions.replaceLayer(entry.afterLayer.id, entry.beforeLayer);
    } else {
      actions.replaceLayer(entry.layerId, entry.afterLayer);
      setTimeout(() => {
        const canvas = canvases.get(entry.afterLayer.id);
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx && entry.imageData) {
            ctx.putImageData(entry.imageData, 0, 0);
            stage.batchDraw();
          }
        }
      }, 50);
    }
  }

  // ─── 辅助函数 ───

  /** 从 Konva 运行时同步对象图层数据到数据模型 */
  function syncObjectLayerData(layerId: string): void {
    const objectData = runtime.capabilities.collectObjectLayerData();
    const objects = objectData.get(layerId);
    if (objects) {
      actions.updateLayerObjects(layerId, objects);
    }
  }

  return {
    applyHistoryEntry,
  };
}