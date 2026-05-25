<template>
  <div class="sketch-pad-tool">
    <!-- 1. 草图列表界面 -->
    <SketchGallery
      v-if="currentView === 'gallery'"
      :projects="projects"
      @select-project="handleSelectProject"
      @create-project="handleCreateProject"
      @delete-project="handleDeleteProject"
      @rename-project="handleRenameProject"
      @import-project="handleImportProject"
      @refresh="syncIndex"
      @open-settings="showSettings = true"
    />

    <!-- 2. 编辑界面 -->
    <div v-else class="editor-container">
      <!-- 画布区域（底层，占满） -->
      <KonvaCanvas
        ref="canvasRef"
        :width="currentProject?.width || 1920"
        :height="currentProject?.height || 1080"
        v-model:layers="layers"
        :active-layer-id="activeLayerId"
        :active-tool="activeTool"
        :brush-size="brushSize"
        :brush-color="brushColor"
        :brush-opacity="brushOpacity"
        :stroke-width="strokeWidth"
        :stroke-color="strokeColor"
        :fill-color="fillColor"
        :corner-radius="cornerRadius"
        :font-size="fontSize"
        :text-color="textColor"
        :font-weight="fontWeight"
        :font-style="fontStyle"
        :text-align="textAlign"
        @push-history="pushHistory"
        @selection-change="handleSelectionChange"
        @switch-layer="handleSelectLayer"
      />

      <!-- 悬浮工具栏（顶部居中） -->
      <Toolbar
        :active-tool="activeTool"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :is-dirty="isDirty"
        @back="goBack"
        @select-tool="handleSelectTool"
        @undo="handleUndo"
        @redo="handleRedo"
        @reset-view="handleResetView"
        @save="handleSave"
        @export="handleExport"
        @send-to-chat="handleSendToChat"
        @import-image="handleImportImage"
      />

      <!-- 悬浮属性面板（左下角） -->
      <PropertyPanel
        :active-tool="activeTool"
        :brush-size="brushSize"
        :brush-color="brushColor"
        :brush-opacity="brushOpacity"
        :stroke-width="strokeWidth"
        :stroke-color="strokeColor"
        :fill-color="fillColor"
        :corner-radius="cornerRadius"
        :font-size="fontSize"
        :text-color="textColor"
        :has-selection="hasSelection"
        :selected-nodes-count="selectedNodesCount"
        @update:brush="updateBrush"
        @update:shape="updateShape"
        @update:text="updateText"
        @update:selection="updateSelection"
        @delete-selected="deleteSelected"
      />

      <!-- 悬浮图层面板（右下角） -->
      <LayerPanel
        :layers="layers"
        :active-layer-id="activeLayerId"
        @create-layer="handleCreateLayer"
        @delete-layer="handleDeleteLayer"
        @select-layer="handleSelectLayer"
        @toggle-visible="toggleVisible"
        @toggle-locked="toggleLocked"
        @reorder-layers="handleReorderLayers"
        @merge-down="handleMergeDown"
        @rasterize-layer="handleRasterizeLayer"
      />
    </div>

    <!-- 设置对话框（不参与 v-if/v-else 链） -->
    <SketchSettingsDialog v-model="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import SketchGallery from "./components/SketchGallery.vue";
import Toolbar from "./components/Toolbar.vue";
import KonvaCanvas from "./components/KonvaCanvas.vue";
import PropertyPanel from "./components/PropertyPanel.vue";
import LayerPanel from "./components/LayerPanel.vue";
import SketchSettingsDialog from "./components/SketchSettingsDialog.vue";

import { useLayerStack } from "./composables/useLayerStack";
import { useHybridHistory, type HistoryEntry } from "./composables/useHybridHistory";
import { useSketchStorage } from "./composables/useSketchStorage";
import { useSketchSettings } from "./composables/useSketchSettings";
import { useSendSketchToChat } from "./composables/useSendSketchToChat";
import { useImageAsset } from "./composables/useImageAsset";
import { packageSketch, unpackageSketch } from "./core/sketch-packager";
import type { SketchProject, AssetRef } from "./types";
import { generateDefaultSketchName, type ToolType } from "./constants";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import { nanoid } from "nanoid";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import Konva from "konva";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad");

