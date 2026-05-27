import { ref } from "vue";
import type Konva from "konva";
import {
  getStrokeOutline,
  drawStrokeOutline,
  type StrokePoint,
  type BrushOptions,
} from "../core/brush-engine";
import type { HistoryEntry } from "./useHybridHistory";

export function useRasterBrush() {
  const isDrawing = ref(false);
  const strokePoints = ref<StrokePoint[]>([]);

  // 记录绘制前的 ImageData 用于撤销
  let beforeImageData: ImageData | null = null;
  let drawingCanvas: HTMLCanvasElement | null = null;
  let drawingCtx: CanvasRenderingContext2D | null = null;
  let drawingNode: Konva.Image | null = null;
  let dirtyRect = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  function startDrawing(
    e: PointerEvent,
    stage: Konva.Stage,
    canvas: HTMLCanvasElement,
    node: Konva.Image,
    options: BrushOptions
  ) {
    isDrawing.value = true;
    drawingCanvas = canvas;
    drawingCtx = canvas.getContext("2d");
    drawingNode = node;
    strokePoints.value = [];

    // 重置脏矩形
    dirtyRect = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };

    // 获取文档坐标
    const transform = stage.getAbsoluteTransform().copy().invert();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const docPoint = transform.point(pos);

    const point = { x: docPoint.x, y: docPoint.y, pressure: e.pressure };
    strokePoints.value.push(point);
    updateDirtyRect(point.x, point.y, options.size);

    // 备份整个 Canvas 的 ImageData 用于撤销
    if (drawingCtx) {
      beforeImageData = drawingCtx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }

  function draw(e: PointerEvent, stage: Konva.Stage, options: BrushOptions) {
    if (!isDrawing.value || !drawingCtx || !drawingCanvas || !drawingNode)
      return;

    const transform = stage.getAbsoluteTransform().copy().invert();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const docPoint = transform.point(pos);

    const point = { x: docPoint.x, y: docPoint.y, pressure: e.pressure };
    strokePoints.value.push(point);
    updateDirtyRect(point.x, point.y, options.size);

    // 重新绘制整条线（perfect-freehand 需要全量点计算平滑轮廓）
    // 为了避免闪烁，我们在绘制前先恢复到 beforeImageData，然后绘制整条线
    if (beforeImageData) {
      drawingCtx.putImageData(beforeImageData, 0, 0);
    }

    const outline = getStrokeOutline(strokePoints.value, options);
    drawStrokeOutline(drawingCtx, outline, options);

    // 刷新 Konva 节点
    drawingNode.getLayer()?.batchDraw();
  }

  function stopDrawing(
    layerId: string,
    pushHistory: (entry: HistoryEntry) => void
  ) {
    if (!isDrawing.value || !drawingCtx || !drawingCanvas || !drawingNode)
      return;
    isDrawing.value = false;

    // 记录绘制后的 ImageData
    const afterImageData = drawingCtx.getImageData(
      0,
      0,
      drawingCanvas.width,
      drawingCanvas.height
    );

    if (beforeImageData) {
      // 限制脏矩形在画布范围内
      const x = Math.max(0, Math.floor(dirtyRect.minX));
      const y = Math.max(0, Math.floor(dirtyRect.minY));
      const width = Math.min(
        drawingCanvas.width - x,
        Math.ceil(dirtyRect.maxX - dirtyRect.minX)
      );
      const height = Math.min(
        drawingCanvas.height - y,
        Math.ceil(dirtyRect.maxY - dirtyRect.minY)
      );

      if (width > 0 && height > 0) {
        pushHistory({
          type: "raster-pixels",
          layerId,
          rect: { x, y, width, height },
          before: beforeImageData,
          after: afterImageData,
        });
      }
    }

    beforeImageData = null;
    drawingCanvas = null;
    drawingCtx = null;
    drawingNode = null;
  }

  function updateDirtyRect(x: number, y: number, brushSize: number) {
    const padding = brushSize * 2;
    dirtyRect.minX = Math.min(dirtyRect.minX, x - padding);
    dirtyRect.minY = Math.min(dirtyRect.minY, y - padding);
    dirtyRect.maxX = Math.max(dirtyRect.maxX, x + padding);
    dirtyRect.maxY = Math.max(dirtyRect.maxY, y + padding);
  }

  return {
    isDrawing,
    startDrawing,
    draw,
    stopDrawing,
  };
}
