<template>
  <div ref="containerRef" class="canvas-container" @contextmenu.prevent="handleContextMenu">
    <!-- 文本编辑覆盖层 -->
    <TextEditor
      v-if="isEditingText"
      v-model="textValue"
      :style="textareaStyle"
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
import { ref, shallowRef, computed, onMounted, watch, onUnmounted } from "vue";
import Konva from "konva";
import { nanoid } from "nanoid";
import { SquareDashed } from "lucide-vue-next";
import { useKonvaStage } from "../composables/useKonvaStage";
import { useRasterBrush } from "../composables/useRasterBrush";
import { useObjectLayer } from "../composables/useObjectLayer";
import { useTransformer } from "../composables/useTransformer";
import { useTextEditing } from "../composables/useTextEditing";
import { useImageAsset } from "../composables/useImageAsset";
import type { HybridLayer, SketchObject, ImageObject } from "../types";
import type { ToolType } from "../constants";
import TextEditor from "./TextEditor.vue";
import { customMessage } from "@/utils/customMessage";

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
  (e: "selection-change", count: number): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvases = new Map<string, HTMLCanvasElement>(); // layerId -> canvas

// 引入 Composables
const { stage, zoom, initStage, resetView } = useKonvaStage();
const { isDrawing, startDrawing, draw, stopDrawing } = useRasterBrush();
const { createKonvaNode, serializeKonvaNode } = useObjectLayer();
const { selectedNodes, initTransformer, clearSelection, handleStageClick } = useTransformer();
const { isEditing: isEditingText, textValue, textareaStyle, startEditing, stopEditing } = useTextEditing();
const { loadImageNode } = useImageAsset();

// 缩放百分比显示
const zoomPercent = computed(() => Math.round(zoom.value * 100));

// 临时绘制形状的状态
let tempShape: Konva.Shape | null = null;
let startPoint = { x: 0, y: 0 };

// Space 平移状态
const isSpaceHeld = ref(false);
const isPanning = ref(false);

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
  if (!containerRef.value) return;

  // 1. 初始化 Stage
  const containerWidth = containerRef.value.clientWidth || 800;
  const containerHeight = containerRef.value.clientHeight || 600;
  const newStage = initStage(containerRef.value, containerWidth, containerHeight);

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
});

onUnmounted(() => {
  canvases.clear();
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
});

// Space 平移键盘事件
function handleKeyDown(e: KeyboardEvent) {
  if (e.code === "Space" && !isSpaceHeld.value && !isEditingText.value) {
    e.preventDefault();
    isSpaceHeld.value = true;
    if (stage.value) {
      stage.value.draggable(true);
      // 更改光标样式
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
      stage.value.draggable(false);
      const container = stage.value.container();
      container.style.cursor = "default";
    }
  }
}

// 监听图层列表变化，同步 Konva 图层
watch(
  () => props.layers,
  () => {
    syncLayers();
  },
  { deep: true },
);

// 监听活跃图层变化，更新交互状态
watch(
  () => props.activeLayerId,
  () => {
    updateLayerInteractivity();
  },
);

// 监听工具变化，清空选择
watch(
  () => props.activeTool,
  (tool) => {
    if (tool !== "select") {
      clearSelection();
      emit("selection-change", 0);
    }
  },
);

// 监听选中节点变化，通知父组件
watch(selectedNodes, (nodes) => {
  emit("selection-change", nodes.length);
});

