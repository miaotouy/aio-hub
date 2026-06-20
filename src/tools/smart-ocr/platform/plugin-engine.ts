import { execute } from "@/services/executor";
import { pluginManager } from "@/services/plugin-manager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { ocrImageToPluginImage } from "./adapters/image-input";
import type { ImageBlock, OcrImageInput, OcrResult } from "./types";

const logger = createModuleLogger("OCR/PluginEngine");
const errorHandler = createModuleErrorHandler("OCR/PluginEngine");

interface PluginOcrConfig {
  pluginId: string;
  method: string;
  modelProfile?: string;
  language?: string;
}

interface PluginOcrBatchResult {
  results?: Array<{
    id?: string;
    groupId?: string;
    blockId?: string;
    imageId?: string;
    text?: string;
    confidence?: number;
    boxes?: Array<{
      text?: string;
      confidence?: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    status?: "success" | "error";
    error?: string;
  }>;
}

function findPlugin(pluginId: string) {
  return (
    pluginManager.getPlugin(pluginId) ??
    pluginManager.getPlugin(`${pluginId}-dev`)
  );
}

function assertPluginReady(pluginId: string, method: string): string {
  if (!pluginId || !method) {
    throw new Error("未选择可用的 OCR 插件引擎，请先安装并选择 OCR 扩展插件");
  }

  const plugin = findPlugin(pluginId);

  if (!plugin) {
    throw new Error(
      `未安装 OCR 插件 "${pluginId}"，请先在插件管理中导入并启用 OCR 扩展插件`
    );
  }

  const state = pluginManager.pluginStates[plugin.id];
  if (state?.isBroken) {
    throw new Error(`OCR 插件 "${plugin.name}" 已损坏，请重新安装插件`);
  }

  if (!(state?.enabled ?? plugin.enabled)) {
    throw new Error(`OCR 插件 "${plugin.name}" 未启用，请先在插件管理中启用`);
  }

  const methods =
    plugin.getMetadata?.().methods ?? plugin.manifest.methods ?? [];
  const hasMethod = methods.some((item) => item.name === method);

  if (!hasMethod) {
    throw new Error(`OCR 插件 "${plugin.name}" 不存在方法: ${method}`);
  }

  return plugin.id;
}

function blockToOcrImage(block: ImageBlock): OcrImageInput {
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

function createPendingResults(images: OcrImageInput[]): OcrResult[] {
  return images.map((image) => ({
    blockId: image.id,
    imageId: image.groupId ?? image.id,
    text: "",
    status: "pending" as const,
  }));
}

function getPluginResultKey(
  result: NonNullable<PluginOcrBatchResult["results"]>[number]
) {
  const imageId = result.groupId ?? result.imageId ?? result.id;
  const blockId = result.id ?? result.blockId ?? result.imageId;
  return `${imageId}:${blockId}`;
}

function getImageKey(image: OcrImageInput) {
  return `${image.groupId ?? image.id}:${image.id}`;
}

export function usePluginOcrEngine() {
  const recognizeImages = async (
    images: OcrImageInput[],
    config: PluginOcrConfig,
    onProgress?: (results: OcrResult[]) => void,
    signal?: AbortSignal
  ): Promise<OcrResult[]> => {
    const results = createPendingResults(images);

    onProgress?.(results);

    try {
      const resolvedPluginId = assertPluginReady(
        config.pluginId,
        config.method
      );

      logger.info(`使用插件 OCR 引擎识别 (${images.length} 块)`, {
        pluginId: resolvedPluginId,
        method: config.method,
        blocksCount: images.length,
      });

      const processingResults = results.map((result) => ({
        ...result,
        status: "processing" as const,
      }));
      onProgress?.(processingResults);

      if (signal?.aborted) {
        const cancelledResults = results.map((result) => ({
          ...result,
          status: "cancelled" as const,
        }));
        onProgress?.(cancelledResults);
        return cancelledResults;
      }

      const response = await execute<PluginOcrBatchResult>({
        service: resolvedPluginId,
        method: config.method,
        params: {
          images: images.map(ocrImageToPluginImage),
          options: {
            modelProfile: config.modelProfile,
            language: config.language,
          },
        },
      });

      if (!response.success) {
        throw response.error;
      }

      if (signal?.aborted) {
        const cancelledResults = results.map((result) => ({
          ...result,
          status: "cancelled" as const,
        }));
        onProgress?.(cancelledResults);
        return cancelledResults;
      }

      const pluginResults = response.data?.results;
      if (!Array.isArray(pluginResults)) {
        throw new Error("OCR 插件返回结果格式错误：缺少 results 数组");
      }

      const resultByKey = new Map(
        pluginResults.map((result) => [getPluginResultKey(result), result])
      );

      const finalResults = images.map((image) => {
        const pluginResult = resultByKey.get(getImageKey(image));

        if (!pluginResult) {
          return {
            blockId: image.id,
            imageId: image.groupId ?? image.id,
            text: "",
            status: "error" as const,
            error: "OCR 插件未返回该图片块的识别结果",
          };
        }

        if (pluginResult.status === "error") {
          return {
            blockId: image.id,
            imageId: image.groupId ?? image.id,
            text: pluginResult.text?.trim() ?? "",
            confidence: pluginResult.confidence,
            status: "error" as const,
            error: pluginResult.error || "OCR 插件识别失败",
          };
        }

        return {
          blockId: image.id,
          imageId: image.groupId ?? image.id,
          text: pluginResult.text?.trim() ?? "",
          confidence: pluginResult.confidence,
          status: "success" as const,
        };
      });

      onProgress?.(finalResults);
      return finalResults;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "插件 OCR 识别失败",
        context: {
          pluginId: config.pluginId,
          method: config.method,
          blocksCount: images.length,
        },
        showToUser: false,
      });

      const errorResults = results.map((result) => ({
        ...result,
        status: "error" as const,
        error: error instanceof Error ? error.message : String(error),
      }));
      onProgress?.(errorResults);
      return errorResults;
    }
  };

  const recognizeBatch = async (
    blocks: ImageBlock[],
    config: PluginOcrConfig,
    onProgress?: (results: OcrResult[]) => void,
    signal?: AbortSignal
  ): Promise<OcrResult[]> => {
    return recognizeImages(
      blocks.map(blockToOcrImage),
      config,
      onProgress,
      signal
    );
  };

  return {
    recognizeBatch,
    recognizeImages,
  };
}
