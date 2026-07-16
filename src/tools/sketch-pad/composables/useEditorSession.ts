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

import {
  ref,
  shallowRef,
  provide,
  inject,
  type InjectionKey,
  type Ref,
  type ComputedRef,
  type ShallowRef,
} from "vue";
import { nanoid } from "nanoid";
import { useLayerStack } from "./useLayerStack";
import { useHybridHistory, type HistoryEntry } from "./useHybridHistory";
import type {
  SketchProject,
  HybridLayer,
  AssetRef,
  SelectionInfo,
  SketchObject,
  ImageObject,
} from "../types";
import type { ToolType } from "../constants";
import type Konva from "konva";

// ─── 接口定义 ───

export interface EditorSessionState {
  // 项目
  project: Ref<SketchProject | null>;

  // 视图
  currentView: Ref<"gallery" | "editor">;

  // 图层
  layers: Ref<HybridLayer[]>;
  activeLayerId: Ref<string>;
  activeLayer: ComputedRef<HybridLayer | null>;

  // 工具
  activeTool: Ref<ToolType>;

  // 画笔属性
  brushSize: Ref<number>;
  brushColor: Ref<string>;
  brushOpacity: Ref<number>;

  // 形状属性
  strokeWidth: Ref<number>;
  strokeColor: Ref<string>;
  fillColor: Ref<string | null>;
  cornerRadius: Ref<number>;

  // 文字属性
  fontSize: Ref<number>;
  textColor: Ref<string>;
  fontFamily: Ref<string>;
  fontWeight: Ref<"normal" | "bold">;
  fontStyle: Ref<"normal" | "italic">;
  textAlign: Ref<"left" | "center" | "right">;

  // 选择
  selectionInfo: Ref<SelectionInfo>;

  // 编辑器状态
  isDirty: Ref<boolean>;
  isInitializing: Ref<boolean>;

  // 历史
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  undoStack: Ref<HistoryEntry[]>;
  redoStack: Ref<HistoryEntry[]>;

  // 资产
  assetRefs: Ref<AssetRef[]>;
}

export interface EditorSessionRuntime {
  stage: ShallowRef<Konva.Stage | null>;
  canvases: Map<string, HTMLCanvasElement>;

  // KonvaCanvas 注册的能力
  registerCapabilities(caps: Partial<CanvasCapabilities>): void;
  capabilities: CanvasCapabilities;

  // 历史应用器（由 SketchPad.vue 注册）
  historyApplicator:
    ((entry: HistoryEntry, direction: "undo" | "redo") => void) | null;
  registerHistoryApplicator(
    fn: (entry: HistoryEntry, direction: "undo" | "redo") => void
  ): void;
}

export interface CanvasCapabilities {
  deleteSelected(): void;
  selectAll(): void;
  resetView(): void;
  collectObjectLayerData(): Map<string, SketchObject[]>;
  getSelectionInfo(): SelectionInfo;
  updateSelectionProp(key: string, value: any): void;
  updateSelectionProps(data: Record<string, any>): void;
  alignSelection(dir: string): void;
  distributeSelection(dir: string): void;
  clearSelection(): void;
  selectObjectById(id: string): void;
  reorderObjectsInLayer(layerId: string, order: string[]): void;
  reorderSelectedObject(action: string): void;
  addImageToActiveLayer(img: ImageObject): Promise<void>;
  createKonvaNode(obj: SketchObject): any;
  getZoom(): number;
  getStage(): Konva.Stage | null;
  getCanvases(): Map<string, HTMLCanvasElement>;
}

export interface EditorSessionActions {
  // 工具
  selectTool(tool: ToolType): void;
  updateBrush(data: { size?: number; color?: string; opacity?: number }): void;
  updateShape(data: {
    strokeWidth?: number;
    strokeColor?: string;
    fillColor?: string | null;
    cornerRadius?: number;
  }): void;
  updateText(data: {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: "normal" | "bold";
    fontStyle?: "normal" | "italic";
    textAlign?: "left" | "center" | "right";
  }): void;

  // 图层
  addLayer(
    type: "background" | "raster" | "object",
    name?: string,
    options?: { fillColor?: string | null }
  ): HybridLayer;
  deleteLayer(id: string): boolean;
  toggleVisible(id: string): void;
  toggleLocked(id: string): void;
  reorderLayers(newOrder: string[]): void;
  updateBackgroundLayer(layerId: string, fillColor: string | null): void;

  // 历史
  pushHistory(entry: HistoryEntry): void;
  undo(): void;
  redo(): void;
  clearHistory(): void;

  // 选择
  updateSelectionProp(key: string, value: any): void;
  updateSelectionProps(data: Record<string, any>): void;
  alignSelection(dir: string): void;
  distributeSelection(dir: string): void;
  deleteSelected(): void;
  refreshSelectionInfo(): void;
  resetSelection(): void;

