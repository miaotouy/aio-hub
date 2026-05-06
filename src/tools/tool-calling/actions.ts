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

        if (task.startedAt) result.startedAt = new Date(task.startedAt).toISOString();
        if (task.completedAt) {
          result.completedAt = new Date(task.completedAt).toISOString();
          result.duration = `${((task.completedAt - (task.startedAt || task.createdAt)) / 1000).toFixed(2)}秒`;
        }
        if (task.progress !== undefined) result.progress = `${task.progress}%`;
        if (task.progressMessage) result.progressMessage = task.progressMessage;
        if (task.status === "completed" && task.result) result.result = task.result;
        if (task.status === "failed" && task.error) result.error = task.error;
        if (task.status === "interrupted") {
          result.error = task.error;
          result.message = "任务因应用重启而中断，可以使用 retryTask 重试";
        }

        return JSON.stringify(result, null, 2);
      },
      { userMessage: "查询任务状态失败" },
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
      { userMessage: "取消任务失败" },
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
      { userMessage: "重试任务失败" },
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
  context?: ToolContext,
): Promise<string> {
  const duration = args.duration || 5;
  const shouldFail = args.shouldFail || false;

  if (!context?.isAsync) {
    return buildError("此方法必须作为异步任务执行");
  }

  logger.info("开始测试异步任务", { duration, shouldFail, taskId: context.taskId });

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
      context.reportStatus(`执行中... 已用时 ${elapsed}秒 (${i}/${totalSteps})`, progress);

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
      2,
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
 * 测试同步耗时任务（CPU 密集型操作）
 *
 * 与 testAsyncTask 不同，此方法同步阻塞执行，
 * 用于测试 Agent 同步调用的超时机制和 UI 响应性。
 * duration 默认 5 秒，shouldFail 默认 false
 */
export async function testSyncTask(
  args: { duration?: number; shouldFail?: boolean },
  context?: ToolContext,
): Promise<string> {
  const duration = args.duration || 5;
  const shouldFail = args.shouldFail || false;
  const taskId = context?.taskId || "sync";

  logger.info("开始测试同步耗时任务", { duration, shouldFail, taskId });

  try {
    const startTime = Date.now();
    context?.reportStatus(`同步任务开始，预计耗时 ${duration}秒...`);

    // 通过 CPU 密集计算（质数计数）模拟同步阻塞
    let calcResult = 0;
    const endTime = startTime + duration * 1000;
    let iteration = 0;

    while (Date.now() < endTime) {
      // 检查取消信号
      if (context?.signal?.aborted) {
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }

      // 中段模拟失败
      if (shouldFail && iteration > 500 && iteration < 510) {
        throw new Error("模拟的同步任务失败");
      }

      // CPU 密集: 计算质数
      const n = 100000 + (iteration % 10000);
      calcResult += countPrimes(n);

      iteration++;

      // 每 500 次迭代上报进度
      if (iteration % 500 === 0) {
        const elapsedMs = Date.now() - startTime;
        const elapsedStr = (elapsedMs / 1000).toFixed(1);
        const pct = Math.min(100, Math.floor((elapsedMs / 1000 / duration) * 100));
        context?.reportStatus(`同步执行中... 已用时 ${elapsedStr}秒 (迭代 ${iteration} 次)`, pct);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info("测试同步任务完成", { taskId, totalTime, iterations: iteration });

    return JSON.stringify(
      {
        success: true,
        message: "同步耗时任务完成",
        duration: `${totalTime}秒`,
        iterations: iteration,
        result: calcResult % 1000,
        taskId,
      },
      null,
      2,
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

/**
 * 辅助: 计算 ≤n 的质数个数
 */
function countPrimes(n: number): number {
  if (n < 2) return 0;
  let count = 0;
  for (let i = 2; i <= n; i++) {
    let isPrime = true;
    for (let j = 2; j * j <= i; j++) {
      if (i % j === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) count++;
  }
  return count;
}