function setupEvents(stageInstance: Konva.Stage, overlayLayer: Konva.Layer) {
  // Space 拖拽时更新光标
  stageInstance.on("dragstart", () => {
    if (isSpaceHeld.value) {
      isPanning.value = true;
      stageInstance.container().style.cursor = "grabbing";
    }
  });

  stageInstance.on("dragend", () => {
    if (isSpaceHeld.value) {
      isPanning.value = false;
      stageInstance.container().style.cursor = "grab";
    }
  });

  // 鼠标/触摸按下
  stageInstance.on("mousedown touchstart", (e) => {
    // Space 平移模式下不处理绘制
    if (isSpaceHeld.value) return;

    const activeLayer = props.layers.find((l) => l.id === props.activeLayerId);
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) return;

    const pos = stageInstance.getPointerPosition();
    if (!pos) return;

    // 坐标转换
    const transform = stageInstance.getAbsoluteTransform().copy().invert();
    const docPoint = transform.point(pos);

    // 1. 选择工具
    if (props.activeTool === "select") {
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

      const textObj: SketchObject = {
        id: nanoid(), // 临时 ID
        type: "text",
        x: docPoint.x,
        y: docPoint.y,
        width: 200,
        height: 50,
        rotation: 0,
        opacity: 1,
        locked: false,
        content: "双击编辑文字",
        fontSize: props.fontSize,
        fontFamily: "sans-serif",
        fontWeight: props.fontWeight,
        fontStyle: props.fontStyle,
        textAlign: props.textAlign,
        color: props.textColor,
        backgroundColor: null,
        lineHeight: 1.2,
      };

      const textNode = createKonvaNode(textObj) as Konva.Text;
      const konvaLayer = stageInstance.findOne(`#${activeLayer.id}`) as Konva.Layer;
      if (konvaLayer) {
        konvaLayer.add(textNode);
        konvaLayer.batchDraw();

        // 绑定双击编辑事件
        textNode.on("dblclick dbltap", () => {
          startEditing(textNode, stageInstance);
        });

        // 自动进入编辑状态
        startEditing(textNode, stageInstance);

        // 记录历史
        emit("push-history", {
          type: "object-add",
          layerId: activeLayer.id,
          object: serializeKonvaNode(textNode),
        });
      }
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

    if (tempShape && ["rect", "ellipse", "line", "arrow"].includes(props.activeTool)) {
      const pos = stageInstance.getPointerPosition();
      if (!pos) return;

      const transform = stageInstance.getAbsoluteTransform().copy().invert();
      const docPoint = transform.point(pos);

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
    }
  });

  // 鼠标/触摸抬起
  stageInstance.on("mouseup touchend", () => {
    if (isDrawing.value) {
      stopDrawing(props.activeLayerId, (entry) => {
        emit("push-history", entry);
      });
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
  if (!stage.value) return;

  // 1. 移除已经不存在的 Konva 图层
  const existingLayers = stage.value.getLayers();
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
      // 只有活跃的对象图层，其子节点才可拖拽和交互
      konvaLayer.getChildren().forEach((node) => {
        if (node.name() === "object-node") {
          node.draggable(isCurrentActive && !layer.locked && props.activeTool === "select");
        }
      });
    }
  });
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
  stopEditing();
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

// 暴露方法给父组件
defineExpose({
  getStage: () => stage.value,
  getCanvases: () => canvases,
  getZoom: () => zoom.value,
  createKonvaNode,
  serializeKonvaNode,
  addImageToActiveLayer,
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
      emit("selection-change", 0);
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
        emit("selection-change", objectNodes.length);
      }
    }
  },
  updateSelectionColor: (color: string) => {
    selectedNodes.value.forEach((node) => {
      if (node instanceof Konva.Shape) {
        node.stroke(color);
      }
    });
    stage.value?.batchDraw();
  },
  updateSelectionStrokeWidth: (width: number) => {
    selectedNodes.value.forEach((node) => {
      if (node instanceof Konva.Shape) {
        node.strokeWidth(width);
      }
    });
    stage.value?.batchDraw();
  },
});
</script>

<style scoped>
.canvas-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 透明棋盘格背景 */
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.02) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.02) 75%);
  background-size: 24px 24px;
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0px;
  background-color: #1a1a1a;
}

.bottom-bar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  padding: 4px 10px;
  z-index: 50;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.12s;
}

.bar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.bar-btn.active {
  color: var(--el-color-primary);
}

.zoom-value {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}

.zoom-value:hover {
  color: #fff;
}
</style>