const currentView = ref<"gallery" | "editor">("gallery");
const currentProject = ref<SketchProject | null>(null);
const canvasRef = ref<any>(null);

// 引入 Composables
const {
  layers,
  activeLayerId,
  activeLayer,
  addLayer,
  deleteLayer,
  toggleVisible,
  toggleLocked,
  reorderLayers,
  clearLayers,
  replaceLayer,
  updateLayerObjects,
} = useLayerStack();

const { undoStack, redoStack, canUndo, canRedo, pushEntry, clearHistory } = useHybridHistory();
const { projects, loadIndex, syncIndex, saveProject, loadProject, loadRasterLayers, deleteProject } =
  useSketchStorage();
const { settings: sketchSettings, loadSettings: loadSketchSettings } = useSketchSettings();
const { sendToChat } = useSendSketchToChat();
const { importImageFromDialog } = useImageAsset();

// 资产引用表（当前工程的图片资产引用）
const assetRefs = ref<AssetRef[]>([]);

// 设置对话框
const showSettings = ref(false);

// 属性状态（初始值将在 onMounted 中从设置加载）
const activeTool = ref<ToolType>("select");
const brushSize = ref(5);
const brushColor = ref("#ff4d4f");
const brushOpacity = ref(1);

const strokeWidth = ref(2);
const strokeColor = ref("#40a9ff");
const fillColor = ref<string | null>(null);
const cornerRadius = ref(0);

const fontSize = ref(24);
const textColor = ref("#000000");
const fontWeight = ref<"normal" | "bold">("normal");
const fontStyle = ref<"normal" | "italic">("normal");
const textAlign = ref<"left" | "center" | "right">("left");

// 选择状态
const hasSelection = ref(false);
const selectedNodesCount = ref(0);

// 脏状态 & 自动保存
const isDirty = ref(false);
const isInitializing = ref(false); // 初始化守卫：加载/创建项目期间跳过 dirty 标记
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  // 加载画板设置
  await loadSketchSettings();
  applySettingsDefaults();

  await syncIndex();

  // 绑定全局快捷键
  window.addEventListener("keydown", handleGlobalKeyDown);

  // 启动自动保存定时器
  startAutoSaveTimer();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeyDown);
  stopAutoSaveTimer();
});

/** 从设置中应用默认属性值 */
function applySettingsDefaults() {
  const s = sketchSettings.value;
  brushSize.value = s.defaultBrushSize;
  brushColor.value = s.defaultBrushColor;
  brushOpacity.value = s.defaultBrushOpacity;
  strokeWidth.value = s.defaultStrokeWidth;
  strokeColor.value = s.defaultStrokeColor;
  fillColor.value = s.defaultFillColor;
  cornerRadius.value = s.defaultCornerRadius;
  fontSize.value = s.defaultFontSize;
  textColor.value = s.defaultTextColor;
}

/** 启动自动保存定时器 */
function startAutoSaveTimer() {
  stopAutoSaveTimer();
  if (!sketchSettings.value.autoSaveEnabled) return;
  const intervalMs = sketchSettings.value.autoSaveInterval * 1000;
  autoSaveTimer = setInterval(() => {
    if (isDirty.value && currentProject.value && canvasRef.value) {
      handleAutoSave();
    }
  }, intervalMs);
}

/** 停止自动保存定时器 */
function stopAutoSaveTimer() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// ─── 快捷键系统 ───
function handleGlobalKeyDown(e: KeyboardEvent) {
  // 文本编辑状态下，只保留带修饰键的快捷键
  const isTextEditing = document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT";

  // 带修饰键的快捷键（始终生效）
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "s":
        e.preventDefault();
        if (e.shiftKey) {
          handleIncrementalSave();
        } else {
          handleSave();
        }
        return;
      case "z":
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      case "y":
        e.preventDefault();
        handleRedo();
        return;
      case "a":
        if (currentView.value === "editor" && !isTextEditing) {
          e.preventDefault();
          canvasRef.value?.selectAll();
        }
        return;
      case "0":
        e.preventDefault();
        handleResetView();
        return;
      case "=":
      case "+":
        e.preventDefault();
        handleZoomStep(0.1);
        return;
      case "-":
        e.preventDefault();
        handleZoomStep(-0.1);
        return;
    }
    return;
  }

  // 单字母快捷键（文本编辑时不生效）
  if (isTextEditing) return;
  if (currentView.value !== "editor") return;

  switch (e.key.toLowerCase()) {
    case "v":
      activeTool.value = "select";
      break;
    case "h":
      activeTool.value = "hand";
      break;
    case "b":
      activeTool.value = "pencil";
      break;
    case "m":
      activeTool.value = "marker";
      break;
    case "e":
      activeTool.value = "eraser";
      break;
    case "r":
      activeTool.value = "rect";
      break;
    case "o":
      activeTool.value = "ellipse";
      break;
    case "l":
      activeTool.value = "line";
      break;
    case "a":
      activeTool.value = "arrow";
      break;
    case "t":
      activeTool.value = "text";
      break;
    case "delete":
    case "backspace":
      deleteSelected();
      break;
  }
}

