// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { AssetMetadata, AssetType } from "../../../types/asset-management";
import type { LlmModelInfo } from "../../../types/llm-profiles";
import { computeResizedDimensions } from "../../../utils/imageDimensions";
import type {
  TokenCalculationResult,
  TokenCalculatorEngine,
} from "./tokenCalculatorEngine";
import type { TextTokenCalculator } from "./tokenCalculationScope";

export type TokenMediaAttachment = {
  type: AssetType;
  metadata?: AssetMetadata;
};
export type MessageTokenCalculator = (
  text: string,
  modelId: string,
  attachments?: TokenMediaAttachment[],
  options?: { maxImageDimension?: number }
) => Promise<TokenCalculationResult>;

export interface TokenCalculationScope {
  calculateTokens: TextTokenCalculator;
  calculateMessageTokens: MessageTokenCalculator;
}

export interface MessageTokenPorts {
  getModel(modelId: string): Pick<LlmModelInfo, "capabilities"> | undefined;
  media: {
    calculateImageTokens(
      ...args: Parameters<TokenCalculatorEngine["calculateImageTokens"]>
    ): number | Promise<number>;
    calculateVideoTokens(
      ...args: Parameters<TokenCalculatorEngine["calculateVideoTokens"]>
    ): number | Promise<number>;
    calculateAudioTokens(
      ...args: Parameters<TokenCalculatorEngine["calculateAudioTokens"]>
    ): number | Promise<number>;
  };
}

/** Shared production accounting; execution owners supply text, model snapshot and media engine. */
export function createMessageTokenCalculator(
  ports: MessageTokenPorts,
  calculateText: TextTokenCalculator
): MessageTokenCalculator {
  return async (text, modelId, attachments, options) => {
    const textResult = await calculateText(text, modelId);
    let totalTokens = textResult.count;
    const textTokenCount = textResult.count;
    let mediaTokenCount = 0;
    let imageTokenCount = 0;
    let videoTokenCount = 0;
    let audioTokenCount = 0;

    // 2. 如果有附件，计算附件 Token
    if (attachments && attachments.length > 0) {
      // Read the configured model snapshot; never resolve mutable global metadata here.
      const model = ports.getModel(modelId);

      // 如果模型未定义视觉规则，默认使用 Gemini 2.0 规则作为参考
      // 这样即使在未配置的模型上也能得到一个估算值
      const defaultVisionCost = {
        calculationMethod: "gemini_2_0",
        parameters: {},
      } as const;
      const visionTokenCost =
        model?.capabilities?.visionTokenCost || defaultVisionCost;

      const mediaPromises = attachments.map(async (asset) => {
        // 处理图片
        if (asset.type === "image") {
          const originalWidth = asset.metadata?.width || 1024;
          const originalHeight = asset.metadata?.height || 1024;
          // 模拟发送前的等比缩放（模型安全约束 / 用户压缩），与 asset-resolver 行为一致
          const { width, height } = computeResizedDimensions(
            originalWidth,
            originalHeight,
            options?.maxImageDimension ?? 0
          );

          const imageTokens = await ports.media.calculateImageTokens(
            width,
            height,
            visionTokenCost
          );
          imageTokenCount += imageTokens;
          mediaTokenCount += imageTokens;
          totalTokens += imageTokens;
        }
        // 处理视频
        else if (asset.type === "video") {
          if (asset.metadata?.duration) {
            const videoTokens = await ports.media.calculateVideoTokens(
              asset.metadata.duration
            );
            videoTokenCount += videoTokens;
            mediaTokenCount += videoTokens;
            totalTokens += videoTokens;
          }
        }
        // 处理音频
        else if (asset.type === "audio") {
          if (asset.metadata?.duration) {
            const audioTokens = await ports.media.calculateAudioTokens(
              asset.metadata.duration
            );
            audioTokenCount += audioTokens;
            mediaTokenCount += audioTokens;
            totalTokens += audioTokens;
          }
        }
      });

      await Promise.all(mediaPromises);
    }

    // 判断是否为估算值
    // 如果有附件且缺少元数据（如宽高或时长），则标记为估算值
    const hasAttachmentsWithoutMetadata =
      attachments &&
      attachments.length > 0 &&
      attachments.some((a) => {
        if (a.type === "image")
          return !a.metadata?.width || !a.metadata?.height;
        if (a.type === "video" || a.type === "audio")
          return !a.metadata?.duration;
        return false;
      });

    return {
      count: totalTokens,
      textTokenCount,
      mediaTokenCount,
      imageTokenCount,
      videoTokenCount,
      audioTokenCount,
      isEstimated:
        (textResult.isEstimated ?? false) || !!hasAttachmentsWithoutMetadata,
      tokenizerName: textResult.tokenizerName,
    };
  };
}
