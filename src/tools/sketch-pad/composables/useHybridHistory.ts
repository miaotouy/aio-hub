import { ref, computed } from "vue";
import type { HybridLayer, SketchObject, LayerBase, RasterLayer, ObjectLayer } from "../types";

export type HistoryEntry =
  | {
      type: "raster-pixels";
      layerId: string;
      rect: { x: number; y: number; width: number; height: number };
      before: ImageData;
      after: ImageData;
    }
  | { type: "object-add"; layerId: string; object: SketchObject }
  | { type: "object-remove"; layerId: string; object: SketchObject }
  | {
      type: "object-modify";
      layerId: string;
      objectId: string;
      before: Partial<SketchObject>;
      after: Partial<SketchObject>;
    }
  | { type: "object-reorder"; layerId: string; before: string[]; after: string[] }
  | { type: "layer-add"; layer: HybridLayer; index: number }
  | { type: "layer-remove"; layer: HybridLayer; index: number; imageData?: ImageData }
  | { type: "layer-reorder"; before: string[]; after: string[] }
  | { type: "layer-modify"; layerId: string; before: Partial<LayerBase>; after: Partial<LayerBase> }
  | {
      type: "layer-rasterize";
      layerId: string;
      beforeLayer: ObjectLayer;
      afterLayer: RasterLayer;
      imageData: ImageData;
    };

export function useHybridHistory(maxDepth = 80) {
  const undoStack = ref<HistoryEntry[]>([]);
  const redoStack = ref<HistoryEntry[]>([]);

  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  function pushEntry(entry: HistoryEntry) {
    undoStack.value.push(entry);
    redoStack.value = []; // 每次新操作清空重做栈

    if (undoStack.value.length > maxDepth) {
      undoStack.value.shift(); // 丢弃最早的记录
    }
  }

  function clearHistory() {
    undoStack.value = [];
    redoStack.value = [];
  }

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    pushEntry,
    clearHistory,
  };
}
