import { getStroke } from "perfect-freehand";

export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface BrushOptions {
  size: number;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  color: string;
  opacity: number;
  type: "pencil" | "marker" | "eraser";
}

/**
 * 使用 perfect-freehand 计算平滑的笔画轮廓多边形
 */
export function getStrokeOutline(points: StrokePoint[], options: BrushOptions): number[][] {
  if (points.length === 0) return [];

  const inputPoints = points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);

  // 根据笔刷类型调整 perfect-freehand 参数
  const thinning = options.type === "marker" ? 0 : (options.thinning ?? 0.5);
  const smoothing = options.smoothing ?? 0.5;
  const streamline = options.streamline ?? 0.5;

  return getStroke(inputPoints, {
    size: options.size,
    thinning,
    smoothing,
    streamline,
    simulatePressure: options.type !== "marker",
  });
}

/**
 * 将笔画轮廓绘制到 Canvas 2D 上下文
 */
export function drawStrokeOutline(ctx: CanvasRenderingContext2D, outline: number[][], options: BrushOptions) {
  if (outline.length === 0) return;

  ctx.save();

  // 设置混合模式和透明度
  if (options.type === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity;
  }

  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(outline[i][0], outline[i][1]);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
