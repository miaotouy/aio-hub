// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useTranscriptionManager } from "../../composables/features/useTranscriptionManager";
import { isTextFile } from "@/utils/fileTypeDetector";
import { smartDecode } from "@/utils/encoding";
import { isDocxAssetLike, parseDocx } from "@/utils/docxParser";
import {
  isPptxAssetLike,
  isXlsxAssetLike,
  parsePptx,
  parseXlsx,
} from "@/utils/zipDocumentParser";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { getAttachmentBuffer } from "./attachment-binary";
import {
  isPipelineAttachment,
  toPipelineAttachment,
  type AttachmentLike,
} from "../../types/pipeline-attachment";

const logger = createModuleLogger("llm-chat/attachment-resolver");

export interface ResolvedAttachment<TAttachment extends AttachmentLike> {
  type: "text" | "media";
  /** 格式化后的文本内容 (包含 [文件: xxx] 或 [转写: xxx] 包装) */
  content?: string;
  /** 纯文本内容 (不包含包装) */
  rawText?: string;
  asset: TAttachment;
  source?: "file" | "transcription";
}

export async function getTranscriptionAsset(
  attachment: AttachmentLike
): Promise<Asset> {
  if (!isPipelineAttachment(attachment)) {
    return attachment;
  }

  if (attachment.source.kind === "asset-library") {
    const latestAsset = await assetManagerEngine.getAssetById(attachment.id);
    if (latestAsset) return latestAsset;
  }

  return {
    id: attachment.id,
    type: attachment.type,
    name: attachment.name,
    mimeType: attachment.mimeType,
    path:
      attachment.source.kind === "asset-library" ? attachment.source.path : "",
    size: attachment.size ?? 0,
    sourceModule: "llm-chat-pipeline",
    createdAt: "",
    origins: [],
    importStatus: "complete",
    metadata: attachment.metadata,
    inlineData:
      attachment.source.kind === "inline"
        ? {
            base64: attachment.source.base64,
            mimeType: attachment.source.mimeType,
          }
        : undefined,
  };
}

/**
 * 解析附件内容
 * 尝试将附件解析为文本（读取文本文件或获取转写内容），如果无法解析为文本则返回媒体类型
 *
 * @param asset 资产对象
 * @param modelId 当前模型 ID
 * @param profileId 当前配置 ID
 * @param options 选项
 * @param options.force 强制使用转写
 * @param options.silent 静默模式，不输出警告日志（用于 Token 计算等频繁触发场景）
 * @param options.messageDepth 消息深度（用于判断是否触发强制转写）
 */
export async function resolveAttachmentContent<
  TAttachment extends AttachmentLike,