  // 编辑器
  markDirty(): void;
  applySettingsDefaults(settings: {
    defaultBrushSize: number;
    defaultBrushColor: string;
    defaultBrushOpacity: number;
    defaultStrokeWidth: number;
    defaultStrokeColor: string;
    defaultFillColor: string | null;
    defaultCornerRadius: number;
    defaultFontSize: number;
    defaultTextColor: string;
    defaultFontFamily: string;
  }): void;

  // 图层内部操作（供 composables 使用）
  replaceLayer(oldId: string, newLayer: HybridLayer): boolean;
  updateLayerObjects(layerId: string, objects: SketchObject[]): void;
  clearLayers(): void;
}

export interface EditorSession {
  id: string;
  state: EditorSessionState;
  runtime: EditorSessionRuntime;
  actions: EditorSessionActions;
}

// ─── provide/inject ───

const EDITOR_SESSION_KEY: InjectionKey<EditorSession> = Symbol("EditorSession");

export function provideEditorSession(session: EditorSession): EditorSession {
  provide(EDITOR_SESSION_KEY, session);
  return session;
}

export function useEditorSession(): EditorSession {
  const session = inject(EDITOR_SESSION_KEY);
  if (!session) {
    throw new Error(
      "useEditorSession must be used within a SketchPad editor (missing provide)"
    );
  }
  return session;
}

// ─── 工厂函数 ───

