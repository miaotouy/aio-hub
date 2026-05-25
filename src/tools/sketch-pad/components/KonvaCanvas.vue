<template>
  <div
    ref="containerRef"
    class="canvas-container"
    :style="canvasContainerStyle"
    @contextmenu.prevent="handleContextMenu"
  >
    <!-- Konva Stage 专用容器，与 Vue 管理的覆盖层分离 -->
    <div ref="stageRef" class="konva-stage-container"></div>

    <!-- 文本编辑覆盖层 -->
    <TextEditor
      v-if="isEditingText"
      v-model="textValue"
      :style="textareaStyle"
      :auto-width="isTextAutoWidth"
      @blur="finishTextEditing"
      @submit="finishTextEditing"
    />

    <!-- 右键上下文菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ top: contextMenuPos.y + 'px', left: contextMenuPos.x + 'px' }"
    >
      <template v-if="contextMenuTarget">
        <div class="context-menu-item" @click="contextCopy">复制</div>
        <div class="context-menu-item" @click="contextDelete">删除</div>
        <div class="context-menu-divider" />
        <div class="context-menu-item" @click="contextMoveToTop">置顶</div>
        <div class="context-menu-item" @click="contextMoveToBottom">置底</div>
        <div class="context-menu-divider" />
        <div class="context-menu-item" @click="contextToggleLock">
          {{ contextMenuTarget.draggable() ? "锁定" : "解锁" }}
        </div>
      </template>
      <template v-else>
        <div class="context-menu-item" @click="contextPaste">粘贴</div>
        <div class="context-menu-item" @click="contextResetView">重置视图</div>
      </template>
    </div>

    <!-- 底部状态栏 -->
    <div class="bottom-bar">
      <button
        class="bar-btn"
        :class="{ active: showCanvasBorder }"
        title="显示/隐藏画布边界"
        @click="toggleCanvasBorder"
      >
        <SquareDashed :size="15" />
      </button>
      <span class="zoom-value" @click="handleZoomClick">{{ zoomPercent }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch, onUnmounted, nextTick } from "vue";
import Konva from "konva";
import { nanoid } from "nanoid";
import { SquareDashed } from "lucide-vue-next";
import { useSketchSettings } from "../composables/useSketchSettings";
import { useKonvaStage } from "../composables/useKonvaStage";
import { useRasterBrush } from "../composables/useRasterBrush";
import { useObjectLayer } from "../composables/useObjectLayer";
import { useTransformer } from "../composables/useTransformer";
import { useTextEditing } from "../composables/useTextEditing";
import { useImageAsset } from "../composables/useImageAsset";
import type { HybridLayer, SketchObject, ImageObject, SelectionInfo } from "../types";
import type { ToolType } from "../constants";
import TextEditor from "./TextEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/KonvaCanvas");

const props = defineProps<{
  width: number;
  height: number;
  layers: HybridLayer[];
  activeLayerId: string;
  activeTool: ToolType;
  brushSize: number;
  brushColor: string;
  brushOpacity: number;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string | null;
  cornerRadius: number;
  fontSize: number;
  textColor: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
}>();

const emit = defineEmits<{
  (e: "update:layers", layers: HybridLayer[]): void;
  (e: "push-history", entry: any): void;
  (e: "selection-change", info: SelectionInfo): void;
  (e: "switch-layer", layerId: string): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const stageRef = ref<HTMLDivElement | null>(null);
const canvases = new Map<string, HTMLCanvasElement>(); // layerId -> canvas

// 引入 Composables
const { settings: sketchSettings } = useSketchSettings();
const { stage, zoom, panX, panY, initStage, resetView } = useKonvaStage();
const { isDrawing, startDrawing, draw, stopDrawing } = useRasterBrush();
const { createKonvaNode, serializeKonvaNode } = useObjectLayer();
const { selectedNodes, initTransformer, selectNodes, clearSelection, handleStageClick } = useTransformer();
const {
  isEditing: isEditingText,
  isAutoWidth: isTextAutoWidth,
  textValue,
  textareaStyle,
  startEditing,
  stopEditing,
  getEditingNode,
} = useTextEditing();
const { loadImageNode } = useImageAsset();

// 缩放百分比显示
const zoomPercent = computed(() => Math.round(zoom.value * 100));

// 棋盘格透明度（从设置中读取）
const canvasContainerStyle = computed(() => ({
  "--checker-opacity": String(sketchSettings.value.checkerOpacity),
}));

// 临时绘制形状的状态
let tempShape: Konva.Shape | null = null;
let startPoint = { x: 0, y: 0 };

// 文本工具拖拽创建状态
let pendingTextCreate = false;
let textDragStart = { x: 0, y: 0 };
let textDragRect: Konva.Rect | null = null;
let isTextDragging = false;
const TEXT_DRAG_THRESHOLD = 6; // 拖拽阈值（像素）

// 新创建的文本节点标记（用于区分新建 vs 编辑已有）
const pendingNewTextNodes = new Set<string>();

// 平移状态（Space 键 / Hand 工具 / 中键）
const isSpaceHeld = ref(false);
const isPanning = ref(false);
const isMiddleButtonPanning = ref(false);
const middlePanStart = { x: 0, y: 0, stageX: 0, stageY: 0 };

// 画布边界显示
const showCanvasBorder = ref(true);
let borderRect: Konva.Rect | null = null;
let borderLayer: Konva.Layer | null = null;

// 右键菜单状态
const contextMenuVisible = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuTarget = shallowRef<Konva.Node | null>(null);
let clipboardObject: SketchObject | null = null;

onMounted(() => {
  if (!containerRef.value || !stageRef.value) return;

  // 1. 初始化 Stage（使用专用容器，避免与 Vue 管理的 DOM 冲突）
  const containerWidth = containerRef.value.clientWidth || 800;
  const containerHeight = containerRef.value.clientHeight || 600;
  const newStage = initStage(stageRef.value, containerWidth, containerHeight);

  // 2. 创建画布边界层（最底层）
  borderLayer = new Konva.Layer({ id: "border-layer", name: "border-layer", listening: false });
  borderRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: props.width,
    height: props.height,
    fill: "transparent",
    stroke: "rgba(255, 255, 255, 0.25)",
    strokeWidth: 1,
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    shadowEnabled: true,
    listening: false,
  });
  borderLayer.add(borderRect);
  newStage.add(borderLayer);
  borderLayer.moveToBottom();

  // 3. 创建 Overlay 层（用于 Transformer 和临时绘制）
  const overlayLayer = new Konva.Layer({ id: "overlay", name: "overlay" });
  newStage.add(overlayLayer);
  initTransformer(overlayLayer);

  // 4. 绑定事件
  setupEvents(newStage, overlayLayer);

  // 5. 初始化图层
  syncLayers();

  // 6. 自适应居中
  resetView(props.width, props.height, containerWidth, containerHeight);

  // 7. 绑定键盘事件（Space 平移）
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // 8. 绑定鼠标中键拖拽事件（在 stage 容器上监听，避免被 Konva 拦截）
  stageRef.value.addEventListener("pointerdown", handleMiddlePointerDown);
  window.addEventListener("pointermove", handleMiddlePointerMove);
  window.addEventListener("pointerup", handleMiddlePointerUp);
});