function handleZoomStep(delta: number) {
  if (!canvasRef.value) return;
  const currentZoom = canvasRef.value.getZoom?.() || 1;
  const newZoom = Math.max(0.1, Math.min(30, currentZoom + delta));
  const stage = canvasRef.value.getStage();
  if (stage) {
    stage.scale({ x: newZoom, y: newZoom });
    stage.batchDraw();
  }
}

async function handleAutoSave() {
  if (!currentProject.value || !canvasRef.value) return;
  const stage = canvasRef.value.getStage();
  const canvases = canvasRef.value.getCanvases();
  if (stage) {
    // 自动保存前也需要同步矢量数据
    syncObjectLayersBeforeSave();

    currentProject.value.updatedAt = new Date().toISOString();
    await saveProject(currentProject.value, layers.value, canvases, stage, assetRefs.value);
    isDirty.value = false;
  }
}

// 标记脏状态
watch(
  layers,
  () => {
    if (currentView.value === "editor" && !isInitializing.value) {
      isDirty.value = true;
    }
  },
  { deep: true },
);

// 智能图层切换提示
watch(activeTool, (newTool) => {
  if (!activeLayer.value) return;

  if (["pencil", "marker", "eraser"].includes(newTool) && activeLayer.value.type !== "raster") {
    if (sketchSettings.value.showToolSwitchHint) {
      customMessage.info("提示：画笔工具需要位图图层，已自动为您切换/创建位图图层");
    }
    // 寻找最近的位图图层
    const rasterLayer = layers.value.find((l) => l.type === "raster");
    if (rasterLayer) {
      activeLayerId.value = rasterLayer.id;
    } else {
      handleCreateLayer("raster");
    }
  } else if (["rect", "ellipse", "line", "arrow", "text"].includes(newTool) && activeLayer.value.type !== "object") {
    if (sketchSettings.value.showToolSwitchHint) {
      customMessage.info("提示：形状/文字工具需要对象图层，已自动为您切换/创建对象图层");
    }
    // 寻找最近的对象图层
    const objectLayer = layers.value.find((l) => l.type === "object");
    if (objectLayer) {
      activeLayerId.value = objectLayer.id;
    } else {
      handleCreateLayer("object");
    }
  }
});

// 1. 列表界面交互
async function handleSelectProject(id: string) {
  const manifest = await loadProject(id);
  if (manifest) {
    isInitializing.value = true;
    currentProject.value = manifest.project;
    layers.value = manifest.layers;
    assetRefs.value = manifest.assetRefs || [];
    if (manifest.layers.length > 0) {
      activeLayerId.value = manifest.layers[0].id;
    }
    clearHistory();
    currentView.value = "editor";

    // 等待 DOM 更新和 watch 回调执行完毕后解除初始化守卫
    await nextTick();
    isInitializing.value = false;
    isDirty.value = false;

    // 加载位图图层的像素数据并绘制到 canvas 上
    const rasterData = await loadRasterLayers(id, manifest.layers);
    if (rasterData.size > 0) {
      // 等待 canvas 创建完成（syncLayers 由 watch 触发）
      setTimeout(() => {
        if (!canvasRef.value) return;
        const canvases = canvasRef.value.getCanvases();
        rasterData.forEach((data, layerId) => {
          const canvas = canvases.get(layerId);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const blob = new Blob([data], { type: "image/png" });
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                canvasRef.value?.getStage()?.batchDraw();
              };
              img.src = url;
            }
          }
        });
      }, 100);
    }
  }
}