>(
  asset: TAttachment,
  modelId: string,
  profileId: string,
  options: { force?: boolean; silent?: boolean; messageDepth?: number } = {}
): Promise<ResolvedAttachment<TAttachment>> {
  const transcriptionManager = useTranscriptionManager();
  const attachment = toPipelineAttachment(asset);
  const transcriptionAsset = await getTranscriptionAsset(asset);

  try {
    // 优先处理纯文本文件
    if (
      attachment.type === "document" &&
      isTextFile(attachment.name, attachment.mimeType)
    ) {
      try {
        const buffer = await getAttachmentBuffer(attachment);
        const textContent = smartDecode(buffer);

        // 记录日志：读取成功
        // logger.debug("读取文本附件内容", { assetId: asset.id, assetName: asset.name });

        return {
          type: "text",
          content: `\n[文件: ${attachment.name}]\n\`\`\`\n${textContent}\n\`\`\`\n`,
          rawText: textContent,
          asset,
          source: "file",
        };
      } catch (err) {
        logger.warn("读取文本附件失败，将尝试作为媒体附件处理", {
          assetId: attachment.id,
          error: err,
        });
        // 读取失败，继续走下面的流程（虽然下面可能也处理不了，最终会留给 asset-resolver 报错或作为媒体处理）
      }
    }
    // 处理 DOCX 文件
    if (isDocxAssetLike(attachment)) {
      try {
        const buffer = await getAttachmentBuffer(attachment);
        const parseResult = await parseDocx(buffer);
        return {
          type: "text",
          content: `\n[文件: ${attachment.name}]\n${parseResult.text}\n`,
          rawText: parseResult.text,
          asset,
          source: "file",
        };
      } catch (err) {
        logger.warn("解析 DOCX 附件失败，将尝试作为媒体附件处理", {
          assetId: attachment.id,
          error: err,
        });
      }
    }

    // 处理 PPTX 文件
    if (isPptxAssetLike(attachment)) {
      try {
        const buffer = await getAttachmentBuffer(attachment);
        const parseResult = await parsePptx(buffer);
        return {
          type: "text",
          content: `\n[文件: ${attachment.name}]\n${parseResult.text}\n`,
          rawText: parseResult.text,
          asset,
          source: "file",
        };
      } catch (err) {
        logger.warn("解析 PPTX 附件失败，将尝试作为媒体附件处理", {
          assetId: attachment.id,
          error: err,
        });
      }
    }

    // 处理 XLSX 文件
    if (isXlsxAssetLike(attachment)) {
      try {
        const buffer = await getAttachmentBuffer(attachment);
        const parseResult = await parseXlsx(buffer);
        return {
          type: "text",
          content: `\n[文件: ${attachment.name}]\n${parseResult.text}\n`,
          rawText: parseResult.text,
          asset,
          source: "file",
        };
      } catch (err) {
        logger.warn("解析 XLSX 附件失败，将尝试作为媒体附件处理", {
          assetId: attachment.id,
          error: err,
        });
      }
    }

    // 检查是否需要转写 (针对 Image/Audio/Video)
    // 使用 computeWillUseTranscription，它同时考虑模型能力和消息深度
    let shouldTranscribe = transcriptionManager.computeWillUseTranscription(
      transcriptionAsset,
      modelId,
      profileId,
      options.messageDepth
    );

    // 如果外部强制要求，则覆盖判断
    if (options.force) {
      shouldTranscribe = true;
    }

    // 尝试获取转写内容
    const transcriptionText =
      await transcriptionManager.getTranscriptionText(transcriptionAsset);

    // 决策逻辑：
    // 只有在有转写内容且确实需要转写时，才使用转写内容
    // 如果模型支持该媒体（shouldTranscribe = false），则忽略已存在的转写，优先使用原始媒体。
    if (transcriptionText && shouldTranscribe) {
      // logger.debug("应用转写内容 (模型需要或策略强制)", { assetId: asset.id, assetName: asset.name });

      return {
        type: "text",
        content: `\n[转写: ${attachment.name}]\n${transcriptionText}\n`,
        rawText: transcriptionText,
        asset,
        source: "transcription",
      };
    }

    if (shouldTranscribe && !options.silent) {
      logger.warn("需要转写但未找到转写结果 (可能失败或超时)，保留原始附件", {
        assetId: attachment.id,
        assetName: attachment.name,
      });
    }

    // 既不是文本文件，也没有转写内容（或者不需要转写） -> 视为媒体附件
    return {
      type: "media",
      asset,
    };
  } catch (error) {
    logger.error("解析附件内容出错", error, { assetId: attachment.id });
    // 出错时降级为媒体附件，避免阻断流程
    return {
      type: "media",
      asset,
    };
  }
}

/**
 * 批量解析附件内容
 * 自动合并警告消息，避免重复输出
 */
export async function resolveAttachmentsBatch<
  TAttachment extends AttachmentLike,
>(
  assets: TAttachment[],
  modelId: string,
  profileId: string,
  options: { force?: boolean; silent?: boolean; messageDepth?: number } = {}
): Promise<ResolvedAttachment<TAttachment>[]> {
  const results: ResolvedAttachment<TAttachment>[] = [];
  const missingTranscriptions: TAttachment[] = [];

  for (const asset of assets) {
    const attachment = toPipelineAttachment(asset);
    const transcriptionAsset = await getTranscriptionAsset(asset);
    // 调用单个解析函数时开启静默，由批量函数统一处理警告
    const result = await resolveAttachmentContent(asset, modelId, profileId, {
      ...options,
      silent: true,
    });
    results.push(result);

    // 检查是否发生了“需要转写但未找到”的情况
    // 这通过检查 resolveAttachmentContent 的内部逻辑：
    // 如果 shouldTranscribe 为 true 且返回的是 media 类型，说明没找到转写
    if (result.type === "media") {
      const transcriptionManager = (
        await import("../../composables/features/useTranscriptionManager")
      ).useTranscriptionManager();
      const shouldTranscribe =
        options.force ||
        transcriptionManager.computeWillUseTranscription(
          transcriptionAsset,
          modelId,
          profileId,
          options.messageDepth
        );

      // 文本文档读取失败不重复警告；DOCX 这类二进制文档需要转写提示。
      if (
        shouldTranscribe &&
        (attachment.type !== "document" || isDocxAssetLike(attachment))
      ) {
        missingTranscriptions.push(asset);
      }
    }
  }

  // 统一输出警告
  if (missingTranscriptions.length > 0 && !options.silent) {
    logger.warn(
      `有 ${missingTranscriptions.length} 个附件需要转写但未找到结果，将保留原始附件`,
      {
        assets: missingTranscriptions.map((a) => ({
          id: a.id,
          name: a.name,
        })),
      }
    );
  }

  return results;
}
