import JSZip from "jszip";
import type { SketchProject, HybridSketchFile, HybridLayer } from "../types";
import type Konva from "konva";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("SketchPad/Packager");
const errorHandler = createModuleErrorHandler("SketchPad/Packager");

export interface PackagedSketch {
  manifest: HybridSketchFile;
  thumbnailDataUrl: string;
  rasterLayers: Map<string, Uint8Array>; // layerId -> png bytes
}

/**
 * 将草图项目打包为 .aiosk (ZIP) 格式的二进制数据
 */
export async function packageSketch(
  project: SketchProject,
  layers: HybridLayer[],
  canvases: Map<string, HTMLCanvasElement>,
  stage: Konva.Stage,
): Promise<Uint8Array | null> {
  return await errorHandler.wrapAsync(
    async () => {
      const zip = new JSZip();

      // 1. 生成并添加缩略图
      const overlay = stage.findOne(".overlay");
      if (overlay) overlay.hide();
      const thumbnailDataUrl = stage.toDataURL({ pixelRatio: 1 });
      if (overlay) overlay.show();

      // 直接解码 base64 data URL，避免 fetch 触发 CSP 拦截
      const base64Data = thumbnailDataUrl.split(",")[1];
      const binaryStr = atob(base64Data);
      const thumbBuffer = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        thumbBuffer[i] = binaryStr.charCodeAt(i);
      }
      zip.file("thumbnail.png", thumbBuffer);

      // 2. 添加图层文件
      const layersFolder = zip.folder("layers");
      if (!layersFolder) throw new Error("创建 layers 文件夹失败");

      for (const layer of layers) {
        if (layer.type === "raster") {
          const canvas = canvases.get(layer.id);
          if (canvas) {
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (blob) {
              const buffer = await blob.arrayBuffer();
              layersFolder.file(`${layer.id}.png`, buffer);
            }
          }
        } else if (layer.type === "object") {
          layersFolder.file(`${layer.id}.json`, JSON.stringify(layer.objects, null, 2));
        }
      }

      // 3. 添加 manifest.json
      const manifest: HybridSketchFile = {
        version: 1,
        project,
        layers,
        assetRefs: [],
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      // 4. 生成 ZIP 二进制数据
      const content = await zip.generateAsync({ type: "uint8array" });
      logger.info("草图打包成功", { id: project.id });
      return content;
    },
    { userMessage: "打包草图失败" },
  );
}

/**
 * 从 .aiosk (ZIP) 二进制数据中解包草图项目
 */
export async function unpackageSketch(data: Uint8Array): Promise<PackagedSketch | null> {
  return await errorHandler.wrapAsync(
    async () => {
      const zip = await JSZip.loadAsync(data);

      // 1. 读取 manifest.json
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) throw new Error("未找到 manifest.json");
      const manifestContent = await manifestFile.async("string");
      const manifest = JSON.parse(manifestContent) as HybridSketchFile;

      // 2. 读取缩略图
      const thumbFile = zip.file("thumbnail.png");
      let thumbnailDataUrl = "";
      if (thumbFile) {
        const thumbBuffer = await thumbFile.async("arraybuffer");
        const blob = new Blob([thumbBuffer], { type: "image/png" });
        thumbnailDataUrl = URL.createObjectURL(blob);
      }

      // 3. 读取位图图层数据
      const rasterLayers = new Map<string, Uint8Array>();
      const layersFolder = zip.folder("layers");
      if (layersFolder) {
        for (const layer of manifest.layers) {
          if (layer.type === "raster") {
            const file = layersFolder.file(`${layer.id}.png`);
            if (file) {
              const buffer = await file.async("uint8array");
              rasterLayers.set(layer.id, buffer);
            }
          }
        }
      }

      logger.info("草图解包成功", { id: manifest.project.id });
      return {
        manifest,
        thumbnailDataUrl,
        rasterLayers,
      };
    },
    { userMessage: "解包草图失败" },
  );
}