async function handleCreateProject(data: {
  name: string;
  width: number;
  height: number;
  createBackgroundLayer: boolean;
  backgroundLayerColor: string | null;
}) {
  isInitializing.value = true;

  const newProj: SketchProject = {
    id: nanoid(),
    name: data.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    width: data.width,
    height: data.height,
  };

  currentProject.value = newProj;
  clearLayers();
  clearHistory();
  assetRefs.value = [];

  // 根据弹窗设定 + 全局设置创建默认图层
  const s = sketchSettings.value;
  let firstLayerId = "";

  if (data.createBackgroundLayer) {
    const raster = addLayer("raster", s.backgroundLayerName || "背景涂鸦");
    firstLayerId = raster.id;
  }
  if (s.createObjectLayer) {
    const obj = addLayer("object", s.objectLayerName || "矢量标注");
    if (!firstLayerId) firstLayerId = obj.id;
  }

  // 如果两个都没创建，至少创建一个位图图层
  if (!firstLayerId) {
    const fallback = addLayer("raster", "图层 1");
    firstLayerId = fallback.id;
  }

  activeLayerId.value = firstLayerId;
  currentView.value = "editor";

  // 等待 DOM 更新和 watch 回调执行完毕后解除初始化守卫
  await nextTick();
  isInitializing.value = false;
  isDirty.value = false;

  // 如果创建了背景图层且设置了背景色，在 canvas 就绪后填充
  if (data.createBackgroundLayer && data.backgroundLayerColor) {
    const bgLayerId = firstLayerId;
    const bgColor = data.backgroundLayerColor;
    setTimeout(() => {
      fillBackgroundLayer(bgLayerId, bgColor);
    }, 100);
  }
}

/** 为背景位图图层填充纯色 */
function fillBackgroundLayer(layerId: string, color: string) {
  if (!canvasRef.value) return;
  const canvases = canvasRef.value.getCanvases();
  const canvas = canvases.get(layerId);
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvasRef.value.getStage()?.batchDraw();
    }
  }
}

async function handleDeleteProject(id: string) {
  const success = await deleteProject(id);
  if (success) {
    customMessage.success("删除成功");
    await loadIndex();
  }
}

async function handleRenameProject(id: string, newName: string) {
  const index = projects.value.findIndex((p) => p.id === id);
  if (index !== -1) {
    projects.value[index].name = newName;
    projects.value[index].updatedAt = new Date().toISOString();
    // 保存项目 manifest
    const manifest = await loadProject(id);
    if (manifest) {
      manifest.project.name = newName;
      manifest.project.updatedAt = new Date().toISOString();
      // 重新保存
      if (canvasRef.value) {
        const stage = canvasRef.value.getStage();
        const canvases = canvasRef.value.getCanvases();
        if (stage) {
          await saveProject(manifest.project, manifest.layers, canvases, stage);
        }
      }
    }
    await loadIndex();
    customMessage.success("重命名成功");
  }
}

async function handleImportProject(bytes: Uint8Array) {
  const unpacked = await unpackageSketch(bytes);
  if (unpacked) {
    isInitializing.value = true;
    const { manifest, rasterLayers } = unpacked;
    // 生成新 ID 避免冲突
    manifest.project.id = nanoid();
    manifest.project.name = `${manifest.project.name} (导入)`;
    manifest.project.createdAt = new Date().toISOString();
    manifest.project.updatedAt = new Date().toISOString();

    currentProject.value = manifest.project;
    layers.value = manifest.layers;
    if (manifest.layers.length > 0) {
      activeLayerId.value = manifest.layers[0].id;
    }
    clearHistory();
    currentView.value = "editor";

    // 解除初始化守卫
    await nextTick();
    isInitializing.value = false;
    isDirty.value = false;

    // 写入解包后的位图数据到 Canvas
    setTimeout(() => {
      if (canvasRef.value) {
        const canvases = canvasRef.value.getCanvases();
        rasterLayers.forEach((data, layerId) => {
          const canvas = canvases.get(layerId);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const blob = new Blob([data], { type: "image/png" });
              const img = new Image();
              img.onload = () => {
                ctx.drawImage(img, 0, 0);
                canvasRef.value.getStage()?.batchDraw();
              };
              img.src = URL.createObjectURL(blob);
            }
          }
        });
      }
    }, 100);

    customMessage.success("导入成功");
  }
}

