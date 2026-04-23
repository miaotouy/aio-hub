import { markRaw } from "vue";
import type { ToolConfig, ToolRegistry, ServiceMetadata, ToolContext } from "@/services/types";
import { Wrench } from "lucide-vue-next";
import { taskManager } from "./core/async-task";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useToolCallingStore } from "@/tools/llm-chat/stores/toolCallingStore";
import { useAsyncTaskStore } from "./stores/asyncTaskStore";
import { executeToolRequests as internalExecuteToolRequests } from "./core/executor";

const logger = createModuleLogger("tool-calling/registry");
const errorHandler = createModuleErrorHandler("tool-calling/registry");

export const toolConfig: ToolConfig = {
  name: "工具调用测试",
  icon: markRaw(Wrench),
  path: "/tool-calling-tester",
  component: () => import("./ToolCallingTester.vue"),
  description: "内部工具调用系统的调试与验证矩阵",
  category: ["开发工具"],
};

export class ToolCallingRegistry implements ToolRegistry {
  readonly id = "tool-calling";
  readonly name = "工具调用";
  readonly description = "工具调用系统与异步任务管理";
  readonly runMode = "main-only";

  async initialize(): Promise<void> {
    // 等待 TaskManager 初始化完成
    await taskManager.waitForInitialization();
    logger.info("工具调用系统已初始化");
  }

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "getTaskStatus",
          displayName: "查询任务状态",
          description: "查询异步任务的执行状态和结果",
          parameters: [
            {
              name: "taskId",
              type: "string",
              description: "任务 ID",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "cancelTask",
          displayName: "取消任务",
          description: "取消正在执行或等待中的异步任务",
          parameters: [
            {
              name: "taskId",
              type: "string",
              description: "任务 ID",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "retryTask",
          displayName: "重试任务",
          description: "重新执行失败或中断的异步任务",
          parameters: [
            {
              name: "taskId",
              type: "string",
              description: "任务 ID",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "testAsyncTask",
          displayName: "测试异步任务",
          description: "用于测试异步任务系统的示例方法，会模拟一个耗时操作。duration 默认 5 秒，shouldFail 默认 false",
          parameters: [
            {
              name: "duration",
              type: "number",
              description: "任务持续时间（秒），默认 5",
              required: false,
            },
            {
              name: "shouldFail",
              type: "boolean",
              description: "是否模拟失败，默认 false",
              required: false,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
          executionMode: "async",
          asyncConfig: {
            hasProgress: true,
            cancellable: true,
            estimatedDuration: 5,
          },
        },
      ],
    };
  }

  async getTaskStatus(args: { taskId: string }): Promise<string> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const { taskId } = args;

          if (!taskId) {
            return JSON.stringify({
              success: false,
              error: "缺少必需参数: taskId",
            });
          }

          const task = await taskManager.getTask(taskId);

          if (!task) {
            return JSON.stringify({
              success: false,
              error: `任务不存在: ${taskId}`,
            });
          }

          const result: Record<string, any> = {
            success: true,
            taskId: task.taskId,
            status: task.status,
            toolName: task.toolName,
            createdAt: new Date(task.createdAt).toISOString(),
          };

          if (task.startedAt) {
            result.startedAt = new Date(task.startedAt).toISOString();
          }

          if (task.completedAt) {
            result.completedAt = new Date(task.completedAt).toISOString();
            result.duration = `${((task.completedAt - (task.startedAt || task.createdAt)) / 1000).toFixed(2)}秒`;
          }

          if (task.progress !== undefined) {
            result.progress = `${task.progress}%`;
          }

          if (task.progressMessage) {
            result.progressMessage = task.progressMessage;
          }

          if (task.status === "completed" && task.result) {
            result.result = task.result;
          }

          if (task.status === "failed" && task.error) {
            result.error = task.error;
          }

          if (task.status === "interrupted" && task.error) {
            result.error = task.error;
            result.message = "任务因应用重启而中断，可以使用 retryTask 重试";
          }

          return JSON.stringify(result, null, 2);
        },
        { userMessage: "查询任务状态失败" }
      )) || JSON.stringify({ success: false, error: "查询失败" })
    );
  }

  async cancelTask(args: { taskId: string }): Promise<string> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const { taskId } = args;

          if (!taskId) {
            return JSON.stringify({
              success: false,
              error: "缺少必需参数: taskId",
            });
          }

          const cancelled = await taskManager.cancelTask(taskId);

          if (!cancelled) {
            const task = await taskManager.getTask(taskId);
            if (!task) {
              return JSON.stringify({
                success: false,
                error: `任务不存在: ${taskId}`,
              });
            }

            return JSON.stringify({
              success: false,
              error: `任务无法取消，当前状态: ${task.status}`,
              message: "只有 pending 或 running 状态的任务可以取消",
            });
          }

          return JSON.stringify({
            success: true,
            message: `任务 ${taskId} 已取消`,
          });
        },
        { userMessage: "取消任务失败" }
      )) || JSON.stringify({ success: false, error: "取消失败" })
    );
  }

  async retryTask(args: { taskId: string }): Promise<string> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const { taskId } = args;

          if (!taskId) {
            return JSON.stringify({
              success: false,
              error: "缺少必需参数: taskId",
            });
          }

          const newTaskId = await taskManager.retryTask(taskId);

          return JSON.stringify({
            success: true,
            message: `任务已重新提交`,
            originalTaskId: taskId,
            newTaskId,
          });
        },
        { userMessage: "重试任务失败" }
      )) || JSON.stringify({ success: false, error: "重试失败" })
    );
  }

  async testAsyncTask(args: { duration?: number; shouldFail?: boolean }, context?: ToolContext): Promise<string> {
    const duration = args.duration || 5;
    const shouldFail = args.shouldFail || false;

    if (!context?.isAsync) {
      return JSON.stringify({
        success: false,
        error: "此方法必须作为异步任务执行",
      });
    }

    logger.info("开始测试异步任务", { duration, shouldFail, taskId: context.taskId });

    try {
      const startTime = Date.now();
      const totalSteps = duration * 10; // 每秒10步

      for (let i = 0; i <= totalSteps; i++) {
        // 检查是否被取消
        if (context.signal?.aborted) {
          const abortError = new Error("任务已取消");
          abortError.name = "AbortError";
          throw abortError;
        }

        // 计算进度
        const progress = Math.floor((i / totalSteps) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // 报告进度
        context.reportStatus(`执行中... 已用时 ${elapsed}秒 (${i}/${totalSteps})`, progress);

        // 模拟工作
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 在中途模拟失败
        if (shouldFail && i === Math.floor(totalSteps / 2)) {
          throw new Error("模拟的任务失败");
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const result = JSON.stringify(
        {
          success: true,
          message: `测试任务完成`,
          duration: `${totalTime}秒`,
          steps: totalSteps,
          taskId: context.taskId,
        },
        null,
        2
      );

      logger.info("测试异步任务完成", { taskId: context.taskId, totalTime });
      return result;
    } catch (error: any) {
      if (error.name === "AbortError") {
        logger.info("测试任务被取消", { taskId: context.taskId });
        throw error; // 重新抛出以便 TaskExecutor 处理
      }

      logger.error("测试任务失败", error, { taskId: context.taskId });
      throw error;
    }
  }

  // ==================== 工具调用审批方法 (供跨窗口转发使用) ====================

  public approveRequest(params: { requestId: string }): void {
    useToolCallingStore().approveRequest(params.requestId);
  }

  public rejectRequest(params: { requestId: string }): void {
    useToolCallingStore().rejectRequest(params.requestId);
  }

  public approveAll(params: { sessionId: string }): void {
    useToolCallingStore().approveAll(params.sessionId);
  }

  public rejectAll(params: { sessionId: string }): void {
    useToolCallingStore().rejectAll(params.sessionId);
  }

  public silentApproveRequest(params: { requestId: string }): void {
    useToolCallingStore().silentApproveRequest(params.requestId);
  }

  public silentCancelRequest(params: { requestId: string }): void {
    useToolCallingStore().silentCancelRequest(params.requestId);
  }

  public silentApproveAll(params: { sessionId: string }): void {
    useToolCallingStore().silentApproveAll(params.sessionId);
  }

  public silentCancelAll(params: { sessionId: string }): void {
    useToolCallingStore().silentCancelAll(params.sessionId);
  }

  // ==================== 任务管理方法 (供跨窗口转发使用) ====================

  public async deleteTasks(params: { taskIds: string[] }): Promise<number> {
    return useAsyncTaskStore().deleteTasks(params.taskIds);
  }

  public async deleteTask(params: { taskId: string }): Promise<boolean> {
    return useAsyncTaskStore().deleteTask(params.taskId);
  }

  public async executeToolRequests(params: { requests: any[]; options?: any }): Promise<any[]> {
    return internalExecuteToolRequests(params.requests, params.options);
  }
}

export default ToolCallingRegistry;
