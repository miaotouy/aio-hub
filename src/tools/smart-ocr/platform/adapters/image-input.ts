import type { ImageBlock } from "../../types";
import type { OcrImageInput } from "../types";

export function createOcrImageFromDataUrl(
  dataUrl: string,
  options: {
    id: string;
    groupId?: string;
    width: number;
    height: number;
    metadata?: Record<string, unknown>;
  }
): OcrImageInput {
  return {
    id: options.id,
    groupId: options.groupId,
    dataUrl,
    width: options.width,
    height: options.height,
    metadata: options.metadata,
  };
}

export function imageBlockToOcrImage(block: ImageBlock): OcrImageInput {
  return {
    id: block.id,
    groupId: block.imageId,
    dataUrl: block.dataUrl,
    width: block.width,
    height: block.height,
    metadata: {
      startY: block.startY,
      endY: block.endY,
    },
  };
}

export function ocrImageToPluginImage(image: OcrImageInput) {
  return {
    blockId: image.id,
    imageId: image.groupId ?? image.id,
    dataUrl: image.dataUrl,
    width: image.width,
    height: image.height,
    metadata: image.metadata,
  };
}

export function ocrImageToImageBlock(image: OcrImageInput): ImageBlock {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  return {
    id: image.id,
    imageId: image.groupId ?? image.id,
    canvas,
    dataUrl: image.dataUrl,
    startY: Number(image.metadata?.startY ?? 0),
    endY: Number(image.metadata?.endY ?? image.height),
    width: image.width,
    height: image.height,
  };
}