// 2. 编辑界面交互
async function goBack() {
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm("当前草图有未保存的更改，是否保存后退出？", "提示", {
        confirmButtonText: "保存并退出",
        cancelButtonText: "直接退出",
        distinguishCancelAndClose: true,
        type: "warning",
        lockScroll: false,
      });
      await handleSave();
    } catch (action) {
      if (action !== "cancel") {
        // 用户点击了关闭或遮罩层，留在编辑页面
        return;
      }
    }
  }
  currentView.value = "gallery";
  currentProject.value = null;
  clearLayers();
  clearHistory();
  assetRefs.value = [];
  isDirty.value = false;
}

function handleSelectTool(tool: ToolType) {
  activeTool.value = tool;
}

function handleResetView() {
  canvasRef.value?.resetView();
}

/**
 * 保存前同步矢量图层数据：从 Konva 运行时节点序列化回 layers 数据模型
 */
function syncObjectLayersBeforeSave() {
  if (!canvasRef.value) return;
  const objectData = canvasRef.value.collectObjectLayerData();
  if (!objectData) return;

  for (const [layerId, objects] of objectData) {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer && layer.type === "object") {
      layer.objects = objects;
    }
  }
}

async function handleSave() {
  if (!currentProject.value || !canvasRef.value) return;

  const stage = canvasRef.value.getStage();
  const canvases = canvasRef.value.getCanvases();

  if (stage) {
    // 保存前同步矢量图层数据
    syncObjectLayersBeforeSave();

    currentProject.value.updatedAt = new Date().toISOString();
    const success = await saveProject(currentProject.value, layers.value, canvases, stage, assetRefs.value);
    if (success) {
      isDirty.value = false;
      customMessage.success("保存成功");
      await loadIndex();
    }
  }
}

