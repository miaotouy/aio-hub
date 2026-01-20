import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getModelParams } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type { ITranscriptionEngine, EngineContext, EngineResult } from "../types";

// 文件大小阈值：超过此值使用 Rust 代理，避免 IPC 阻塞（10MB）
const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024;

export class AudioTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "audio";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const { sendRequest } = useLlmRequest();

    const { modelIdentifier, prompt, temperature, maxTokens, timeout, enableRepetitionDetection } = getModelParams(ctx, "audio");
    const [profileId, modelId] = modelIdentifier.split(":");

    // 获取资产对象以检查文件大小
    const asset = await assetManagerEngine.getAssetById(task.assetId);
    const fileSize = asset?.size || 0;

    const finalPrompt = task.filename ? prompt.replace(/\{filename\}/g, task.filename) : prompt;

    let audioData: string;
    
    // 智能选择数据传输方式
    if (fileSize > FILE_SIZE_THRESHOLD) {
      // 大文件：使用 local-file:// 协议，让 Rust 代理处理
      const basePath = await assetManagerEngine.getAssetBasePath();
      const fullPath = `${basePath}/${task.path}`.replace(/\\/g, "/");
      audioData = `local-file://${fullPath}`;
    } else {
      // 小文件：直接读取 Base64，减少代理开销
      audioData = await assetManagerEngine.getAssetBase64(task.path);
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
      hasLocalFile: fileSize > FILE_SIZE_THRESHOLD,
      timeout: timeout * 1000,
      signal: ctx.signal,
    });

    const cleanedText = cleanLlmOutput(response.content);
    const repetition = detectRepetition(cleanedText, ctx.config.repetitionConfig);

    if (enableRepetitionDetection && repetition.isRepetitive) {
      throw new Error(`检测到模型回复存在严重复读: ${repetition.reason}`);
    }

    return {
      text: cleanedText,
      isEmpty: !cleanedText || cleanedText.trim().length === 0
    };
  }
}