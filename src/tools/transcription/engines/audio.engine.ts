import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getModelParams } from "./base";
import { cleanLlmOutput } from "../utils/text";
import type { ITranscriptionEngine, EngineContext, EngineResult } from "../types";

export class AudioTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return asset.type === "audio";
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const { sendRequest } = useLlmRequest();

    const { modelIdentifier, prompt, temperature, maxTokens, timeout } = getModelParams(ctx, "audio");
    const [profileId, modelId] = modelIdentifier.split(":");

    const buffer = await assetManagerEngine.getAssetBinary(task.path);
    const base64Data = await convertArrayBufferToBase64(buffer);

    const finalPrompt = task.filename ? prompt.replace(/\{filename\}/g, task.filename) : prompt;

    const content: LlmMessageContent[] = [
      { type: "text", text: finalPrompt },
      {
        type: "audio",
        source: {
          type: "base64",
          media_type: task.mimeType || "audio/mpeg",
          data: base64Data
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
      timeout: timeout * 1000,
    });

    const cleanedText = cleanLlmOutput(response.content);

    return {
      text: cleanedText,
      isEmpty: !cleanedText || cleanedText.trim().length === 0
    };
  }
}