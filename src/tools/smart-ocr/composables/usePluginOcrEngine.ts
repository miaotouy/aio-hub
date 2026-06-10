import { execute } from "@/services/executor";
import { pluginManager } from "@/services/plugin-manager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type { ImageBlock, OcrResult } from "../types";

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
    blockId: string;
    imageId: string;
    text?: string;
    confidence?: number;
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
  const plugin = findPlugin(pluginId);

  if (!plugin) {
    throw new Error(
      `未安装 OCR 插件 "${pluginId}"，请先在插件管理中导入并启用 Paddle OCR 插件`
    );
  }

  const state = pluginManager.pluginStates[plugin.id];
  if (state?.isBroken) {
    throw new Error(`OCR 插件 "${plugin.name}" 已损坏，请重新安装插件`);
  }

  if (!plugin.enabled) {
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

export function usePluginOcrEngine() {
  const recognizeBatch = async (
    blocks: ImageBlock[],
    config: PluginOcrConfig,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const results: OcrResult[] = blocks.map((block) => ({
      blockId: block.id,
      imageId: block.imageId,
      text: "",
      status: "pending" as const,
    }));

    onProgress?.(results);

    try {
      const resolvedPluginId = assertPluginReady(config.pluginId, config.method);

      logger.info(`使用插件 OCR 引擎识别 (${blocks.length} 块)`, {
        pluginId: resolvedPluginId,
        method: config.method,
        blocksCount: blocks.length,
      });

      const processingResults = results.map((result) => ({
        ...result,
        status: "processing" as const,
      }));
      onProgress?.(processingResults);

      const response = await execute<PluginOcrBatchResult>({
        service: resolvedPluginId,
        method: config.method,
        params: {
          images: blocks.map((block) => ({
            blockId: block.id,
            imageId: block.imageId,
            dataUrl: block.dataUrl,
            width: block.width,
            height: block.height,
          })),
          options: {
            modelProfile: config.modelProfile,
            language: config.language,
          },
        },
      });

      if (!response.success) {
        throw response.error;
      }

      const pluginResults = response.data?.results;
      if (!Array.isArray(pluginResults)) {
        throw new Error("OCR 插件返回结果格式错误：缺少 results 数组");
      }

      const resultByKey = new Map(
        pluginResults.map((result) => [
          `${result.imageId}:${result.blockId}`,
          result,
        ])
      );

      const finalResults = blocks.map((block) => {
        const pluginResult = resultByKey.get(`${block.imageId}:${block.id}`);

        if (!pluginResult) {
          return {
            blockId: block.id,
            imageId: block.imageId,
            text: "",
            status: "error" as const,
            error: "OCR 插件未返回该图片块的识别结果",
          };
        }

        if (pluginResult.status === "error") {
          return {
            blockId: block.id,
            imageId: block.imageId,
            text: pluginResult.text?.trim() ?? "",
            confidence: pluginResult.confidence,
            status: "error" as const,
            error: pluginResult.error || "OCR 插件识别失败",
          };
        }

        return {
          blockId: block.id,
          imageId: block.imageId,
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
          blocksCount: blocks.length,
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

  return {
    recognizeBatch,
  };
}
