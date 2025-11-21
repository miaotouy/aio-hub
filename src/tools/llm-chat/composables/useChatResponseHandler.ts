/**
 * 聊天响应处理 Composable
 * 负责处理来自 LLM 的响应，并更新节点状态
 */

import type { ChatSession } from "../types";
import type { LlmMessageContent } from "@/llm-apis/common";
import { createModuleLogger } from "@/utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { processInlineData } from "@/composables/useAttachmentProcessor";

const logger = createModuleLogger("llm-chat/response-handler");

export function useChatResponseHandler() {
  /**
   * 处理流式响应更新
   */
  const handleStreamUpdate = (
    session: ChatSession,
    nodeId: string,
    chunk: string,
    isReasoning: boolean = false
  ): void => {
    const node = session.nodes[nodeId];
    if (!node) return;

    // 记录首字时间
    if (!node.metadata?.firstTokenTime) {
      node.metadata = {
        ...node.metadata,
        firstTokenTime: Date.now(),
      };
    }

    if (isReasoning) {
      // 推理内容流式更新
      if (!node.metadata) {
        node.metadata = {};
      }
      if (!node.metadata.reasoningContent) {
        node.metadata.reasoningContent = "";
        node.metadata.reasoningStartTime = Date.now();
        logger.info("🕐 推理开始时间已记录", {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
        });
      }
      node.metadata.reasoningContent += chunk;
    } else {
      // 正文内容流式更新
      // 如果这是第一次接收正文内容，且之前有推理内容但还没记录结束时间
      if (
        node.content === "" &&
        node.metadata?.reasoningContent &&
        node.metadata?.reasoningStartTime &&
        !node.metadata?.reasoningEndTime
      ) {
        node.metadata.reasoningEndTime = Date.now();
        logger.info("🕐 推理结束时间已记录（正文开始）", {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
          endTime: node.metadata.reasoningEndTime,
          duration: node.metadata.reasoningEndTime - node.metadata.reasoningStartTime,
        });
      }
      node.content += chunk;
    }
  };

  /**
   * 检查并修复 API 返回的 usage 信息
   * 如果 usage 不可靠（全为 0 但有内容），则使用本地计算
   */
  const validateAndFixUsage = async (
    response: any,
    modelId: string,
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | LlmMessageContent[];
    }>
  ): Promise<void> => {
    // 检查 usage 是否可靠
    const hasContent = response.content && response.content.trim() !== "";
    const usageIsZero =
      !response.usage ||
      response.usage.totalTokens === 0 ||
      (response.usage.promptTokens === 0 && response.usage.completionTokens === 0);

    if (usageIsZero && hasContent) {
      logger.warn("检测到 API 返回的 usage 信息不可靠（全为 0 但有内容），使用本地计算", {
        originalUsage: response.usage,
        contentLength: response.content.length,
        modelId,
      });

      try {
        // 计算 completionTokens（助手回复）
        const completionResult = await tokenCalculatorService.calculateTokens(
          response.content,
          modelId
        );

        // 计算 promptTokens（所有消息）
        let promptText = "";
        for (const msg of messages) {
          if (typeof msg.content === "string") {
            promptText += (promptText ? "\n" : "") + msg.content;
          } else {
            // 对于多模态内容，只计算文本部分
            for (const part of msg.content) {
              if (part.type === "text" && part.text) {
                promptText += (promptText ? "\n" : "") + part.text;
              }
            }
          }
        }

        const promptResult = await tokenCalculatorService.calculateTokens(promptText, modelId);

        // 更新 response 的 usage
        response.usage = {
          promptTokens: promptResult.count,
          completionTokens: completionResult.count,
          totalTokens: promptResult.count + completionResult.count,
        };

        logger.info("✅ 本地 token 计算完成", {
          calculatedUsage: response.usage,
          promptIsEstimated: promptResult.isEstimated,
          completionIsEstimated: completionResult.isEstimated,
          tokenizerName: completionResult.tokenizerName,
        });
      } catch (error) {
        logger.error("本地 token 计算失败，保留原始 usage", error as Error, {
          modelId,
        });
      }
    }
  };

  /**
   * 完成节点生成（更新最终状态和元数据）
   */
  const finalizeNode = async (
    session: ChatSession,
    nodeId: string,
    response: any,
    agentId: string
  ): Promise<void> => {
    const finalNode = session.nodes[nodeId];
    if (!finalNode) return;

    // 处理响应内容中的 Base64 数据，转换为附件
    let processedContent = response.content;
    let newAssets = [];
    
    try {
      const result = await processInlineData(response.content, { sizeThresholdKB: 100 });
      processedContent = result.processedText;
      newAssets = result.newAssets;
      
      if (newAssets.length > 0) {
        logger.info("✨ 模型响应中检测到 Base64 数据并已转换为附件", {
          nodeId,
          assetCount: newAssets.length,
          originalLength: response.content.length,
          processedLength: processedContent.length,
        });
        
        // 将新附件添加到节点
        finalNode.attachments = [...(finalNode.attachments || []), ...newAssets];
      }
    } catch (error) {
      logger.warn("处理模型响应中的 Base64 数据失败，使用原始内容", {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    finalNode.content = processedContent;
    finalNode.status = "complete";

    // 保留流式更新时设置的推理内容和时间戳
    const existingReasoningContent = finalNode.metadata?.reasoningContent;
    const existingReasoningStartTime = finalNode.metadata?.reasoningStartTime;
    const existingReasoningEndTime = finalNode.metadata?.reasoningEndTime;

    logger.info("📊 更新最终元数据前", {
      nodeId,
      hasExistingReasoning: !!existingReasoningContent,
      existingStartTime: existingReasoningStartTime,
      existingEndTime: existingReasoningEndTime,
      responseReasoningContent: response.reasoningContent,
    });

    // 使用 API 返回的 completionTokens 作为助手消息的 contentTokens
    const contentTokens = response.usage?.completionTokens;

    // 计算性能指标
    const requestEndTime = Date.now();
    let tokensPerSecond: number | undefined;

    if (contentTokens && finalNode.metadata?.firstTokenTime) {
      // 计算生成时间（毫秒）
      const generationTime = requestEndTime - finalNode.metadata.firstTokenTime;
      if (generationTime > 0) {
        // 计算 tokens/s
        tokensPerSecond = (contentTokens / generationTime) * 1000;
        // 保留两位小数
        tokensPerSecond = Math.round(tokensPerSecond * 100) / 100;
      }
    }

    finalNode.metadata = {
      ...finalNode.metadata,
      usage: response.usage,
      contentTokens,
      reasoningContent: response.reasoningContent || existingReasoningContent,
      requestEndTime,
      tokensPerSecond,
    };

    if (contentTokens !== undefined) {
      logger.debug("助手消息 token 记录完成", {
        nodeId,
        contentTokens,
        totalUsage: response.usage,
      });
    }

    // 如果有推理内容和开始时间，恢复时间戳
    if (finalNode.metadata.reasoningContent && existingReasoningStartTime) {
      finalNode.metadata.reasoningStartTime = existingReasoningStartTime;
      if (existingReasoningEndTime) {
        finalNode.metadata.reasoningEndTime = existingReasoningEndTime;
      } else {
        finalNode.metadata.reasoningEndTime = Date.now();
      }
      logger.info("🕐 推理时间戳已保存", {
        nodeId,
        startTime: finalNode.metadata.reasoningStartTime,
        endTime: finalNode.metadata.reasoningEndTime,
        duration: finalNode.metadata.reasoningEndTime - finalNode.metadata.reasoningStartTime,
      });
    }

    // 更新会话中的智能体使用统计
    if (!session.agentUsage) {
      session.agentUsage = {};
    }
    const currentCount = session.agentUsage[agentId] || 0;
    session.agentUsage[agentId] = currentCount + 1;
  };

  /**
   * 处理节点生成错误
   */
  const handleNodeError = (
    session: ChatSession,
    nodeId: string,
    error: unknown,
    context: string
  ): void => {
    const errorNode = session.nodes[nodeId];
    if (!errorNode) return;

    if (error instanceof Error && error.name === "AbortError") {
      errorNode.status = "error";
      errorNode.metadata = {
        ...errorNode.metadata,
        error: "已取消",
      };
      logger.info(`${context}已取消`, { nodeId });
    } else {
      errorNode.status = "error";
      errorNode.metadata = {
        ...errorNode.metadata,
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error(`${context}失败`, error as Error, { nodeId });
    }
  };

  return {
    handleStreamUpdate,
    validateAndFixUsage,
    finalizeNode,
    handleNodeError,
  };
}
