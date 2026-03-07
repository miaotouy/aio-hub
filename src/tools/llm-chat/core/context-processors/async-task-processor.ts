/**
 * 异步任务上下文处理器
 *
 * 在构建发送给 LLM 的上下文时，自动检测工具调用节点中的异步任务，
 * 从 asyncTaskStore 获取最新状态，并根据状态动态替换或增强节点内容。
 *
 * 这是 Tool Calling 异步任务系统的关键组件，实现了"动态上下文注入"机制。
 */

import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { useAsyncTaskStore } from "@/tools/tool-calling/stores/asyncTaskStore";
import { extractTaskId } from "@/tools/tool-calling/core/utils/task-id-extractor";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/async-task-processor");

/**
 * 根据任务状态生成替换内容
 */
function generateReplacementContent(
  taskId: string,
  status: string,
  result?: string,
  error?: string,
  progress?: number,
  progressMessage?: string
): string {
  switch (status) {
    case "completed":
      // 任务完成：返回实际结果
      if (result) {
        return `任务已完成。结果：\n${result}`;
      }
      return "任务已完成。";

    case "running":
      // 任务运行中：附加进度信息
      const progressInfo: any = {
        type: "async_task",
        taskId,
        status: "running",
        message: "任务执行中",
      };

      if (progress !== undefined) {
        progressInfo.progress = progress;
        progressInfo.message = `任务执行中，当前进度 ${progress}%`;
      }

      if (progressMessage) {
        progressInfo.progressMessage = progressMessage;
      }

      return JSON.stringify(progressInfo, null, 2);

    case "failed":
      // 任务失败：附加错误信息
      return JSON.stringify(
        {
          type: "async_task",
          taskId,
          status: "failed",
          error: error || "任务执行失败",
          message: "任务执行失败，请查看错误信息",
        },
        null,
        2
      );

    case "cancelled":
      return JSON.stringify(
        {
          type: "async_task",
          taskId,
          status: "cancelled",
          message: "任务已被取消",
        },
        null,
        2
      );

    case "interrupted":
      return JSON.stringify(
        {
          type: "async_task",
          taskId,
          status: "interrupted",
          message: "任务因应用重启而中断",
        },
        null,
        2
      );

    case "pending":
      return JSON.stringify(
        {
          type: "async_task",
          taskId,
          status: "pending",
          message: "任务等待执行中",
        },
        null,
        2
      );

    default:
      // 未知状态，保持原样
      return JSON.stringify(
        {
          type: "async_task",
          taskId,
          status,
          message: "任务状态未知",
        },
        null,
        2
      );
  }
}

/**
 * 异步任务上下文处理器
 */
export const asyncTaskProcessor: ContextProcessor = {
  id: "async-task-processor",
  name: "异步任务处理器",
  description: "检测工具调用节点中的异步任务，并注入最新状态到上下文中",
  priority: 90, // 在 messageFormatter (500) 之前执行
  isCore: true,
  defaultEnabled: true,

  execute: async (context: PipelineContext) => {
    const asyncTaskStore = useAsyncTaskStore();

    // 如果 Store 未初始化，跳过处理
    if (!asyncTaskStore.isInitialized) {
      logger.debug("异步任务 Store 未初始化，跳过处理");
      return;
    }

    let processedCount = 0;
    let replacedCount = 0;

    // 遍历所有消息，查找包含 taskId 的工具调用节点
    for (const msg of context.messages) {
      // 只处理 tool 角色的消息
      if (msg.role !== "tool") {
        continue;
      }

      // 提取内容字符串
      let contentStr: string;
      if (typeof msg.content === "string") {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        // 如果是多模态内容，只处理文本部分
        const textParts = msg.content.filter((part) => part.type === "text");
        if (textParts.length === 0) continue;
        contentStr = textParts.map((part) => (part as any).text).join("\n");
      } else {
        continue;
      }

      // 尝试提取 taskId
      const taskId = extractTaskId(contentStr);
      if (!taskId) {
        continue;
      }

      processedCount++;

      // 从 Store 获取最新任务状态
      const task = asyncTaskStore.getTask(taskId);
      if (!task) {
        logger.debug("未找到任务", { taskId });
        continue;
      }

      logger.debug("检测到异步任务", {
        taskId,
        status: task.status,
        progress: task.progress,
        hasResult: !!task.result,
      });

      // 根据任务状态生成替换内容
      const replacementContent = generateReplacementContent(
        taskId,
        task.status,
        task.result,
        task.error,
        task.progress,
        task.progressMessage
      );

      // 替换消息内容
      msg.content = replacementContent;
      replacedCount++;

      // 如果任务完成且有关联资产，注入到 attachments
      if (task.status === "completed" && task.resultAssetIds && task.resultAssetIds.length > 0) {
        logger.debug("任务包含关联资产", {
          taskId,
          assetCount: task.resultAssetIds.length,
        });

        // 注意：这里只记录资产 ID，实际的资产解析由 asset-resolver 处理
        // 我们需要将资产 ID 转换为 Asset 对象
        // 但由于我们在 context processor 中，无法直接访问 assetManager
        // 所以我们将资产 ID 存储在 sharedData 中，供后续处理器使用
        const existingAssetIds = context.sharedData.get("asyncTaskAssetIds") || [];
        context.sharedData.set("asyncTaskAssetIds", [...existingAssetIds, ...task.resultAssetIds]);
      }

      logger.info("已更新异步任务节点内容", {
        taskId,
        status: task.status,
        contentLength: replacementContent.length,
      });
    }

    if (processedCount > 0) {
      const message = `检测到 ${processedCount} 个异步任务节点，已更新 ${replacedCount} 个`;
      logger.info(message);
      context.logs.push({
        processorId: "async-task-processor",
        level: "info",
        message,
        details: { processedCount, replacedCount },
      });
    }
  },
};
