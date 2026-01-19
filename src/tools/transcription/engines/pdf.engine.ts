import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { convertPdfToImages } from "@/utils/pdfUtils";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getModelParams } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type { ITranscriptionEngine, EngineContext, EngineResult } from "../types";

export class PdfTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "document" && asset.mimeType === "application/pdf";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const { sendRequest } = useLlmRequest();
    const { getProfileById } = useLlmProfiles();

    const { modelIdentifier, prompt, temperature, maxTokens, timeout, enableRepetitionDetection } = getModelParams(ctx, "document");
    const [profileId, modelId] = modelIdentifier.split(":");

    const profile = getProfileById(profileId);
    const model = profile?.models.find((m) => m.id === modelId);
    const capabilities = model?.capabilities || {};

    const buffer = await assetManagerEngine.getAssetBinary(task.path);
    const finalPrompt = task.filename ? prompt.replace(/\{filename\}/g, task.filename) : prompt;

    let transcriptionText: string;

    // 1. 如果模型原生支持 PDF
    if (capabilities.document) {
      const base64Data = await convertArrayBufferToBase64(buffer);
      const content: LlmMessageContent[] = [
        { type: "text", text: finalPrompt },
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64Data,
          },
        }
      ];
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content }],
        stream: false,
        temperature,
        maxTokens,
        timeout: timeout * 1000,
        signal: ctx.signal,
      });
      transcriptionText = response.content;
    }
    // 2. 如果模型不支持 PDF 但支持视觉，则将 PDF 转为图片
    else if (capabilities.vision) {
      const images = await convertPdfToImages(buffer);
      if (images.length === 0) {
        throw new Error("PDF 转图片失败：未生成任何图片");
      }

      // 这里为了简化，暂不支持分批处理，只取前几页或全部
      const PDF_BATCH_SIZE = 5;
      if (images.length <= PDF_BATCH_SIZE) {
        const content: LlmMessageContent[] = [{ type: "text", text: finalPrompt }];
        for (const img of images) {
          content.push({ type: "image", imageBase64: img.base64 });
        }
        const response = await sendRequest({
          profileId,
          modelId,
          messages: [{ role: "user", content }],
          stream: false,
          temperature,
          maxTokens,
          timeout: timeout * 1000,
          signal: ctx.signal,
        });
        transcriptionText = response.content;
      } else {
        // 分批逻辑迁移
        const batchResults: string[] = [];
        for (let i = 0; i < images.length; i += PDF_BATCH_SIZE) {
          const batch = images.slice(i, i + PDF_BATCH_SIZE);
          const startLabel = `第 ${i + 1} 页`;
          const endLabel = `第 ${Math.min(i + PDF_BATCH_SIZE, images.length)} 页`;

          const batchContent: LlmMessageContent[] = [
            {
              type: "text",
              text: `${finalPrompt}\n\n[这是内容的 ${startLabel} 到 ${endLabel}]`,
            },
          ];

          for (const item of batch) {
            batchContent.push({ type: "image", imageBase64: item.base64 });
          }

          const response = await sendRequest({
            profileId,
            modelId,
            messages: [{ role: "user", content: batchContent }],
            stream: false,
            temperature,
            maxTokens,
            timeout: timeout * 1000,
            signal: ctx.signal,
          });
          batchResults.push(`## ${startLabel}-${endLabel}\n\n${response.content}`);
        }
        transcriptionText = batchResults.join("\n---\n\n");
      }
    } else {
      throw new Error("无法处理 PDF：模型既不支持原生 PDF，也不支持视觉（图片）");
    }

    const cleanedText = cleanLlmOutput(transcriptionText);
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