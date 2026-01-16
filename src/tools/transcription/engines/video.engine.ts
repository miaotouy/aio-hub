import { invoke } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import { getModelParams, getEffectiveConfig } from "./base";
import { cleanLlmOutput } from "../utils/text";
import type { ITranscriptionEngine, EngineContext, EngineResult } from "../types";

const logger = createModuleLogger("transcription/engines/video");

export class VideoTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "video";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const config = getEffectiveConfig(ctx);
    const { sendRequest } = useLlmRequest();

    const { modelIdentifier, prompt, temperature, maxTokens, timeout } = getModelParams(ctx, "video");
    const [profileId, modelId] = modelIdentifier.split(":");

    // 1. 获取二进制数据 (处理视频压缩逻辑)
    const assetPath = task.path;
    let finalPath = assetPath;

    // 视频特殊处理：检查是否需要压缩，或复用已有的压缩文件
    let reuseTempFile = false;
    if (task.tempFilePath) {
      try {
        const basePath = await assetManagerEngine.getAssetBasePath();
        const tempFullPath = `${basePath}/${task.tempFilePath}`.replace(/\\/g, "/");
        await stat(tempFullPath);
        finalPath = task.tempFilePath;
        reuseTempFile = true;
        logger.info("复用已有的压缩视频文件", { assetId: task.assetId, path: finalPath });
      } catch (e) {
        task.tempFilePath = undefined;
      }
    }

    if (!reuseTempFile) {
      const ffmpegPath = config.ffmpegPath;
      const maxDirectSizeMB = config.video?.maxDirectSizeMB || 10;

      const basePath = await assetManagerEngine.getAssetBasePath();
      const fullPath = `${basePath}/${assetPath}`.replace(/\\/g, "/");

      let shouldCompress = false;
      if (config.video?.enableCompression && ffmpegPath) {
        const isFfmpegAvailable = await invoke<boolean>("check_ffmpeg_availability", { path: ffmpegPath });
        if (isFfmpegAvailable) {
          try {
            const fileStat = await stat(fullPath);
            const sizeMB = fileStat.size / (1024 * 1024);
            if (sizeMB > maxDirectSizeMB) {
              shouldCompress = true;
              logger.info(`视频大小 (${sizeMB.toFixed(2)}MB) 超过阈值 (${maxDirectSizeMB}MB)，将尝试压缩`);
            }
          } catch (e) {
            logger.warn("无法获取视频文件大小，将尝试直接处理", e);
          }
        }
      }

      if (shouldCompress) {
        try {
          const preset = "auto_size";
          const maxFps = config.video?.maxFps || 12;
          const maxResolution = config.video?.maxResolution || 720;
          const outputPath = `${fullPath}_compressed.mp4`;

          await invoke("compress_video", {
            inputPath: fullPath,
            outputPath: outputPath,
            preset: preset,
            ffmpegPath: ffmpegPath,
            maxSizeMb: maxDirectSizeMB,
            maxFps: maxFps,
            maxResolution: maxResolution,
          });

          finalPath = `${assetPath}_compressed.mp4`;
          task.tempFilePath = finalPath;
          logger.info("视频压缩完成，使用压缩文件", { finalPath });
        } catch (e) {
          logger.error("视频压缩失败，回退到原始文件", e);
          finalPath = assetPath;
        }
      }
    }

    // 2. 发送请求
    // 让出主线程执行权，确保 UI 状态（如转圈动画）能优先渲染
    await new Promise(resolve => setTimeout(resolve, 0));

    const buffer = await assetManagerEngine.getAssetBinary(finalPath);

    const finalPrompt = task.filename ? prompt.replace(/\{filename\}/g, task.filename) : prompt;

    // 提示：针对视频这种超大请求体，我们在 sendRequest 内部（Provider 层）
    // 已经实现了基于 Worker 的异步序列化优化，因此这里可以直接传递 ArrayBuffer 而不会阻塞主线程。
    const response = await sendRequest({
      profileId,
      modelId,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: finalPrompt },
          {
            type: "video",
            source: {
              type: "base64",
              media_type: task.mimeType || "video/mp4",
              data: buffer // 直接传递 ArrayBuffer
            }
          }
        ]
      }],
      stream: false,
      temperature,
      maxTokens,
      timeout: timeout * 1000, // 转换为毫秒
    });

    const cleanedText = cleanLlmOutput(response.content);

    return {
      text: cleanedText,
      isEmpty: !cleanedText || cleanedText.trim().length === 0
    };
  }
}