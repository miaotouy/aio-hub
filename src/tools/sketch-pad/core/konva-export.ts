import type Konva from "konva";

export interface StageImageExportOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pixelRatio?: number;
  mimeType?: string;
  quality?: number;
}

/**
 * Export document coordinates, not the currently panned/zoomed editor viewport.
 */
export function exportStageToCanvas(
  stage: Konva.Stage,
  options: StageImageExportOptions
): HTMLCanvasElement {
  const originalTransform = {
    x: stage.x(),
    y: stage.y(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
  };

  try {
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });

    return stage.toCanvas({
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio ?? 1,
    });
  } finally {
    stage.position({ x: originalTransform.x, y: originalTransform.y });
    stage.scale({ x: originalTransform.scaleX, y: originalTransform.scaleY });
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = "image/png",
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("导出草图图片失败"));
        }
      },
      mimeType,
      quality
    );
  });
}
