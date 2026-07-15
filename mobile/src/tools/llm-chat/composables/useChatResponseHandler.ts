/**
 * 聊天响应处理 Composable (移动端轻量版)
 * 负责处理来自 LLM 的响应，并更新节点状态
 */

import type { ChatSession } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { countTokens } from "@/utils/tokenCounting";
import { applyApiPromptUsage } from "../utils/contextTokenUsage";
import type { TokenCountSource } from "../types/message";

const logger = createModuleLogger("llm-chat/response-handler");
const errorHandler = createModuleErrorHandler("llm-chat/response-handler");

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
    if (!chunk) return;
    const node = session.nodes[nodeId];
    if (!node) return;

    // 记录首字时间：reasoning/thinking 是用户可见输出，也应参与 TTFT 与速度统计。
    if (!node.metadata) {
      node.metadata = {};
    }
    if (!node.metadata.firstTokenTime) {
      node.metadata.firstTokenTime = Date.now();
    }

    if (isReasoning) {
      // 推理内容流式更新
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
      if (
        node.content === "" &&
        node.metadata.reasoningContent &&
        node.metadata.reasoningStartTime &&
        !node.metadata.reasoningEndTime
      ) {
        node.metadata.reasoningEndTime = Date.now();
        logger.info("🕐 推理结束时间已记录（正文开始）", {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
          endTime: node.metadata.reasoningEndTime,
          duration:
            node.metadata.reasoningEndTime - node.metadata.reasoningStartTime,
        });
      }
      node.content += chunk;
    }

    session.updatedAt = new Date().toISOString();
  };

  /**
   * 完成节点生成（更新最终状态和元数据）
   */
  const finalizeNode = async (
    session: ChatSession,
    nodeId: string,
    response: any
  ): Promise<void> => {
    const finalNode = session.nodes[nodeId];
    if (!finalNode) return;

    finalNode.status = "complete";
    finalNode.content = response.content || finalNode.content;

    if (!finalNode.metadata) {
      finalNode.metadata = {};
    }

    // 恢复或设置推理内容
    if (response.reasoningContent) {
      finalNode.metadata.reasoningContent = response.reasoningContent;
    }

    // 如果有推理内容和开始时间，恢复时间戳
    if (finalNode.metadata.reasoningContent && finalNode.metadata.reasoningStartTime) {
      if (!finalNode.metadata.reasoningEndTime) {
        finalNode.metadata.reasoningEndTime = Date.now();
      }
      logger.info("🕐 推理时间戳已保存", {
        nodeId,
        startTime: finalNode.metadata.reasoningStartTime,
        endTime: finalNode.metadata.reasoningEndTime,
        duration:
          finalNode.metadata.reasoningEndTime -
          finalNode.metadata.reasoningStartTime,
      });
    }

    // 计算性能指标
    const requestEndTime = Date.now();
    const apiCompletionTokens = response.usage?.completionTokens;
    let contentTokens: number;
    let contentTokenSource: TokenCountSource;
    let contentTokenizer: string | undefined;

    if (typeof apiCompletionTokens === "number" && Number.isFinite(apiCompletionTokens)) {
      contentTokens = apiCompletionTokens;
      contentTokenSource = "api";
    } else {
      const localResult = await countTokens(finalNode.content);
      contentTokens = localResult.count;
      contentTokenSource = localResult.fallback ? "fallback" : "local";
      contentTokenizer = localResult.tokenizer;
    }

    const apiPromptTokens = response.usage?.promptTokens;
    if (
      finalNode.metadata.contextUsage &&
      typeof apiPromptTokens === "number" &&
      Number.isFinite(apiPromptTokens)
    ) {
      finalNode.metadata.contextUsage = applyApiPromptUsage(
        finalNode.metadata.contextUsage,
        apiPromptTokens
      );
    }

    let tokensPerSecond: number | undefined;

    if (contentTokens > 0 && finalNode.metadata.firstTokenTime) {
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
      usage: response.usage || finalNode.metadata.usage,
      contentTokens,
      contentTokenSource,
      contentTokenizer,
      requestEndTime,
      tokensPerSecond,
    };

    session.updatedAt = new Date().toISOString();
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

    errorNode.status = "error";
    if (!errorNode.metadata) {
      errorNode.metadata = {};
    }

    errorNode.metadata.error = error instanceof Error ? error.message : String(error);
    
    errorHandler.handle((error as Error) || new Error(String(error)), {
      level: ErrorLevel.ERROR,
      userMessage: `${context}失败`,
      showToUser: false,
      context: { nodeId, originalError: error },
    });

    session.updatedAt = new Date().toISOString();
  };

  return {
    handleStreamUpdate,
    finalizeNode,
    handleNodeError,
  };
}