onUnmounted(() => {
  // 先停止文本编辑，避免卸载时 TextEditor 仍在渲染导致 DOM 不一致
  stopEditing();

  canvases.clear();
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("pointermove", handleMiddlePointerMove);
  window.removeEventListener("pointerup", handleMiddlePointerUp);
  if (stageRef.value) {
    stageRef.value.removeEventListener("pointerdown", handleMiddlePointerDown);
  }
});

// Space 平移键盘事件
function handleKeyDown(e: KeyboardEvent) {
  if (e.code === "Space" && !isSpaceHeld.value && !isEditingText.value) {
    e.preventDefault();
    isSpaceHeld.value = true;
    if (stage.value) {
      stage.value.draggable(true);
      const container = stage.value.container();
      container.style.cursor = "grab";
    }
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.code === "Space") {
    isSpaceHeld.value = false;
    isPanning.value = false;
    if (stage.value) {
      stage.value.draggable(props.activeTool === "hand");
      const container = stage.value.container();
      container.style.cursor = props.activeTool === "hand" ? "grab" : "default";
    }
  }
}

// 鼠标中键拖拽
function handleMiddlePointerDown(e: PointerEvent) {
  if (e.button !== 1) return; // 只处理中键
  e.preventDefault();
  if (!stage.value) return;

  isMiddleButtonPanning.value = true;
  middlePanStart.x = e.clientX;
  middlePanStart.y = e.clientY;
  middlePanStart.stageX = stage.value.x();
  middlePanStart.stageY = stage.value.y();

  const container = stage.value.container();
  container.style.cursor = "grabbing";
}

function handleMiddlePointerMove(e: PointerEvent) {
  if (!isMiddleButtonPanning.value || !stage.value) return;

  const dx = e.clientX - middlePanStart.x;
  const dy = e.clientY - middlePanStart.y;

  stage.value.position({
    x: middlePanStart.stageX + dx,
    y: middlePanStart.stageY + dy,
  });
  stage.value.batchDraw();
}

function handleMiddlePointerUp(e: PointerEvent) {
  if (e.button !== 1 || !isMiddleButtonPanning.value) return;
  isMiddleButtonPanning.value = false;

  if (stage.value) {
    panX.value = stage.value.x();
    panY.value = stage.value.y();
    const container = stage.value.container();
    container.style.cursor = props.activeTool === "hand" ? "grab" : "default";
  }
}

// 监听图层列表变化，同步 Konva 图层
watch(
  () => props.layers,
  () => {
    logger.debug("watch(layers) 触发 syncLayers", {
      layerCount: props.layers.length,
      layerIds: props.layers.map((l) => l.id),
      activeLayerId: props.activeLayerId,
    });
    syncLayers();
  },
  { deep: true },
);

// 监听活跃图层变化，更新交互状态
watch(
  () => props.activeLayerId,
  (newId, oldId) => {
    logger.debug("watch(activeLayerId) 触发", { oldId, newId });
    updateLayerInteractivity();
  },
);

// 监听工具变化，清空选择 & 切换 Hand 工具的 draggable 状态
watch(
  () => props.activeTool,
  (tool) => {
    // 文本工具和选择工具都允许保留选中态
    if (!["select", "text"].includes(tool)) {
      clearSelection();
      emitSelectionInfo();
    }

    // Hand 工具：stage 始终 draggable
    if (stage.value) {
      const isHand = tool === "hand";
      stage.value.draggable(isHand);
      const container = stage.value.container();
      if (isHand) {
        container.style.cursor = "grab";
      } else if (tool === "text") {
        container.style.cursor = "text";
      } else {
        container.style.cursor = "default";
      }
    }

    // 更新图层交互性（文本工具下也需要允许拖拽已有文本）
    updateLayerInteractivity();
  },
);

// 监听选中节点变化，通知父组件
watch(selectedNodes, () => {
  emitSelectionInfo();
});

/** 构建并发射 SelectionInfo */
function emitSelectionInfo() {
  emit("selection-change", buildSelectionInfo());
}

/** 从当前选中节点构建 SelectionInfo */
function buildSelectionInfo(): SelectionInfo {
  const nodes = selectedNodes.value;
  if (nodes.length === 0) {
    return { count: 0, singleObject: null, objectTypes: [], commonProps: {} };
  }

  const objectTypes: string[] = [];
  const objects: SketchObject[] = [];

  for (const node of nodes) {
    try {
      const obj = serializeKonvaNode(node);
      objects.push(obj);
      objectTypes.push(obj.type);
    } catch {
      // 跳过无法序列化的节点
    }
  }

  if (nodes.length === 1 && objects.length === 1) {
    return {
      count: 1,
      singleObject: objects[0],
      objectTypes,
      commonProps: {},
    };
  }

  // 多选：计算共有属性
  const commonProps: SelectionInfo["commonProps"] = {};

  // 检查是否所有对象都有 stroke 属性
  const strokeObjects = objects.filter((o) => "stroke" in o) as Array<{ stroke: string; strokeWidth: number }>;
  if (strokeObjects.length === objects.length && strokeObjects.length > 0) {
    const firstStroke = strokeObjects[0].stroke;
    if (strokeObjects.every((o) => o.stroke === firstStroke)) {
      commonProps.stroke = firstStroke;
    } else {
      commonProps.stroke = firstStroke; // 取第一个作为默认
    }
    commonProps.strokeWidth = strokeObjects[0].strokeWidth;
  }

  // 不透明度
  if (objects.length > 0) {
    commonProps.opacity = objects[0].opacity;
  }

  return {
    count: nodes.length,
    singleObject: null,
    objectTypes,
    commonProps,
  };
}

