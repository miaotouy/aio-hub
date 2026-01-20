import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { stat } from "@tauri-apps/plugin-fs";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getModelParams, getEffectiveConfig } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type { ITranscriptionEngine, EngineContext, EngineResult } from "../types";

const logger = createModuleLogger("transcription/engines/audio");

// 文件大小阈值：超过此值使用 Rust 代理，避免 IPC 阻塞（10MB）
const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024;

export class AudioTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "audio";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const config = getEffectiveConfig(ctx);
    const { sendRequest } = useLlmRequest();

    const { modelIdentifier, prompt, temperature, maxTokens, timeout, enableRepetitionDetection } = getModelParams(ctx, "audio");
    const [profileId, modelId] = modelIdentifier.split(":");

    // 1. 获取资产对象以检查文件大小并处理压缩逻辑
    const assetPath = task.path;
    let finalPath = assetPath;

    // 音频特殊处理：检查是否需要压缩，或复用已有的压缩文件
    let reuseTempFile = false;
    if (task.tempFilePath) {
      try {
        const basePath = await assetManagerEngine.getAssetBasePath();
        const tempFullPath = `${basePath}/${task.tempFilePath}`.replace(/\\/g, "/");
        await stat(tempFullPath);
        finalPath = task.tempFilePath;
        reuseTempFile = true;
        logger.info("复用已有的压缩音频文件", { assetId: task.assetId, path: finalPath });
      } catch (e) {
        task.tempFilePath = undefined;
      }
    }

    if (!reuseTempFile) {
      const ffmpegPath = config.ffmpegPath;
      const maxDirectSizeMB = config.audio?.maxDirectSizeMB || 10;

      const basePath = await assetManagerEngine.getAssetBasePath();
      const fullPath = `${basePath}/${assetPath}`.replace(/\\/g, "/");

      let shouldCompress = false;
      if (config.audio?.enableCompression && ffmpegPath) {
        const isFFmpegAvailable = await invoke<boolean>("check_ffmpeg_availability", { path: ffmpegPath });
        if (isFFmpegAvailable) {
          try {
            const fileStat = await stat(fullPath);
            const sizeMB = fileStat.size / (1024 * 1024);
            if (sizeMB > maxDirectSizeMB) {
              shouldCompress = true;
              logger.info(`音频大小 (${sizeMB.toFixed(2)}MB) 超过阈值 (${maxDirectSizeMB}MB)，将尝试压缩`);
            }
          } catch (e) {
            logger.warn("无法获取音频文件大小，将尝试直接处理", e);
          }
        }
      }

      if (shouldCompress) {
        try {
          const bitrate = config.audio?.bitrate || "128k";
          const outputPath = `${fullPath}_compressed.m4a`;

          // 监听进度
          const unlisten = await listen<{ task_id: string; progress: { percent: number } }>(
            "ffmpeg-progress",
            (event) => {
              if (event.payload.task_id === task.id) {
                task.progress = event.payload.progress.percent;
              }
            }
          );

          try {
            await invoke("process_media", {
              taskId: task.id,
              params: {
                mode: "extract_audio",
                inputPath: fullPath,
                outputPath: outputPath,
                ffmpegPath: ffmpegPath,
                hwaccel: false,
                audioBitrate: bitrate,
              }
            });
          } finally {
            unlisten();
          }

          finalPath = `${assetPath}_compressed.m4a`;
          task.tempFilePath = finalPath;
          logger.info("音频压缩完成，使用压缩文件", { finalPath });
        } catch (e) {
          logger.error("音频压缩失败，回退到原始文件", e);
          finalPath = assetPath;
        }
      }
    }

    // 2. 发送请求
    // 让出主线程执行权
    await new Promise(resolve => setTimeout(resolve, 50));

    const basePath = await assetManagerEngine.getAssetBasePath();
    const fullFullPath = `${basePath}/${finalPath}`.replace(/\\/g, "/");

    const finalPrompt = task.filename ? prompt.replace(/\{filename\}/g, task.filename) : prompt;

    let audioData: string;
    let hasLocalFile = false;

    // 检查处理后的文件大小
    try {
      const finalStat = await stat(fullFullPath);
      if (finalStat.size > FILE_SIZE_THRESHOLD) {
        audioData = `local-file://${fullFullPath}`;
        hasLocalFile = true;
      } else {
        audioData = await assetManagerEngine.getAssetBase64(finalPath);
      }
    } catch (e) {
      // 回退逻辑
      audioData = await assetManagerEngine.getAssetBase64(finalPath);
    }

    const content: LlmMessageContent[] = [
      { type: "text", text: finalPrompt },
      {
        type: "audio",
        source: {
          type: "base64",
          media_type: task.mimeType || "audio/mpeg",
          data: audioData
        }
      }
    ];

    const response = await sendRequest({
      profileId,
      modelId,
      messages: [{ role: "user", content }],
      stream: false,
      temperature,
      maxTokens,
      hasLocalFile: hasLocalFile,
      timeout: timeout * 1000,
      signal: ctx.signal,
    });

    const cleanedText = cleanLlmOutput(response.content);
    const repetition = detectRepetition(cleanedText, config.repetitionConfig);

    if (enableRepetitionDetection && repetition.isRepetitive) {
      throw new Error(`检测到模型回复存在严重复读: ${repetition.reason}`);
    }

    return {
      text: cleanedText,
      isEmpty: !cleanedText || cleanedText.trim().length === 0
    };
  }
}