async function handleIncrementalSave() {
  if (!currentProject.value || !canvasRef.value) return;

  // 先保存当前项目
  await handleSave();

  // 创建副本
  const newProj: SketchProject = {
    id: nanoid(),
    name: `${currentProject.value.name} (副本)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    width: currentProject.value.width,
    height: currentProject.value.height,
  };

  const stage = canvasRef.value.getStage();
  const canvases = canvasRef.value.getCanvases();

  if (stage) {
    const success = await saveProject(newProj, layers.value, canvases, stage, assetRefs.value);
    if (success) {
      currentProject.value = newProj;
      isDirty.value = false;
      customMessage.success("增量保存成功（已创建副本）");
      await loadIndex();
    }
  }
}

async function handleExport() {
  if (!currentProject.value || !canvasRef.value) return;

  const stage = canvasRef.value.getStage();
  const canvases = canvasRef.value.getCanvases();

  if (stage) {
    // 导出前同步矢量图层数据
    syncObjectLayersBeforeSave();

    const bytes = await packageSketch(currentProject.value, layers.value, canvases, stage);
    if (bytes) {
      const filePath = await save({
        filters: [{ name: "AIO Hub Sketch File", extensions: ["aiosk"] }],
        defaultPath: `${currentProject.value.name}.aiosk`,
      });

      if (filePath) {
        await writeFile(filePath, bytes);
        customMessage.success("导出成功");
      }
    }
  }
}

async function handleSendToChat() {
  if (!canvasRef.value) return;
  const stage = canvasRef.value.getStage();
  if (stage) {
    await sendToChat(stage, currentProject.value?.name || generateDefaultSketchName());
  }
}

// 属性更新
function updateBrush(data: { size?: number; color?: string; opacity?: number }) {
  if (data.size !== undefined) brushSize.value = data.size;
  if (data.color !== undefined) brushColor.value = data.color;
  if (data.opacity !== undefined) brushOpacity.value = data.opacity;
}

function updateShape(data: {
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string | null;
  cornerRadius?: number;
}) {
  if (data.strokeWidth !== undefined) strokeWidth.value = data.strokeWidth;
  if (data.strokeColor !== undefined) strokeColor.value = data.strokeColor;
  if (data.fillColor !== undefined) fillColor.value = data.fillColor;
  if (data.cornerRadius !== undefined) cornerRadius.value = data.cornerRadius;
}

function updateText(data: {
  fontSize?: number;
  color?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
}) {
  if (data.fontSize !== undefined) fontSize.value = data.fontSize;
  if (data.color !== undefined) textColor.value = data.color;
  if (data.fontWeight !== undefined) fontWeight.value = data.fontWeight;
  if (data.fontStyle !== undefined) fontStyle.value = data.fontStyle;
  if (data.textAlign !== undefined) textAlign.value = data.textAlign;
}

function updateSelection(data: { color?: string; strokeWidth?: number }) {
  if (data.color) canvasRef.value?.updateSelectionColor(data.color);
  if (data.strokeWidth) canvasRef.value?.updateSelectionStrokeWidth(data.strokeWidth);
}

function deleteSelected() {
  canvasRef.value?.deleteSelected();
}

// ─── 图片导入 ───
async function handleImportImage() {
  const context = { assetRefs: assetRefs.value };
  const imageObj = await importImageFromDialog(context);
  if (imageObj && canvasRef.value) {
    // 确保当前有对象图层
    const activeLayerData = activeLayer.value;
    if (!activeLayerData || activeLayerData.type !== "object") {
      // 自动切换到对象图层或创建一个
      const objectLayer = layers.value.find((l) => l.type === "object");
      if (objectLayer) {
        activeLayerId.value = objectLayer.id;
      } else {
        const newLayer = addLayer("object", "图片图层");
        activeLayerId.value = newLayer.id;
      }
    }

    await canvasRef.value.addImageToActiveLayer(imageObj);
    isDirty.value = true;
  }
}

// 历史记录
function pushHistory(entry: HistoryEntry) {
  pushEntry(entry);
  isDirty.value = true;
}

function handleUndo() {
  if (undoStack.value.length === 0) return;

  const entry = undoStack.value.pop()!;
  redoStack.value.push(entry);

  applyHistoryEntry(entry, "undo");
  isDirty.value = true;
}

function handleRedo() {
  if (redoStack.value.length === 0) return;

  const entry = redoStack.value.pop()!;
  undoStack.value.push(entry);

  applyHistoryEntry(entry, "redo");
  isDirty.value = true;
}

function applyHistoryEntry(entry: HistoryEntry, direction: "undo" | "redo") {
  if (!canvasRef.value) return;

  const stage = canvasRef.value.getStage();
  const canvases = canvasRef.value.getCanvases();

  switch (entry.type) {
    case "raster-pixels": {
      const canvas = canvases.get(entry.layerId);
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        const imgData = direction === "undo" ? entry.before : entry.after;
        ctx.putImageData(imgData, 0, 0);
        stage?.batchDraw();
      }
      break;
    }

    case "object-add": {
      const konvaLayer = stage?.findOne(`#${entry.layerId}`) as Konva.Layer;
      if (konvaLayer) {
        if (direction === "undo") {
          const node = konvaLayer.findOne(`#${entry.object.id}`);
          node?.destroy();
        } else {
          const node = canvasRef.value.createKonvaNode(entry.object);
          konvaLayer.add(node);
        }
        stage?.batchDraw();
      }
      break;
    }

    case "object-remove": {
      const konvaLayer = stage?.findOne(`#${entry.layerId}`) as Konva.Layer;
      if (konvaLayer) {
        if (direction === "undo") {
          const node = canvasRef.value.createKonvaNode(entry.object);
          konvaLayer.add(node);
        } else {
          const node = konvaLayer.findOne(`#${entry.object.id}`);
          node?.destroy();
        }
        stage?.batchDraw();
      }
      break;
    }

    case "object-modify": {
      const konvaLayer = stage?.findOne(`#${entry.layerId}`) as Konva.Layer;
      if (konvaLayer) {
        const node = konvaLayer.findOne(`#${entry.objectId}`) as Konva.Shape;
        if (node) {
          const attrs = direction === "undo" ? entry.before : entry.after;
          // 将 null 值转换为 undefined 以兼容 Konva 的类型系统
          const konvaAttrs: Record<string, any> = {};
          for (const [key, value] of Object.entries(attrs)) {
            konvaAttrs[key] = value === null ? undefined : value;
          }
          node.setAttrs(konvaAttrs);
          stage?.batchDraw();
        }
      }
      break;
    }

    case "object-reorder": {
      const konvaLayer = stage?.findOne(`#${entry.layerId}`) as Konva.Layer;
      if (konvaLayer) {
        const order = direction === "undo" ? entry.before : entry.after;
        order.forEach((id, idx) => {
          const node = konvaLayer.findOne(`#${id}`);
          if (node) node.zIndex(idx);
        });
        stage?.batchDraw();
      }
      break;
    }

    case "layer-add": {
      if (direction === "undo") {
        deleteLayer(entry.layer.id);
      } else {
        layers.value.splice(entry.index, 0, entry.layer);
        activeLayerId.value = entry.layer.id;
      }
      break;
    }

    case "layer-remove": {
      if (direction === "undo") {
        layers.value.splice(entry.index, 0, entry.layer);
        activeLayerId.value = entry.layer.id;
        if (entry.layer.type === "raster" && entry.imageData) {
          setTimeout(() => {
            const canvas = canvases.get(entry.layer.id);
            if (canvas) {
              const ctx = canvas.getContext("2d");
              if (ctx && entry.imageData) {
                ctx.putImageData(entry.imageData, 0, 0);
                stage?.batchDraw();
              }
            }
          }, 50);
        }
      } else {
        deleteLayer(entry.layer.id);
      }
      break;
    }

    case "layer-reorder": {
      const order = direction === "undo" ? entry.before : entry.after;
      reorderLayers(order);
      break;
    }

    case "layer-modify": {
      const layer = layers.value.find((l) => l.id === entry.layerId);
      if (layer) {
        const attrs = direction === "undo" ? entry.before : entry.after;
        Object.assign(layer, attrs);
      }
      break;
    }

    case "layer-rasterize": {
      if (direction === "undo") {
        replaceLayer(entry.afterLayer.id, entry.beforeLayer);
      } else {
        replaceLayer(entry.layerId, entry.afterLayer);
        setTimeout(() => {
          const canvas = canvases.get(entry.afterLayer.id);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx && entry.imageData) {
              ctx.putImageData(entry.imageData, 0, 0);
              stage?.batchDraw();
            }
          }
        }, 50);
      }
      break;
    }
  }
}

