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

import type {
  ChatSessionDetail,
  ChatMessageNode,
  ChatSessionIndex,
} from "../types";
import { tokenCalculatorService } from "@/tools/token-calculator/token-calculator.registry";
import { createModuleLogger } from "@/utils/logger";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import type { Asset } from "@/types/asset-management";
import { resolveAttachmentsBatch } from "../core/context-utils/attachment-resolver";
import { isDocxAssetLike } from "@/utils/docxParser";
import { isPptxAssetLike, isXlsxAssetLike } from "@/utils/zipDocumentParser";
import { splitZipDocumentIntoImageAssets } from "../core/context-utils/zip-document-image-splitter";
import { useTranscriptionManager } from "../composables/features/useTranscriptionManager";
import {
  fromAsset,
  type PipelineAttachment,
} from "../types/pipeline-attachment";

const logger = createModuleLogger("llm-chat/token-utils");

/**
 * 解析发送前图片缩放的有效最大边（像素）
 *
 * 与 asset-resolver 的串联缩放语义等价：
 * 先模型安全约束（capabilities.maxImageDimension），后用户压缩
 * （imageCompression.maxDimension，默认 4096），串联等比缩小等价于取两者较小值。
 *
 * @returns 有效最大边；无任何缩放约束时返回 undefined
 */
export function resolveEffectiveImageMaxDimension(
  capabilities?: { maxImageDimension?: number } | null,
  imageCompression?: { enabled: boolean; maxDimension?: number } | null
): number | undefined {
  let maxDim: number | undefined;
  const modelMax = capabilities?.maxImageDimension;
  if (modelMax && modelMax > 0) {
    maxDim = modelMax;
  }
  if (imageCompression?.enabled) {
    const userMax = imageCompression.maxDimension || 4096;
    maxDim = maxDim === undefined ? userMax : Math.min(maxDim, userMax);
  }
  return maxDim;
}

/**
 * 解析指定模型与智能体下发送图片的有效最大边
 *
 * 模型安全约束来自模型 capabilities；用户压缩来自智能体参数
 * （详情未加载时自动按需加载一次）。任一来源缺失时只应用另一项。
 */