export function createEditorSession(): EditorSession {
  const id = nanoid();

  // 内部组合已有 composables
  const layerStack = useLayerStack();
  const history = useHybridHistory();

  // ─── State ───

  const project = ref<SketchProject | null>(null);
  const currentView = ref<"gallery" | "editor">("gallery");
  const activeTool = ref<ToolType>("select");

  // 画笔属性
  const brushSize = ref(5);
  const brushColor = ref("#ff4d4f");
  const brushOpacity = ref(1);

  // 形状属性
  const strokeWidth = ref(2);
  const strokeColor = ref("#40a9ff");
  const fillColor = ref<string | null>(null);
  const cornerRadius = ref(0);

  // 文字属性
  const fontSize = ref(24);
  const textColor = ref("#000000");
  const fontFamily = ref("sans-serif");
  const fontWeight = ref<"normal" | "bold">("normal");
  const fontStyle = ref<"normal" | "italic">("normal");
  const textAlign = ref<"left" | "center" | "right">("left");

  // 选择
  const selectionInfo = ref<SelectionInfo>({
    count: 0,
    singleObject: null,
    objectTypes: [],
    commonProps: {},
  });

  // 编辑器状态
  const isDirty = ref(false);
  const isInitializing = ref(false);

  // 资产
  const assetRefs = ref<AssetRef[]>([]);

  const state: EditorSessionState = {
    project,
    currentView,
    layers: layerStack.layers,
    activeLayerId: layerStack.activeLayerId,
    activeLayer: layerStack.activeLayer,
    activeTool,
    brushSize,
    brushColor,
    brushOpacity,
    strokeWidth,
    strokeColor,
    fillColor,
    cornerRadius,
    fontSize,
    textColor,
    fontFamily,
    fontWeight,
    fontStyle,
    textAlign,
    selectionInfo,
    isDirty,
    isInitializing,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoStack: history.undoStack,
    redoStack: history.redoStack,
    assetRefs,
  };

  // ─── Runtime ───

  const noopCapabilities: CanvasCapabilities = {
    deleteSelected() {},
    selectAll() {},
    resetView() {},
    collectObjectLayerData() {
      return new Map();
    },
    getSelectionInfo() {
      return { count: 0, singleObject: null, objectTypes: [], commonProps: {} };
    },
    updateSelectionProp() {},
    updateSelectionProps() {},
    alignSelection() {},
    distributeSelection() {},
    clearSelection() {},
    selectObjectById() {},
    reorderObjectsInLayer() {},
    reorderSelectedObject() {},
    async addImageToActiveLayer() {},
    createKonvaNode() {
      return null;
    },
    getZoom() {
      return 1;
    },
    getStage() {
      return null;
    },
    getCanvases() {
      return new Map();
    },
  };

  const runtime: EditorSessionRuntime = {
    stage: shallowRef(null),
    canvases: new Map(),
    capabilities: { ...noopCapabilities },
    registerCapabilities(caps: Partial<CanvasCapabilities>) {
      Object.assign(this.capabilities, caps);
    },
    historyApplicator: null,
    registerHistoryApplicator(fn) {
      this.historyApplicator = fn;
    },
  };

  // ─── Actions ───

  const actions: EditorSessionActions = {
    // 工具
    selectTool(tool: ToolType) {
      state.activeTool.value = tool;
    },

    updateBrush(data) {
      if (data.size !== undefined) state.brushSize.value = data.size;
      if (data.color !== undefined) state.brushColor.value = data.color;
      if (data.opacity !== undefined) state.brushOpacity.value = data.opacity;
    },

    updateShape(data) {
      if (data.strokeWidth !== undefined)
        state.strokeWidth.value = data.strokeWidth;
      if (data.strokeColor !== undefined)
        state.strokeColor.value = data.strokeColor;
      if (data.fillColor !== undefined) state.fillColor.value = data.fillColor;
      if (data.cornerRadius !== undefined)
        state.cornerRadius.value = data.cornerRadius;
    },

    updateText(data) {
      if (data.fontSize !== undefined) state.fontSize.value = data.fontSize;
      if (data.color !== undefined) state.textColor.value = data.color;
      if (data.fontFamily !== undefined)
        state.fontFamily.value = data.fontFamily;
      if (data.fontWeight !== undefined)
        state.fontWeight.value = data.fontWeight;
      if (data.fontStyle !== undefined) state.fontStyle.value = data.fontStyle;
      if (data.textAlign !== undefined) state.textAlign.value = data.textAlign;
    },

    // 图层
    addLayer(type, name?, options?) {
      return layerStack.addLayer(type, name, options);
    },

    deleteLayer(id) {
      return layerStack.deleteLayer(id);
    },

    toggleVisible(id) {
      layerStack.toggleVisible(id);
    },

    toggleLocked(id) {
      layerStack.toggleLocked(id);
    },

    reorderLayers(newOrder) {
      layerStack.reorderLayers(newOrder);
    },

    updateBackgroundLayer(layerId, fillColor) {
      const layer = state.layers.value.find((l) => l.id === layerId);
      if (!layer || layer.type !== "background") return;
      const before = { fillColor: layer.fillColor };
      const after = { fillColor };
      layer.fillColor = fillColor;
      actions.pushHistory({
        type: "layer-modify",
        layerId,
        before,
        after,
      });
    },

    // 历史
    pushHistory(entry) {
      history.pushEntry(entry);
      state.isDirty.value = true;

      // 同步对象图层数据模型（让 LayerPanel 实时显示对象列表）
      if (
        entry.type === "object-add" ||
        entry.type === "object-remove" ||
        entry.type === "object-reorder"
      ) {
        const objectData = runtime.capabilities.collectObjectLayerData();
        const objects = objectData.get(entry.layerId);
        if (objects) {
          layerStack.updateLayerObjects(entry.layerId, objects);
        }
      }
    },

    undo() {
      if (history.undoStack.value.length === 0) return;
      const entry = history.undoStack.value.pop()!;
      history.redoStack.value.push(entry);
      runtime.historyApplicator?.(entry, "undo");
      state.isDirty.value = true;
    },

    redo() {
      if (history.redoStack.value.length === 0) return;
      const entry = history.redoStack.value.pop()!;
      history.undoStack.value.push(entry);
      runtime.historyApplicator?.(entry, "redo");
      state.isDirty.value = true;
    },

    clearHistory() {
      history.clearHistory();
    },

    // 选择
    updateSelectionProp(key, value) {
      runtime.capabilities.updateSelectionProp(key, value);
      actions.refreshSelectionInfo();
    },

    updateSelectionProps(data) {
      runtime.capabilities.updateSelectionProps(data);
      actions.refreshSelectionInfo();
    },

    alignSelection(dir) {
      runtime.capabilities.alignSelection(dir);
      actions.refreshSelectionInfo();
    },

    distributeSelection(dir) {
      runtime.capabilities.distributeSelection(dir);
      actions.refreshSelectionInfo();
    },

    deleteSelected() {
      runtime.capabilities.deleteSelected();
    },

    refreshSelectionInfo() {
      const info = runtime.capabilities.getSelectionInfo();
      if (info) {
        state.selectionInfo.value = info;
      }
    },

    resetSelection() {
      runtime.capabilities.clearSelection();
      state.selectionInfo.value = {
        count: 0,
        singleObject: null,
        objectTypes: [],
        commonProps: {},
      };
      state.activeTool.value = "select";
    },

    // 编辑器
    markDirty() {
      state.isDirty.value = true;
    },

    applySettingsDefaults(s) {
      state.brushSize.value = s.defaultBrushSize;
      state.brushColor.value = s.defaultBrushColor;
      state.brushOpacity.value = s.defaultBrushOpacity;
      state.strokeWidth.value = s.defaultStrokeWidth;
      state.strokeColor.value = s.defaultStrokeColor;
      state.fillColor.value = s.defaultFillColor;
      state.cornerRadius.value = s.defaultCornerRadius;
      state.fontSize.value = s.defaultFontSize;
      state.textColor.value = s.defaultTextColor;
      state.fontFamily.value = s.defaultFontFamily || "sans-serif";
    },

    // 图层内部操作
    replaceLayer(oldId, newLayer) {
      return layerStack.replaceLayer(oldId, newLayer);
    },

    updateLayerObjects(layerId, objects) {
      layerStack.updateLayerObjects(layerId, objects);
    },

    clearLayers() {
      layerStack.clearLayers();
    },
  };

  return { id, state, runtime, actions };
}