function handleSelectionChange(count: number) {
  selectedNodesCount.value = count;
  hasSelection.value = count > 0;
}

// 图层操作
function handleCreateLayer(type: "raster" | "object") {
  logger.debug("handleCreateLayer", {
    type,
    currentLayerCount: layers.value.length,
    currentActiveLayerId: activeLayerId.value,
    currentActiveLayerIndex: layers.value.findIndex((l) => l.id === activeLayerId.value),
  });
  addLayer(type);
}

function handleDeleteLayer(id: string) {
  logger.debug("handleDeleteLayer", { id });
  deleteLayer(id);
}

function handleSelectLayer(id: string) {
  logger.debug("handleSelectLayer", {
    newId: id,
    oldId: activeLayerId.value,
    layerExists: layers.value.some((l) => l.id === id),
  });
  activeLayerId.value = id;
}

function handleReorderLayers(newOrder: string[]) {
  logger.debug("handleReorderLayers", { newOrder });
  reorderLayers(newOrder);
}

async function handleRasterizeLayer(id: string) {
  if (!canvasRef.value) return;
  const stage = canvasRef.value.getStage();
  if (!stage) return;

  const layerIndex = layers.value.findIndex((l) => l.id === id);
  if (layerIndex === -1) return;

  const oldLayer = layers.value[layerIndex];
  if (oldLayer.type !== "object") return;

  const konvaLayer = stage.findOne(`#${id}`) as Konva.Layer;
  if (!konvaLayer) return;

  // 1. 导出当前图层为 DataURL
  const dataUrl = konvaLayer.toDataURL({ pixelRatio: 1 });

  // 2. 创建新的位图图层
  const newLayer = {
    id: nanoid(),
    type: "raster" as const,
    name: `${oldLayer.name} (栅格化)`,
    visible: oldLayer.visible,
    locked: oldLayer.locked,
    opacity: oldLayer.opacity,
    blendMode: oldLayer.blendMode,
    imagePath: `layers/${nanoid()}.png`,
    imageFormat: "png" as const,
  };

  // 3. 替换图层
  replaceLayer(id, newLayer);

  // 4. 将导出的图片绘制到新创建的 Canvas 上，并记录历史
  setTimeout(() => {
    const canvases = canvasRef.value.getCanvases();
    const canvas = canvases.get(newLayer.id);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          stage.batchDraw();

          // 获取 ImageData 用于撤销/重做
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // 5. 记录历史
          pushHistory({
            type: "layer-rasterize",
            layerId: id,
            beforeLayer: oldLayer as any,
            afterLayer: newLayer,
            imageData: imgData,
          });
        };
        img.src = dataUrl;
      }
    }
  }, 50);

  customMessage.success("图层栅格化成功");
}