function setupEvents(stageInstance: Konva.Stage, overlayLayer: Konva.Layer) {
  // Space / Hand 工具拖拽时更新光标
  stageInstance.on("dragstart", () => {
    if (isSpaceHeld.value || props.activeTool === "hand") {
      isPanning.value = true;
      stageInstance.container().style.cursor = "grabbing";
    }
  });

  stageInstance.on("dragend", () => {
    if (isSpaceHeld.value || props.activeTool === "hand") {
      isPanning.value = false;
      stageInstance.container().style.cursor = "grab";
      // 同步 pan 值
      panX.value = stageInstance.x();
      panY.value = stageInstance.y();
    }
  });

  // 双击事件：文本工具下双击已有文本进入编辑
  stageInstance.on("dblclick dbltap", (e) => {
    if (props.activeTool !== "text" && props.activeTool !== "select") return;
    const target = e.target as Konva.Node;
    if (target && target.hasName("object-node") && target instanceof Konva.Text) {
      startEditing(target, stageInstance);
    }
  });

  // 变换控件历史闭环：记录 transformstart/transformend
  let transformBeforeSnapshots: Map<string, Record<string, any>> = new Map();

  overlayLayer.on("transformstart", () => {
    transformBeforeSnapshots.clear();
    const nodes = selectedNodes.value;
    for (const node of nodes) {
      transformBeforeSnapshots.set(node.id(), {
        x: node.x(),
        y: node.y(),
        width: node.width(),
        height: node.height(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
    }
  });

  overlayLayer.on("transformend", () => {
    const nodes = selectedNodes.value;
    for (const node of nodes) {
      const before = transformBeforeSnapshots.get(node.id());
      if (!before) continue;

      const after = {
        x: node.x(),
        y: node.y(),
        width: node.width(),
        height: node.height(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      };

      const layerId = node.getLayer()?.id();
      if (layerId) {
        emit("push-history", {
          type: "object-modify",
          layerId,
          objectId: node.id(),
          before,
          after,
        });
      }

      // 如果文本对象被手动调整尺寸，自动转为固定模式
      if (node instanceof Konva.Text) {
        const widthChanged = before.width !== after.width;
        const heightChanged = before.height !== after.height;
        if (widthChanged || heightChanged) {
          // 设置显式 width 使其变为固定模式
          if (node.attrs.width === undefined || node.attrs.width === null) {
            node.width(node.width());
          }
        }
      }
    }
    transformBeforeSnapshots.clear();
  });

  // 拖拽结束也记录历史（对象拖拽移动）
  stageInstance.on("dragend", (e) => {
    const target = e.target as Konva.Node;
    // 排除 stage 自身的拖拽（平移）
    if (target === stageInstance) return;
    if (!target.hasName("object-node")) return;

    const layerId = target.getLayer()?.id();
    if (!layerId) return;

    // 如果有 transformBeforeSnapshots 中的记录，说明是 transform 操作，已在 transformend 处理
    if (transformBeforeSnapshots.has(target.id())) return;

    // 简单的拖拽移动，记录位置变化
    // 注意：dragstart 时我们没有记录 before，这里用一个简化方案
    // 实际上 Konva 的 dragend 已经完成了位置更新，我们只需记录当前状态
    emit("push-history", {
      type: "object-modify",
      layerId,
      objectId: target.id(),
      before: { x: target.getAttr("_dragStartX"), y: target.getAttr("_dragStartY") },
      after: { x: target.x(), y: target.y() },
    });
  });

  // 拖拽开始时记录初始位置
  stageInstance.on("dragstart", (e) => {
    const target = e.target as Konva.Node;
    if (target === stageInstance) return;
    if (!target.hasName("object-node")) return;
    target.setAttr("_dragStartX", target.x());
    target.setAttr("_dragStartY", target.y());
  });

  // 鼠标/触摸按下
  stageInstance.on("mousedown touchstart", (e) => {
    // Space 平移 / Hand 工具 / 中键拖拽模式下不处理绘制
    if (isSpaceHeld.value || props.activeTool === "hand" || isMiddleButtonPanning.value) return;

    const activeLayer = props.layers.find((l) => l.id === props.activeLayerId);
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) return;

    const pos = stageInstance.getPointerPosition();
    if (!pos) return;

    // 坐标转换
    const transform = stageInstance.getAbsoluteTransform().copy().invert();
    const docPoint = transform.point(pos);

    // 1. 选择工具
    if (props.activeTool === "select") {
      // 检查点击的对象是否在非活跃图层上，如果是则自动切换图层
      const target = e.target as Konva.Node;
      if (target && target.hasName("object-node")) {
        const targetLayer = target.getLayer();
        if (targetLayer) {
          const targetLayerId = targetLayer.id();
          if (targetLayerId && targetLayerId !== props.activeLayerId) {
            // 检查目标图层是否可见且未锁定
            const targetLayerData = props.layers.find((l) => l.id === targetLayerId);
            if (targetLayerData && targetLayerData.visible && !targetLayerData.locked) {
              logger.debug("选择工具：自动切换到对象所在图层", {
                from: props.activeLayerId,
                to: targetLayerId,
              });
              emit("switch-layer", targetLayerId);
            }
          }
        }
      }
      handleStageClick(e);
      return;
    }

    // 2. 画笔工具 (铅笔、马克笔、橡皮擦)
    if (["pencil", "marker", "eraser"].includes(props.activeTool)) {
      if (activeLayer.type !== "raster") {
        customMessage.warning("当前图层不是位图图层，无法使用画笔");
        return;
      }

      const canvas = canvases.get(activeLayer.id);
      const konvaLayer = stageInstance.findOne(`#${activeLayer.id}`) as Konva.Layer;
      const konvaImage = konvaLayer?.findOne("Image") as Konva.Image;

      if (canvas && konvaImage) {
        startDrawing(e.evt as PointerEvent, stageInstance, canvas, konvaImage, {
          size: props.brushSize,
          color: props.brushColor,
          opacity: props.brushOpacity,
          type: props.activeTool as any,
        });
      }
      return;
    }

    // 3. 形状工具 (矩形、圆形、线段、箭头)
    if (["rect", "ellipse", "line", "arrow"].includes(props.activeTool)) {
      if (activeLayer.type !== "object") {
        customMessage.warning("当前图层不是对象图层，无法绘制形状");
        return;
      }

      startPoint = docPoint;

      if (props.activeTool === "rect") {
        tempShape = new Konva.Rect({
          x: docPoint.x,
          y: docPoint.y,
          width: 0,
          height: 0,
          stroke: props.strokeColor,
          strokeWidth: props.strokeWidth,
          fill: props.fillColor || undefined,
          cornerRadius: props.cornerRadius,
        });
      } else if (props.activeTool === "ellipse") {
        tempShape = new Konva.Ellipse({
          x: docPoint.x,
          y: docPoint.y,
          radiusX: 0,
          radiusY: 0,
          stroke: props.strokeColor,
          strokeWidth: props.strokeWidth,
          fill: props.fillColor || undefined,
        });
      } else if (props.activeTool === "line") {
        tempShape = new Konva.Line({
          points: [docPoint.x, docPoint.y, docPoint.x, docPoint.y],
          stroke: props.strokeColor,
          strokeWidth: props.strokeWidth,
        });
      } else if (props.activeTool === "arrow") {
        tempShape = new Konva.Arrow({
          points: [docPoint.x, docPoint.y, docPoint.x, docPoint.y],
          stroke: props.strokeColor,
          strokeWidth: props.strokeWidth,
          pointerLength: 10,
          pointerWidth: 10,
        });
      }

      if (tempShape) {
        overlayLayer.add(tempShape);
        overlayLayer.batchDraw();
      }
    }

    // 4. 文字工具
    if (props.activeTool === "text") {
      if (activeLayer.type !== "object") {
        customMessage.warning("当前图层不是对象图层，无法添加文字");
        return;
      }

      // 如果正在编辑文本，先结束编辑，本次点击不创建新文本
      if (isEditingText.value) {
        finishTextEditing();
        return;
      }

      const target = e.target as Konva.Node;

      // 4a. 点击已有文本对象 → 选中
      if (target && target.hasName("object-node") && target instanceof Konva.Text) {
        selectNodes([target]);
        // 自动切换到对象所在图层
        const targetLayer = target.getLayer();
        if (targetLayer) {
          const targetLayerId = targetLayer.id();
          if (targetLayerId && targetLayerId !== props.activeLayerId) {
            const targetLayerData = props.layers.find((l) => l.id === targetLayerId);
            if (targetLayerData && targetLayerData.visible && !targetLayerData.locked) {
              emit("switch-layer", targetLayerId);
            }
          }
        }
        return;
      }

      // 4b. 点击空白区域 → 进入 pendingTextCreate 状态
      pendingTextCreate = true;
      textDragStart = { x: docPoint.x, y: docPoint.y };
      isTextDragging = false;

      // 创建拖拽预览矩形（初始不可见）
      textDragRect = new Konva.Rect({
        x: docPoint.x,
        y: docPoint.y,
        width: 0,
        height: 0,
        stroke: "#4a90d9",
        strokeWidth: 1,
        dash: [4, 4],
        fill: "rgba(74, 144, 217, 0.05)",
        listening: false,
      });
      overlayLayer.add(textDragRect);
    }
  });

  // 鼠标/触摸移动
  stageInstance.on("mousemove touchmove", (e) => {
    if (isDrawing.value) {
      draw(e.evt as PointerEvent, stageInstance, {
        size: props.brushSize,
        color: props.brushColor,
        opacity: props.brushOpacity,
        type: props.activeTool as any,
      });
      return;
    }

    const pos = stageInstance.getPointerPosition();
    if (!pos) return;

    const transform = stageInstance.getAbsoluteTransform().copy().invert();
    const docPoint = transform.point(pos);

    // 文本工具拖拽创建
    if (pendingTextCreate && textDragRect) {
      const dx = docPoint.x - textDragStart.x;
      const dy = docPoint.y - textDragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= TEXT_DRAG_THRESHOLD) {
        isTextDragging = true;
        stageInstance.container().style.cursor = "crosshair";
        // 更新拖拽矩形
        const x = Math.min(textDragStart.x, docPoint.x);
        const y = Math.min(textDragStart.y, docPoint.y);
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        textDragRect.setAttrs({ x, y, width: w, height: h, visible: true });
        overlayLayer.batchDraw();
      }
      return;
    }

    // 形状工具拖拽
    if (tempShape && ["rect", "ellipse", "line", "arrow"].includes(props.activeTool)) {
      if (tempShape instanceof Konva.Rect) {
        tempShape.width(docPoint.x - startPoint.x);
        tempShape.height(docPoint.y - startPoint.y);
      } else if (tempShape instanceof Konva.Ellipse) {
        tempShape.radiusX(Math.abs(docPoint.x - startPoint.x));
        tempShape.radiusY(Math.abs(docPoint.y - startPoint.y));
      } else if (tempShape instanceof Konva.Line || tempShape instanceof Konva.Arrow) {
        tempShape.points([startPoint.x, startPoint.y, docPoint.x, docPoint.y]);
      }

      overlayLayer.batchDraw();
      return;
    }

    // 光标反馈
    updateCursor(stageInstance, e.target as Konva.Node);
  });

  // 鼠标/触摸抬起
  stageInstance.on("mouseup touchend", () => {
    if (isDrawing.value) {
      stopDrawing(props.activeLayerId, (entry) => {
        emit("push-history", entry);
      });
      return;
    }

    // 文本工具拖拽/点击创建
    if (pendingTextCreate) {
      pendingTextCreate = false;

      const activeLayer = props.layers.find((l) => l.id === props.activeLayerId);
      const konvaLayer = stageInstance.findOne(`#${props.activeLayerId}`) as Konva.Layer;

      // 清理拖拽预览矩形
      if (textDragRect) {
        textDragRect.destroy();
        textDragRect = null;
        overlayLayer.batchDraw();
      }

      if (!activeLayer || !konvaLayer) {
        isTextDragging = false;
        return;
      }

      if (isTextDragging) {
        // 拖拽模式：创建固定尺寸文本
        const pos = stageInstance.getPointerPosition();
        if (!pos) {
          isTextDragging = false;
          return;
        }
        const endTransform = stageInstance.getAbsoluteTransform().copy().invert();
        const endPoint = endTransform.point(pos);

        const x = Math.min(textDragStart.x, endPoint.x);
        const y = Math.min(textDragStart.y, endPoint.y);
        const w = Math.abs(endPoint.x - textDragStart.x);
        const h = Math.abs(endPoint.y - textDragStart.y);

        if (w < 10 || h < 10) {
          isTextDragging = false;
          return;
        }

        const textObj: SketchObject = {
          id: nanoid(),
          type: "text",
          x,
          y,
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          locked: false,
          content: "",
          fontSize: props.fontSize,
          fontFamily: "sans-serif",
          fontWeight: props.fontWeight,
          fontStyle: props.fontStyle,
          textAlign: props.textAlign,
          color: props.textColor,
          backgroundColor: null,
          lineHeight: 1.2,
          autoSize: false,
        };

        const textNode = createKonvaNode(textObj) as Konva.Text;
        konvaLayer.add(textNode);
        konvaLayer.batchDraw();

        // 绑定双击编辑
        textNode.on("dblclick dbltap", () => {
          startEditing(textNode, stageInstance);
        });

        // 标记为新创建
        pendingNewTextNodes.add(textNode.id());

        // 进入编辑
        nextTick(() => {
          startEditing(textNode, stageInstance);
        });
      } else {
        // 点击模式：创建自适应文本
        const textObj: SketchObject = {
          id: nanoid(),
          type: "text",
          x: textDragStart.x,
          y: textDragStart.y,
          width: 0,
          height: 0,
          rotation: 0,
          opacity: 1,
          locked: false,
          content: "",
          fontSize: props.fontSize,
          fontFamily: "sans-serif",
          fontWeight: props.fontWeight,
          fontStyle: props.fontStyle,
          textAlign: props.textAlign,
          color: props.textColor,
          backgroundColor: null,
          lineHeight: 1.2,
          autoSize: true,
        };

        const textNode = createKonvaNode(textObj) as Konva.Text;
        konvaLayer.add(textNode);
        konvaLayer.batchDraw();

        // 绑定双击编辑
        textNode.on("dblclick dbltap", () => {
          startEditing(textNode, stageInstance);
        });

        // 标记为新创建
        pendingNewTextNodes.add(textNode.id());

        // 进入编辑
        nextTick(() => {
          startEditing(textNode, stageInstance);
        });
      }

      isTextDragging = false;
      stageInstance.container().style.cursor = "text";
      return;
    }

    if (tempShape) {
      const activeLayer = props.layers.find((l) => l.id === props.activeLayerId);
      const konvaLayer = stageInstance.findOne(`#${props.activeLayerId}`) as Konva.Layer;

      if (activeLayer && konvaLayer) {
        // 将临时形状转换为正式的 Konva 节点并添加到目标图层
        let finalObj: SketchObject | null = null;
        if (tempShape instanceof Konva.Rect) {
          finalObj = {
            id: nanoid(),
            type: "rect",
            x: tempShape.x(),
            y: tempShape.y(),
            width: tempShape.width(),
            height: tempShape.height(),
            rotation: 0,
            opacity: 1,
            locked: false,
            fill: props.fillColor,
            stroke: props.strokeColor,
            strokeWidth: props.strokeWidth,
            cornerRadius: props.cornerRadius,
          };
        } else if (tempShape instanceof Konva.Ellipse) {
          finalObj = {
            id: nanoid(),
            type: "ellipse",
            x: tempShape.x() - tempShape.radiusX(),
            y: tempShape.y() - tempShape.radiusY(),
            width: tempShape.radiusX() * 2,
            height: tempShape.radiusY() * 2,
            rotation: 0,
            opacity: 1,
            locked: false,
            fill: props.fillColor,
            stroke: props.strokeColor,
            strokeWidth: props.strokeWidth,
          };
        } else if (tempShape instanceof Konva.Line && !(tempShape instanceof Konva.Arrow)) {
          const pts = tempShape.points();
          finalObj = {
            id: nanoid(),
            type: "line",
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            opacity: 1,
            locked: false,
            points: [
              { x: pts[0], y: pts[1] },
              { x: pts[2], y: pts[3] },
            ],
            stroke: props.strokeColor,
            strokeWidth: props.strokeWidth,
          };
        } else if (tempShape instanceof Konva.Arrow) {
          const pts = tempShape.points();
          finalObj = {
            id: nanoid(),
            type: "arrow",
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            opacity: 1,
            locked: false,
            points: [
              { x: pts[0], y: pts[1] },
              { x: pts[2], y: pts[3] },
            ],
            stroke: props.strokeColor,
            strokeWidth: props.strokeWidth,
            arrowSize: 10,
          };
        }

        if (finalObj) {
          const finalNode = createKonvaNode(finalObj);
          konvaLayer.add(finalNode as any);
          konvaLayer.batchDraw();

          // 记录历史
          emit("push-history", {
            type: "object-add",
            layerId: activeLayer.id,
            object: finalObj,
          });
        }
      }

      tempShape.destroy();
      tempShape = null;
      overlayLayer.batchDraw();
    }
  });
}

function syncLayers() {
  if (!stage.value) {
    logger.warn("syncLayers 中止：stage 为 null");
    return;
  }

  // 1. 移除已经不存在的 Konva 图层
  const existingLayers = stage.value.getLayers();
  const existingIds = existingLayers.map((kl) => kl.id()).filter((id) => id !== "overlay" && id !== "border-layer");
  const propsIds = props.layers.map((l) => l.id);

  const toRemove = existingIds.filter((id) => !propsIds.includes(id));
  const toCreate = propsIds.filter((id) => !existingIds.includes(id));

  if (toRemove.length > 0 || toCreate.length > 0) {
    logger.debug("syncLayers 差异", {
      existingIds,
      propsIds,
      toRemove,
      toCreate,
    });
  }

  for (const kl of existingLayers) {
    if (kl.id() === "overlay" || kl.id() === "border-layer") continue;
    if (!props.layers.some((l) => l.id === kl.id())) {
      kl.destroy();
      canvases.delete(kl.id());
    }
  }

  // 2. 同步或创建图层
  // 注意：Konva 的渲染顺序是自底向上的，所以我们需要反向遍历 props.layers
  const reversedLayers = [...props.layers].reverse();

  reversedLayers.forEach((layer, index) => {
    let konvaLayer = stage.value!.findOne(`#${layer.id}`) as Konva.Layer;

    if (!konvaLayer) {
      // 创建新图层
      konvaLayer = new Konva.Layer({
        id: layer.id,
        name: layer.name,
      });
      stage.value!.add(konvaLayer);

      if (layer.type === "raster") {
        // 位图图层：创建 OffscreenCanvas 并用 Konva.Image 承载
        const canvas = document.createElement("canvas");
        canvas.width = props.width;
        canvas.height = props.height;
        canvases.set(layer.id, canvas);

        const konvaImage = new Konva.Image({
          image: canvas,
          width: props.width,
          height: props.height,
        });
        konvaLayer.add(konvaImage as any);
      } else if (layer.type === "object") {
        // 对象图层：根据数据创建子节点
        layer.objects.forEach((obj) => {
          if (obj.type === "image") {
            // 图片对象：先放占位节点，异步加载真实图片
            const placeholder = createKonvaNode(obj);
            konvaLayer.add(placeholder as any);
            // 异步加载图片并替换占位节点
            loadImageNodeAsync(obj as ImageObject, konvaLayer);
          } else {
            const node = createKonvaNode(obj);
            konvaLayer.add(node as any);

            if (obj.type === "text") {
              node.on("dblclick dbltap", () => {
                startEditing(node as Konva.Text, stage.value as any);
              });
            }
          }
        });
      }
    }

    // 更新图层属性
    konvaLayer.visible(layer.visible);
    konvaLayer.opacity(layer.opacity);
    konvaLayer.zIndex(index); // 调整层级
  });

  // 确保 border-layer 在最底层，overlay 在最顶层
  if (borderLayer) {
    borderLayer.moveToBottom();
  }
  const overlay = stage.value.findOne(".overlay");
  if (overlay) {
    overlay.moveToTop();
  }

  updateLayerInteractivity();
  stage.value.batchDraw();
}

function updateLayerInteractivity() {
  if (!stage.value) return;

  props.layers.forEach((layer) => {
    const konvaLayer = stage.value!.findOne(`#${layer.id}`) as Konva.Layer;
    if (!konvaLayer) return;

    const isCurrentActive = layer.id === props.activeLayerId;

    if (layer.type === "object") {
      // 选择工具和文本工具下，活跃图层的对象可拖拽
      const allowDrag = isCurrentActive && !layer.locked && ["select", "text"].includes(props.activeTool);
      konvaLayer.getChildren().forEach((node) => {
        if (node.name() === "object-node") {
          node.draggable(allowDrag);
        }
      });
    }
  });
}

/** 光标反馈 */
function updateCursor(stageInstance: Konva.Stage, target: Konva.Node) {
  if (isSpaceHeld.value || props.activeTool === "hand") return;

  const container = stageInstance.container();

  if (props.activeTool === "text") {
    if (target && target.hasName("object-node") && target instanceof Konva.Text) {
      container.style.cursor = "pointer";
    } else {
      container.style.cursor = "text";
    }
  } else if (props.activeTool === "select") {
    if (target && target.hasName("object-node")) {
      container.style.cursor = "move";
    } else {
      container.style.cursor = "default";
    }
  }
}

/**
 * 异步加载图片对象并替换占位节点
 */
async function loadImageNodeAsync(imageObj: ImageObject, konvaLayer: Konva.Layer) {
  const imageNode = await loadImageNode(imageObj);
  if (!imageNode) return;

  // 找到并替换占位节点
  const placeholder = konvaLayer.findOne(`#${imageObj.id}`);
  if (placeholder) {
    placeholder.destroy();
  }

  konvaLayer.add(imageNode as any);
  konvaLayer.batchDraw();
}

/**
 * 将 ImageObject 添加到当前活跃的对象图层
 */
async function addImageToActiveLayer(imageObj: ImageObject) {
  if (!stage.value) return;

  const activeLayerData = props.layers.find((l) => l.id === props.activeLayerId);
  if (!activeLayerData || activeLayerData.type !== "object") {
    customMessage.warning("请选择一个对象图层来放置图片");
    return;
  }

  const konvaLayer = stage.value.findOne(`#${props.activeLayerId}`) as Konva.Layer;
  if (!konvaLayer) return;

  // 异步加载图片节点
  const imageNode = await loadImageNode(imageObj);
  if (!imageNode) {
    customMessage.error("图片加载失败");
    return;
  }

  konvaLayer.add(imageNode as any);
  konvaLayer.batchDraw();

  // 记录历史
  emit("push-history", {
    type: "object-add",
    layerId: props.activeLayerId,
    object: imageObj,
  });
}

function finishTextEditing() {
  const editingNodeRef = getEditingNode();
  const nodeId = editingNodeRef?.id();
  const result = stopEditing();

  if (!result) return;

  const { node, before, after } = result;
  const layerId = node.getLayer()?.id();
  if (!layerId) return;

  const isNewNode = nodeId ? pendingNewTextNodes.has(nodeId) : false;

  if (isNewNode && nodeId) {
    pendingNewTextNodes.delete(nodeId);

    // 新创建的文本：检查内容是否为空
    const content = after.content.trim();
    if (content === "") {
      // 空文本 → 删除临时节点，不产生历史
      node.destroy();
      stage.value?.batchDraw();
      logger.debug("文本工具：空文本已清理", { nodeId });
    } else {
      // 有内容 → 推入 object-add 历史
      emit("push-history", {
        type: "object-add",
        layerId,
        object: serializeKonvaNode(node),
      });
      logger.debug("文本工具：新文本已创建", { nodeId, content: content.substring(0, 20) });

      // 选中新创建的文本并刷新 Transformer
      selectNodes([node]);
    }
  } else {
    // 已有文本编辑：检查内容是否变化
    if (before.content !== after.content) {
      emit("push-history", {
        type: "object-modify",
        layerId,
        objectId: node.id(),
        before: { content: before.content },
        after: { content: after.content },
      });
    }

    // 刷新 Transformer 以匹配编辑后可能变化的尺寸
    if (selectedNodes.value.includes(node)) {
      selectNodes([...selectedNodes.value]);
    }
  }
}

function handleZoomClick() {
  if (!stage.value || !containerRef.value) return;
  resetView(props.width, props.height, containerRef.value.clientWidth, containerRef.value.clientHeight);
}

function toggleCanvasBorder() {
  showCanvasBorder.value = !showCanvasBorder.value;
  if (borderLayer) {
    borderLayer.visible(showCanvasBorder.value);
    stage.value?.batchDraw();
  }
}

// ─── 右键菜单 ───
function handleContextMenu(e: MouseEvent) {
  if (!stage.value) return;

  contextMenuPos.value = { x: e.offsetX, y: e.offsetY };

  // 检查是否右键点击了对象
  const pos = stage.value.getPointerPosition();
  if (pos) {
    const shape = stage.value.getIntersection(pos);
    if (shape && shape.name() === "object-node") {
      contextMenuTarget.value = shape;
    } else {
      contextMenuTarget.value = null;
    }
  } else {
    contextMenuTarget.value = null;
  }

  contextMenuVisible.value = true;

  // 点击其他地方关闭菜单
  const closeMenu = () => {
    contextMenuVisible.value = false;
    document.removeEventListener("click", closeMenu);
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

function contextCopy() {
  if (contextMenuTarget.value) {
    clipboardObject = serializeKonvaNode(contextMenuTarget.value);
  }
  contextMenuVisible.value = false;
}

function contextPaste() {
  if (!clipboardObject || !stage.value) {
    contextMenuVisible.value = false;
    return;
  }

  const activeLayerData = props.layers.find((l) => l.id === props.activeLayerId);
  if (!activeLayerData || activeLayerData.type !== "object") {
    customMessage.warning("请选择一个对象图层进行粘贴");
    contextMenuVisible.value = false;
    return;
  }

  const konvaLayer = stage.value.findOne(`#${props.activeLayerId}`) as Konva.Layer;
  if (!konvaLayer) {
    contextMenuVisible.value = false;
    return;
  }

  // 创建副本，偏移位置
  const newObj = { ...clipboardObject, id: nanoid(), x: clipboardObject.x + 20, y: clipboardObject.y + 20 };
  const node = createKonvaNode(newObj);
  konvaLayer.add(node as any);
  konvaLayer.batchDraw();

  emit("push-history", { type: "object-add", layerId: props.activeLayerId, object: newObj });
  contextMenuVisible.value = false;
}

function contextDelete() {
  if (contextMenuTarget.value) {
    const layerId = contextMenuTarget.value.getLayer()?.id();
    if (layerId) {
      emit("push-history", {
        type: "object-remove",
        layerId,
        object: serializeKonvaNode(contextMenuTarget.value),
      });
    }
    contextMenuTarget.value.destroy();
    stage.value?.batchDraw();
  }
  contextMenuVisible.value = false;
}

function contextMoveToTop() {
  if (contextMenuTarget.value) {
    contextMenuTarget.value.moveToTop();
    stage.value?.batchDraw();
  }
  contextMenuVisible.value = false;
}

function contextMoveToBottom() {
  if (contextMenuTarget.value) {
    contextMenuTarget.value.moveToBottom();
    stage.value?.batchDraw();
  }
  contextMenuVisible.value = false;
}

function contextToggleLock() {
  if (contextMenuTarget.value) {
    const isDraggable = contextMenuTarget.value.draggable();
    contextMenuTarget.value.draggable(!isDraggable);
    stage.value?.batchDraw();
  }
  contextMenuVisible.value = false;
}

function contextResetView() {
  handleZoomClick();
  contextMenuVisible.value = false;
}

/**
 * 从 Konva Stage 中收集所有对象图层的当前节点数据
 * 用于保存前同步矢量数据到 layers 数据模型
 */
function collectObjectLayerData(): Map<string, import("../types").SketchObject[]> {
  const result = new Map<string, import("../types").SketchObject[]>();
  if (!stage.value) return result;

  for (const layer of props.layers) {
    if (layer.type !== "object") continue;

    const konvaLayer = stage.value.findOne(`#${layer.id}`) as Konva.Layer;
    if (!konvaLayer) continue;

    const objects: import("../types").SketchObject[] = [];
    konvaLayer.getChildren().forEach((node) => {
      if (node.name() === "object-node") {
        try {
          objects.push(serializeKonvaNode(node));
        } catch {
          // 跳过无法序列化的节点
        }
      }
    });
    result.set(layer.id, objects);
  }

  return result;
}

// ─── 选中对象属性操作 ───

/** 获取当前选中信息（供父组件主动查询） */
function getSelectionInfo(): SelectionInfo {
  return buildSelectionInfo();
}

/** 读取节点上某个属性的当前值（用于 history before 快照） */
function getNodeAttrValue(node: Konva.Node, key: string): any {
  if (key === "content" && node instanceof Konva.Text) {
    return node.text();
  } else if (key === "color" && node instanceof Konva.Text) {
    return node.fill();
  } else if (key === "arrowSize" && node instanceof Konva.Arrow) {
    return node.pointerLength();
  } else if (key === "dash") {
    return (node as any).dash() || null;
  } else if (key === "fill") {
    return (node as any).fill() || null;
  }
  return node.getAttr(key);
}

/** 在节点上设置属性值 */
function setNodeAttrValue(node: Konva.Node, key: string, value: any) {
  if (key === "content" && node instanceof Konva.Text) {
    node.text(value);
  } else if (key === "color" && node instanceof Konva.Text) {
    node.fill(value);
  } else if (key === "arrowSize" && node instanceof Konva.Arrow) {
    node.pointerLength(value);
    node.pointerWidth(value);
  } else if (key === "dash") {
    (node as any).dash(value || []);
  } else if (key === "fill") {
    (node as any).fill(value || undefined);
  } else {
    node.setAttr(key, value);
  }
}

/** 更新选中对象的单个属性 */
function updateSelectionProp(key: string, value: any) {
  if (selectedNodes.value.length === 0) return;

  selectedNodes.value.forEach((node) => {
    if (node instanceof Konva.Shape || node instanceof Konva.Text || node instanceof Konva.Image) {
      const layerId = node.getLayer()?.id();
      if (layerId) {
        const before: Record<string, any> = {};
        const after: Record<string, any> = {};
        before[key] = getNodeAttrValue(node, key);
        after[key] = value;

        setNodeAttrValue(node, key, value);

        emit("push-history", {
          type: "object-modify",
          layerId,
          objectId: node.id(),
          before,
          after,
        });
      } else {
        setNodeAttrValue(node, key, value);
      }
    }
  });
  stage.value?.batchDraw();
}

/** 批量更新选中对象的多个属性 */
function updateSelectionProps(data: Record<string, any>) {
  if (selectedNodes.value.length === 0) return;

  selectedNodes.value.forEach((node) => {
    if (node instanceof Konva.Shape || node instanceof Konva.Text || node instanceof Konva.Image) {
      const layerId = node.getLayer()?.id();
      if (layerId) {
        const before: Record<string, any> = {};
        const after: Record<string, any> = {};

        for (const [key, value] of Object.entries(data)) {
          before[key] = getNodeAttrValue(node, key);
          after[key] = value;
          setNodeAttrValue(node, key, value);
        }

        emit("push-history", {
          type: "object-modify",
          layerId,
          objectId: node.id(),
          before,
          after,
        });
      } else {
        for (const [key, value] of Object.entries(data)) {
          setNodeAttrValue(node, key, value);
        }
      }
    }
  });
  stage.value?.batchDraw();
}

/** 对齐选中对象 */
function alignSelection(direction: "left" | "right" | "top" | "bottom" | "center-h" | "center-v") {
  const nodes = selectedNodes.value;
  if (nodes.length < 2) return;

  const rects = nodes.map((n) => n.getClientRect());

  switch (direction) {
    case "left": {
      const minX = Math.min(...rects.map((r) => r.x));
      nodes.forEach((n, i) => {
        n.x(n.x() + (minX - rects[i].x));
      });
      break;
    }
    case "right": {
      const maxRight = Math.max(...rects.map((r) => r.x + r.width));
      nodes.forEach((n, i) => {
        n.x(n.x() + (maxRight - (rects[i].x + rects[i].width)));
      });
      break;
    }
    case "top": {
      const minY = Math.min(...rects.map((r) => r.y));
      nodes.forEach((n, i) => {
        n.y(n.y() + (minY - rects[i].y));
      });
      break;
    }
    case "bottom": {
      const maxBottom = Math.max(...rects.map((r) => r.y + r.height));
      nodes.forEach((n, i) => {
        n.y(n.y() + (maxBottom - (rects[i].y + rects[i].height)));
      });
      break;
    }
    case "center-h": {
      const minX = Math.min(...rects.map((r) => r.x));
      const maxRight = Math.max(...rects.map((r) => r.x + r.width));
      const centerX = (minX + maxRight) / 2;
      nodes.forEach((n, i) => {
        n.x(n.x() + (centerX - (rects[i].x + rects[i].width / 2)));
      });
      break;
    }
    case "center-v": {
      const minY = Math.min(...rects.map((r) => r.y));
      const maxBottom = Math.max(...rects.map((r) => r.y + r.height));
      const centerY = (minY + maxBottom) / 2;
      nodes.forEach((n, i) => {
        n.y(n.y() + (centerY - (rects[i].y + rects[i].height / 2)));
      });
      break;
    }
  }
  stage.value?.batchDraw();
}

/** 等距分布选中对象 */
function distributeSelection(direction: "horizontal" | "vertical") {
  const nodes = selectedNodes.value;
  if (nodes.length < 3) return;

  const rects = nodes.map((n, i) => ({ index: i, rect: n.getClientRect() }));

  if (direction === "horizontal") {
    rects.sort((a, b) => a.rect.x - b.rect.x);
    const totalWidth = rects.reduce((sum, r) => sum + r.rect.width, 0);
    const minX = rects[0].rect.x;
    const maxRight = rects[rects.length - 1].rect.x + rects[rects.length - 1].rect.width;
    const gap = (maxRight - minX - totalWidth) / (rects.length - 1);

    let currentX = minX;
    rects.forEach((item) => {
      const node = nodes[item.index];
      node.x(node.x() + (currentX - item.rect.x));
      currentX += item.rect.width + gap;
    });
  } else {
    rects.sort((a, b) => a.rect.y - b.rect.y);
    const totalHeight = rects.reduce((sum, r) => sum + r.rect.height, 0);
    const minY = rects[0].rect.y;
    const maxBottom = rects[rects.length - 1].rect.y + rects[rects.length - 1].rect.height;
    const gap = (maxBottom - minY - totalHeight) / (rects.length - 1);

    let currentY = minY;
    rects.forEach((item) => {
      const node = nodes[item.index];
      node.y(node.y() + (currentY - item.rect.y));
      currentY += item.rect.height + gap;
    });
  }
  stage.value?.batchDraw();
}

// 暴露方法给父组件
defineExpose({
  getStage: () => stage.value,
  getCanvases: () => canvases,
  getZoom: () => zoom.value,
  createKonvaNode,
  serializeKonvaNode,
  addImageToActiveLayer,
  collectObjectLayerData,
  getSelectionInfo,
  updateSelectionProp,
  updateSelectionProps,
  alignSelection,
  distributeSelection,
  resetView: () => {
    if (containerRef.value && stage.value) {
      resetView(props.width, props.height, containerRef.value.clientWidth, containerRef.value.clientHeight);
    }
  },
  deleteSelected: () => {
    if (selectedNodes.value.length > 0) {
      selectedNodes.value.forEach((node) => {
        const layerId = node.getLayer()?.id();
        if (layerId) {
          emit("push-history", {
            type: "object-remove",
            layerId,
            object: serializeKonvaNode(node),
          });
        }
        node.destroy();
      });
      clearSelection();
      emitSelectionInfo();
      stage.value?.batchDraw();
    }
  },
  selectAll: () => {
    if (!stage.value) return;
    const activeLayer = props.layers.find((l) => l.id === props.activeLayerId);
    if (!activeLayer || activeLayer.type !== "object") return;

    const konvaLayer = stage.value.findOne(`#${activeLayer.id}`) as Konva.Layer;
    if (!konvaLayer) return;

    const objectNodes = konvaLayer.getChildren().filter((n) => n.name() === "object-node");
    if (objectNodes.length > 0) {
      const { transformer } = useTransformer();
      if (transformer.value) {
        transformer.value.nodes(objectNodes as any);
        transformer.value.getLayer()?.batchDraw();
        emitSelectionInfo();
      }
    }
  },
});
</script>

<style scoped>
.canvas-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.konva-stage-container {
  position: absolute;
  inset: 0;
  /* 透明棋盘格背景 - 主题响应式，透明度由设置控制 */
  --checker-opacity: 1;
  --checker-color: rgba(0, 0, 0, calc(0.04 * var(--checker-opacity)));
  --checker-bg: var(--el-bg-color-page, #f5f5f5);
  background-image:
    linear-gradient(45deg, var(--checker-color) 25%, transparent 25%),
    linear-gradient(-45deg, var(--checker-color) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--checker-color) 75%),
    linear-gradient(-45deg, transparent 75%, var(--checker-color) 75%);
  background-size: 24px 24px;
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0px;
  background-color: var(--checker-bg);
}

:root.dark .konva-stage-container {
  --checker-color: rgba(255, 255, 255, calc(0.03 * var(--checker-opacity)));
  --checker-bg: #1a1a1a;
}

.bottom-bar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 4px 10px;
  z-index: 50;
  border: var(--border-width) solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.bar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.12s;
}

.bar-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.08);
  color: var(--el-text-color-primary);
}

.bar-btn.active {
  color: var(--primary-color);
}

.zoom-value {
  font-size: 11px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}

.zoom-value:hover {
  color: var(--el-text-color-primary);
}
</style>