export async function resolveImageMaxDimensionForModel(
  modelId: string,
  agentId?: string | null
): Promise<number | undefined> {
  try {
    const { profiles } = useLlmProfiles();
    const model = profiles.value
      .flatMap((profile) => profile.models || [])
      .find((item) => item.id === modelId);

    let imageCompression:
      { enabled: boolean; maxDimension?: number } | undefined;
    if (agentId) {
      const agentStore = useAgentStore();
      let agent = agentStore.getAgentById(agentId);
      if (agent && agent.parameters === undefined) {
        agent = (await agentStore.loadAgentDetails(agentId)) ?? agent;
      }
      imageCompression = agent?.parameters?.imageCompression;
    }

    return resolveEffectiveImageMaxDimension(
      model?.capabilities,
      imageCompression
    );
  } catch (error) {
    logger.warn("解析图片压缩上限失败，Token 预估将按原始尺寸计算", {
      modelId,
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * 准备用于 Token 计算的消息内容（本地辅助函数）
 * 模拟 transcription-processor 的行为，读取文本附件和转写内容
 */
export async function prepareMessageForTokenCalc(
  content: string,
  attachments: Asset[],
  modelId: string
): Promise<{
  combinedText: string;
  mediaAttachments: PipelineAttachment[];
}> {
  let combinedText = content;
  const mediaAttachments: PipelineAttachment[] = [];
  const { profiles } = useLlmProfiles();

  // 尝试查找 profileId
  const profile = profiles.value.find((p) =>
    p.models.some((m) => m.id === modelId)
  );
  const profileId = profile?.id || "";

  // 检查模型是否支持视觉（与 transcription-processor 保持一致）
  const model = profile?.models.find((m) => m.id === modelId);
  const hasVision = model?.capabilities?.vision === true;
  // 分离 OpenXML 附件（模型支持视觉时需要特殊处理）
  let assetsForBatch = attachments;
  if (hasVision) {
    const nonZipAssets: Asset[] = [];
    const transcriptionManager = useTranscriptionManager();
    for (const asset of attachments) {
      const isDocx = isDocxAssetLike(asset);
      const isPptx = isPptxAssetLike(asset);
      const isXlsx = isXlsxAssetLike(asset);

      if (isDocx || isPptx || isXlsx) {
        // 已有转写结果且应优先使用时，回退到正常路径（不走虚拟图片附件）
        if (
          transcriptionManager.computeWillUseTranscription(
            asset,
            modelId,
            profileId
          )
        ) {
          nonZipAssets.push(asset);
          continue;
        }
        const splitResult = await splitZipDocumentIntoImageAssets(asset);
        if (splitResult.success) {
          // 对齐 transcription-processor 的文本格式
          combinedText += `\n[文件: ${asset.name}]\n${splitResult.text}\n`;
          mediaAttachments.push(...splitResult.imageAssets);
        } else if (splitResult.text) {
          // 无内嵌图片，只有文本
          combinedText += `\n[文件: ${asset.name}]\n${splitResult.text}\n`;
        } else {
          // 拆分失败，回退到普通附件解析
          nonZipAssets.push(asset);
        }
      } else {
        nonZipAssets.push(asset);
      }
    }
    assetsForBatch = nonZipAssets;
  }

  const resolvedResults = await resolveAttachmentsBatch(
    assetsForBatch,
    modelId,
    profileId,
    {
      silent: true,
    }
  );

  for (const result of resolvedResults) {
    if (result.type === "text" && result.content) {
      combinedText += result.content;
    } else {
      mediaAttachments.push(fromAsset(result.asset));
    }
  }

  return { combinedText, mediaAttachments };
}

/**
 * 重新计算单个节点的 token
 */
export async function recalculateNodeTokens(
  index: ChatSessionIndex,
  detail: ChatSessionDetail,
  nodeId: string
): Promise<void> {
  if (!detail.nodes) return;
  const node = detail.nodes[nodeId];
  if (!node || !node.content) return;
  if (node.role !== "user" && node.role !== "assistant") return;

  let modelId: string | undefined;
  if (node.role === "assistant" && node.metadata?.modelId) {
    modelId = node.metadata.modelId;
  } else if (node.role === "user") {
    let currentId: string | null = detail.activeLeafId || null;
    while (currentId !== null) {
      const pathNode: ChatMessageNode | undefined = detail.nodes[currentId];
      if (pathNode?.role === "assistant" && pathNode.metadata?.modelId) {
        modelId = pathNode.metadata.modelId;
        break;
      }
      currentId = pathNode?.parentId ?? null;
    }
    if (!modelId) {
      for (const n of Object.values(detail.nodes)) {
        if (n.role === "assistant" && n.metadata?.modelId) {
          modelId = n.metadata.modelId;
          break;
        }
      }
    }
  }

  if (!modelId) {
    logger.warn("无法确定模型ID，跳过token重新计算", {
      sessionId: detail.id,
      nodeId,
      role: node.role,
    });
    return;
  }

  try {
    let fullContent = node.content;
    let mediaAttachments: Array<Asset | PipelineAttachment> | undefined =
      node.attachments;

    if (
      node.role === "user" &&
      node.attachments &&
      node.attachments.length > 0
    ) {
      // 准备用于 Token 计算的消息内容
      const result = await prepareMessageForTokenCalc(
        node.content,
        node.attachments,
        modelId
      );

      fullContent = result.combinedText;
      mediaAttachments = result.mediaAttachments;
    }

    // 对齐发送管线的图片缩放（模型安全约束 + 用户压缩），避免图片 Token 高估
    const maxImageDimension = await resolveImageMaxDimensionForModel(
      modelId,
      index?.displayAgentId
    );

    const tokenResult = await tokenCalculatorService.calculateMessageTokens(
      fullContent,
      modelId,
      mediaAttachments,
      maxImageDimension !== undefined ? { maxImageDimension } : undefined
    );

    if (!node.metadata) node.metadata = {};
    node.metadata.contentTokens = tokenResult.count;

    logger.debug("重新计算消息 token", {
      sessionId: detail.id,
      nodeId,
      role: node.role,
      tokens: tokenResult.count,
      isEstimated: tokenResult.isEstimated,
    });
  } catch (error) {
    logger.warn("重新计算 token 失败", {
      sessionId: detail.id,
      nodeId,
      role: node.role,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 补充会话中缺失的 token 元数据
 * @returns 返回是否有会话被更新
 */
export async function fillMissingTokenMetadata(
  sessions: { index: any; detail: ChatSessionDetail }[]
): Promise<{ index: any; detail: ChatSessionDetail }[]> {
  let updatedCount = 0;
  const sessionsToSave: { index: any; detail: ChatSessionDetail }[] = [];
  const calculationPromises: Promise<void>[] = [];
  const updatedSessionIds = new Set<string>();

  for (const { index: sessionIndex, detail: session } of sessions) {
    if (!session.nodes) continue;
    for (const [nodeId, node] of Object.entries(session.nodes)) {
      if (!node.content || node.metadata?.contentTokens !== undefined) continue;

      let modelId: string | undefined;
      if (node.role === "assistant" && node.metadata?.modelId) {
        modelId = node.metadata.modelId;
      } else if (node.role === "user") {
        let currentId: string | null = session.activeLeafId || null;
        while (currentId !== null) {
          const pathNode: ChatMessageNode | undefined =
            session.nodes[currentId];
          if (pathNode?.role === "assistant" && pathNode.metadata?.modelId) {
            modelId = pathNode.metadata.modelId;
            break;
          }
          currentId = pathNode?.parentId ?? null;
        }
        if (!modelId) {
          for (const n of Object.values(session.nodes)) {
            if (n.role === "assistant" && n.metadata?.modelId) {
              modelId = n.metadata.modelId;
              break;
            }
          }
        }
      }

      if (!modelId) continue;

      const currentModelId = modelId;
      calculationPromises.push(
        (async () => {
          try {
            let fullContent = node.content;
            let mediaAttachments:
              Array<Asset | PipelineAttachment> | undefined = node.attachments;

            if (
              node.role === "user" &&
              node.attachments &&
              node.attachments.length > 0
            ) {
              const result = await prepareMessageForTokenCalc(
                node.content,
                node.attachments,
                currentModelId
              );
              fullContent = result.combinedText;
              mediaAttachments = result.mediaAttachments;
            }

            // 对齐发送管线的图片缩放（模型安全约束 + 用户压缩）
            const maxImageDimension = await resolveImageMaxDimensionForModel(
              currentModelId,
              sessionIndex?.displayAgentId
            );

            const tokenResult =
              await tokenCalculatorService.calculateMessageTokens(
                fullContent,
                currentModelId,
                mediaAttachments,
                maxImageDimension !== undefined
                  ? { maxImageDimension }
                  : undefined
              );

            if (!node.metadata) node.metadata = {};
            node.metadata.contentTokens = tokenResult.count;
            updatedCount++;
            updatedSessionIds.add(session.id);
          } catch (error) {
            logger.warn("计算 token 失败", {
              sessionId: session.id,
              nodeId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })()
      );
    }
  }

  if (calculationPromises.length > 0) {
    // 分批处理，避免瞬间产生过大并发压力（虽然是 Worker，但 postMessage 也有开销）
    const CHUNK_SIZE = 10;
    for (let i = 0; i < calculationPromises.length; i += CHUNK_SIZE) {
      const chunk = calculationPromises.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk);
    }

    for (const session of sessions) {
      if (updatedSessionIds.has(session.detail.id)) {
        sessionsToSave.push(session);
      }
    }

    logger.info("补充 token 元数据完成", {
      totalUpdated: updatedCount,
      sessionsUpdated: sessionsToSave.length,
    });
  }

  return sessionsToSave;
}