async function handleMergeDown(id: string) {
  if (!canvasRef.value) return;
  const stage = canvasRef.value.getStage();
  if (!stage) return;

  const upperIndex = layers.value.findIndex((l) => l.id === id);
  if (upperIndex === -1 || upperIndex === layers.value.length - 1) return;

  const lowerIndex = upperIndex + 1;
  const upperLayer = layers.value[upperIndex];
  const lowerLayer = layers.value[lowerIndex];

  const upperKonvaLayer = stage.findOne(`#${upperLayer.id}`) as Konva.Layer;
  const lowerKonvaLayer = stage.findOne(`#${lowerLayer.id}`) as Konva.Layer;

  if (!upperKonvaLayer || !lowerKonvaLayer) return;

  // 1. Raster + Raster
  if (upperLayer.type === "raster" && lowerLayer.type === "raster") {
    const canvases = canvasRef.value.getCanvases();
    const upperCanvas = canvases.get(upperLayer.id);
    const lowerCanvas = canvases.get(lowerLayer.id);

    if (upperCanvas && lowerCanvas) {
      const lowerCtx = lowerCanvas.getContext("2d");
      if (lowerCtx) {
        lowerCtx.save();
        lowerCtx.globalAlpha = upperLayer.opacity;
        lowerCtx.globalCompositeOperation = upperLayer.blendMode;
        lowerCtx.drawImage(upperCanvas, 0, 0);
        lowerCtx.restore();

        // 删除上层
        deleteLayer(upperLayer.id);
        stage.batchDraw();
        customMessage.success("图层合并成功");
      }
    }
  }
  // 2. Object + Raster
  else if (upperLayer.type === "object" && lowerLayer.type === "raster") {
    const canvases = canvasRef.value.getCanvases();
    const lowerCanvas = canvases.get(lowerLayer.id);

    if (lowerCanvas) {
      const lowerCtx = lowerCanvas.getContext("2d");
      if (lowerCtx) {
        const dataUrl = upperKonvaLayer.toDataURL({ pixelRatio: 1 });
        const img = new Image();
        img.onload = () => {
          lowerCtx.save();
          lowerCtx.globalAlpha = upperLayer.opacity;
          lowerCtx.globalCompositeOperation = upperLayer.blendMode;
          lowerCtx.drawImage(img, 0, 0);
          lowerCtx.restore();

          // 删除上层
          deleteLayer(upperLayer.id);
          stage.batchDraw();
          customMessage.success("图层合并成功");
        };
        img.src = dataUrl;
      }
    }
  }
  // 3. Raster + Object (不支持)
  else if (upperLayer.type === "raster" && lowerLayer.type === "object") {
    customMessage.warning("不支持将位图图层合并到对象图层，请先将对象图层栅格化，或者调整图层顺序");
  }
  // 4. Object + Object
  else if (upperLayer.type === "object" && lowerLayer.type === "object") {
    // 将上层的所有 Konva 节点移动到下层
    const children = [...upperKonvaLayer.getChildren()];
    children.forEach((node) => {
      if (node.name() === "object-node") {
        node.moveTo(lowerKonvaLayer);
      }
    });

    // 合并两者的 objects 数据
    const mergedObjects = [...lowerLayer.objects, ...upperLayer.objects];
    updateLayerObjects(lowerLayer.id, mergedObjects);

    // 删除上层
    deleteLayer(upperLayer.id);
    stage.batchDraw();
    customMessage.success("图层合并成功");
  }
}
</script>

<style scoped>
.sketch-pad-tool {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
}
</style>
