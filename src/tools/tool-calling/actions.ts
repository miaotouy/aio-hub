/**
 * Tool Calling 核心操作 Actions（Facade 层）
 *
 * 将 ToolCallingRegistry 中的业务逻辑抽离到此层，
 * 使 registry 仅作为元数据路由与能力注册的薄层。
 * 参考 web-distillery/actions.ts 的 Actions 模式。
 */
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { taskManager } from "./core/async-task";
import type { ToolContext } from "@/services/types";

const logger = createModuleLogger("tool-calling/actions");
const errorHandler = createModuleErrorHandler("tool-calling/actions");

function buildSuccess(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data }, null, 2);
}

function buildError(msg: string): string {
  return JSON.stringify({ success: false, error: msg }, null, 2);
}

// ==================== 任务状态管理 ====================

/**
 * 查询任务状态
 */
export async function getTaskStatus(args: { taskId: string }): Promise<string> {
  return (
    (await errorHandler.wrapAsync(
      async () => {
        const { taskId } = args;
        if (!taskId) return buildError("缺少必需参数: taskId");

        const task = await taskManager.getTask(taskId);
        if (!task) return buildError(`任务不存在: ${taskId}`);

        const result: Record<string, any> = {
          taskId: task.taskId,
          status: task.status,
          toolName: task.toolName,
          createdAt: new Date(task.createdAt).toISOString(),
        };

        if (task.startedAt)
          result.startedAt = new Date(task.startedAt).toISOString();
        if (task.completedAt) {
          result.completedAt = new Date(task.completedAt).toISOString();
          result.duration = `${((task.completedAt - (task.startedAt || task.createdAt)) / 1000).toFixed(2)}秒`;
        }
        if (task.progress !== undefined) result.progress = `${task.progress}%`;
        if (task.progressMessage) result.progressMessage = task.progressMessage;
        if (task.status === "completed" && task.result)
          result.result = task.result;
        if (task.status === "failed" && task.error) result.error = task.error;
        if (task.status === "interrupted") {
          result.error = task.error;
          result.message = "任务因应用重启而中断，可以使用 retryTask 重试";
        }

        return JSON.stringify(result, null, 2);
      },
      { userMessage: "查询任务状态失败" }
    )) || buildError("查询失败")
  );
}

/**
 * 取消任务
 */
export async function cancelTask(args: { taskId: string }): Promise<string> {
  return (
    (await errorHandler.wrapAsync(
      async () => {
        const { taskId } = args;
        if (!taskId) return buildError("缺少必需参数: taskId");

        const cancelled = await taskManager.cancelTask(taskId);
        if (!cancelled) {
          const task = await taskManager.getTask(taskId);
          if (!task) return buildError(`任务不存在: ${taskId}`);
          return buildError(`任务无法取消，当前状态: ${task.status}`);
        }

        return buildSuccess({ message: `任务 ${taskId} 已取消` });
      },
      { userMessage: "取消任务失败" }
    )) || buildError("取消失败")
  );
}

/**
 * 重试任务
 */
export async function retryTask(args: { taskId: string }): Promise<string> {
  return (
    (await errorHandler.wrapAsync(
      async () => {
        const { taskId } = args;
        if (!taskId) return buildError("缺少必需参数: taskId");

        const newTaskId = await taskManager.retryTask(taskId);
        return buildSuccess({
          message: "任务已重新提交",
          originalTaskId: taskId,
          newTaskId,
        });
      },
      { userMessage: "重试任务失败" }
    )) || buildError("重试失败")
  );
}

// ==================== 测试方法 ====================

/**
 * 测试异步任务（已有进度上报、取消、重试机制）
 * duration 默认 5 秒，shouldFail 默认 false
 */
export async function testAsyncTask(
  args: { duration?: number; shouldFail?: boolean },
  context?: ToolContext
): Promise<string> {
  const duration = args.duration ?? 5;
  const shouldFail = !!args.shouldFail;

  if (!context?.isAsync) {
    return buildError("此方法必须作为异步任务执行");
  }

  logger.info("开始测试异步任务", {
    duration,
    shouldFail,
    taskId: context.taskId,
  });

  try {
    const startTime = Date.now();
    const totalSteps = duration * 10; // 每秒 10 步

    for (let i = 0; i <= totalSteps; i++) {
      if (context.signal?.aborted) {
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }

      const progress = Math.floor((i / totalSteps) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      context.reportStatus(
        `执行中... 已用时 ${elapsed}秒 (${i}/${totalSteps})`,
        progress
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (shouldFail && i === Math.floor(totalSteps / 2)) {
        throw new Error("模拟的任务失败");
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info("测试异步任务完成", { taskId: context.taskId, totalTime });
    return JSON.stringify(
      {
        success: true,
        message: "测试任务完成",
        duration: `${totalTime}秒`,
        steps: totalSteps,
        taskId: context.taskId,
      },
      null,
      2
    );
  } catch (error: any) {
    if (error.name === "AbortError") {
      logger.info("测试任务被取消", { taskId: context.taskId });
      throw error;
    }
    logger.error("测试任务失败", error, { taskId: context.taskId });
    throw error;
  }
}

/**
 * 测试同步耗时任务（非阻塞延时操作）
 *
 * 与 testAsyncTask 不同，此方法在 Agent 会话层面表现为同步等待，
 * 但内部使用异步延时以避免阻塞 UI 主线程。
 * 用于测试 Agent 同步调用的超时机制。
 * duration 默认 5 秒，shouldFail 默认 false
 */
export async function testSyncTask(
  args: { duration?: number; shouldFail?: boolean },
  context?: ToolContext
): Promise<string> {
  const duration = args.duration ?? 5;
  const shouldFail = !!args.shouldFail;
  const taskId = context?.taskId || "sync";

  logger.info("开始测试同步耗时任务", { duration, shouldFail, taskId });

  try {
    const startTime = Date.now();
    context?.reportStatus(`同步任务开始，预计耗时 ${duration}秒...`);

    const totalSteps = duration * 10; // 每秒 10 步

    for (let i = 0; i <= totalSteps; i++) {
      // 检查取消信号
      if (context?.signal?.aborted) {
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }

      const progress = Math.floor((i / totalSteps) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // 每 5 步上报一次进度，避免过于频繁
      if (i % 5 === 0 || i === totalSteps) {
        context?.reportStatus(
          `同步执行中... 已用时 ${elapsed}秒 (${i}/${totalSteps})`,
          progress
        );
      }

      // 异步延时，释放 Event Loop
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 中段模拟失败
      if (shouldFail && i === Math.floor(totalSteps / 2)) {
        throw new Error("模拟的同步任务失败");
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info("测试同步任务完成", { taskId, totalTime });

    return JSON.stringify(
      {
        success: true,
        message: "同步耗时任务完成",
        duration: `${totalTime}秒`,
        steps: totalSteps,
        taskId,
      },
      null,
      2
    );
  } catch (error: any) {
    if (error.name === "AbortError") {
      logger.info("同步测试任务被取消", { taskId });
      throw error;
    }
    logger.error("同步测试任务失败", error, { taskId });
    throw error;
  }
}
