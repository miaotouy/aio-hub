/**
 * 异步任务管理器
 *
 * 负责任务的提交、执行、取消、重试和生命周期管理
 */

import { createModuleLogger } from "@/utils/logger";
import type { AsyncTaskMetadata, AsyncTaskContext } from "./types";
import { TaskStore } from "./task-store";
import { TaskExecutor } from "./task-executor";

const logger = createModuleLogger("tool-calling/task-manager");

export type TaskUpdateListener = (task: AsyncTaskMetadata) => void;
export type TaskDeleteListener = (taskId: string) => void;

export class TaskManager {
  private store: TaskStore;
  private executor: TaskExecutor;
  private tasks = new Map<string, AsyncTaskMetadata>();
  private abortControllers = new Map<string, AbortController>();
  private initPromise: Promise<void> | null = null;

  // 事件监听
  private updateListeners = new Set<TaskUpdateListener>();
  private deleteListeners = new Set<TaskDeleteListener>();

  constructor() {
    this.store = new TaskStore();
    this.executor = new TaskExecutor();
  }

  /**
   * 初始化管理器
   */
  private async initialize(): Promise<void> {
    const tasksMap = await this.store.load();
    this.tasks = new Map(Object.entries(tasksMap));
    logger.debug("TaskManager 初始化完成", { taskCount: this.tasks.size });
  }

  /**
   * 等待 TaskManager 初始化完成
   */
  async waitForInitialization(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  /**
   * 订阅任务更新
   */
  onTaskUpdated(listener: TaskUpdateListener): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  /**
   * 订阅任务删除
   */
  onTaskDeleted(listener: TaskDeleteListener): () => void {
    this.deleteListeners.add(listener);
    return () => this.deleteListeners.delete(listener);
  }

  /**
   * 提交异步任务
   */
  async submitTask(
    toolId: string,
    methodName: string,
    args: Record<string, unknown>,
    requestId: string
  ): Promise<string> {
    await this.waitForInitialization();

    const taskId = this.generateTaskId();
    const displayToolName = `${toolId}.${methodName}`;

    const metadata: AsyncTaskMetadata = {
      taskId,
      requestId,
      toolId,
      methodName,
      toolName: displayToolName,
      args,
      createdAt: Date.now(),
      status: "pending",
      cancellable: true,
    };

    // 更新内存
    this.tasks.set(taskId, metadata);

    // 立即保存新任务并通知
    await this.persistImmediately();
    this.notifyUpdate(metadata);

    logger.info("任务已提交", { taskId, toolName: displayToolName });

    // 异步执行（不等待）
    this.executeTask(taskId).catch((error) => {
      logger.error("任务执行失败", error, { taskId });
    });

    return taskId;
  }

  /**
   * 执行任务
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn("任务不存在", { taskId });
      return;
    }

    // 更新状态为 running
    await this.updateTask(taskId, {
      status: "running",
      startedAt: Date.now(),
    });

    // 创建取消控制器
    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    try {
      // 创建执行上下文
      const context: AsyncTaskContext = {
        taskId,
        signal: abortController.signal,
        reportProgress: (progress, message) => {
          this.updateProgress(taskId, progress, message);
        },
        checkCancellation: () => {
          if (abortController.signal.aborted) {
            const error = new Error("任务已取消");
            error.name = "AbortError";
            throw error;
          }
        },
        log: (message, data) => {
          logger.info(`[Task ${taskId}] ${message}`, data || {});
        },
        metadata: {
          toolName: task.toolName,
          toolId: task.toolId,
          methodName: task.methodName,
        },
      };

      // 执行任务
      const result = await this.executor.execute(task.toolId, task.methodName, task.args, context);

      // 更新状态为 completed
      await this.updateTask(taskId, {
        status: "completed",
        completedAt: Date.now(),
        result,
        progress: 100,
      });

      logger.info("任务执行成功", { taskId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 检查是否为取消操作
      if (error instanceof Error && error.name === "AbortError") {
        await this.updateTask(taskId, {
          status: "cancelled",
          completedAt: Date.now(),
        });
        logger.info("任务已取消", { taskId });
      } else {
        await this.updateTask(taskId, {
          status: "failed",
          completedAt: Date.now(),
          error: errorMessage,
        });
        logger.error("任务执行失败", error, { taskId });
      }
    } finally {
      this.abortControllers.delete(taskId);
    }
  }

  /**
   * 获取任务状态
   */
  async getTask(taskId: string): Promise<AsyncTaskMetadata | null> {
    await this.waitForInitialization();
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<AsyncTaskMetadata[]> {
    await this.waitForInitialization();
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 更新任务（内部使用）
   */
  private async updateTask(taskId: string, updates: Partial<AsyncTaskMetadata>, immediate = false): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const updatedTask = { ...task, ...updates };
    this.tasks.set(taskId, updatedTask);

    // 持久化
    if (immediate) {
      await this.persistImmediately();
    } else {
      this.persistDebounced();
    }

    // 通知监听者
    this.notifyUpdate(updatedTask);
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    await this.waitForInitialization();
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return false;
    }

    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }

    if (task.status === "pending") {
      await this.updateTask(
        taskId,
        {
          status: "cancelled",
          completedAt: Date.now(),
        },
        true
      );
    }

    logger.info("任务取消请求已发送", { taskId });
    return true;
  }

  /**
   * 重试失败的任务
   */
  async retryTask(taskId: string): Promise<string> {
    await this.waitForInitialization();
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`任务不存在: ${taskId}`);

    if (task.status !== "failed" && task.status !== "interrupted") {
      throw new Error(`只能重试失败或中断的任务，当前状态: ${task.status}`);
    }

    const newTaskId = await this.submitTask(task.toolId, task.methodName, task.args, task.requestId);
    await this.updateTask(newTaskId, { retriedFrom: taskId }, true);

    logger.info("任务重试已提交", { originalTaskId: taskId, newTaskId });
    return newTaskId;
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<boolean> {
    await this.waitForInitialization();
    if (!this.tasks.has(taskId)) return false;

    this.tasks.delete(taskId);
    await this.persistImmediately();
    this.notifyDelete(taskId);

    logger.info("任务已删除", { taskId });
    return true;
  }

  /**
   * 更新任务进度
   */
  private async updateProgress(taskId: string, progress: number, message?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const progressPercent = Math.min(100, Math.max(0, progress));
    const progressLog = {
      timestamp: Date.now(),
      message: message || "",
      percent: progressPercent,
    };

    const progressLogs = [...(task.progressLogs || []), progressLog];

    await this.updateTask(taskId, {
      progress: progressPercent,
      progressMessage: message,
      progressLogs,
    });
  }

  /**
   * 清理过期任务
   */
  async cleanupExpiredTasks(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    await this.waitForInitialization();
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const age = now - task.createdAt;
      const isFinished = ["completed", "failed", "cancelled", "interrupted"].includes(task.status);

      if (isFinished && age > maxAgeMs) {
        this.tasks.delete(taskId);
        this.notifyDelete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.persistImmediately();
      logger.info("已清理过期任务", { count: cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * 标记运行中的任务为中断状态
   */
  async markRunningTasksAsInterrupted(): Promise<number> {
    await this.waitForInitialization();
    let markedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === "running" || task.status === "pending") {
        const updatedTask: AsyncTaskMetadata = {
          ...task,
          status: "interrupted",
          error: "应用重启导致任务中断",
          completedAt: Date.now(),
        };
        this.tasks.set(taskId, updatedTask);
        this.notifyUpdate(updatedTask);
        markedCount++;
      }
    }

    if (markedCount > 0) {
      await this.persistImmediately();
      logger.info("已标记中断任务", { count: markedCount });
    }

    return markedCount;
  }

  // 内部辅助方法
  private notifyUpdate(task: AsyncTaskMetadata) {
    this.updateListeners.forEach((l) => l(task));
  }

  private notifyDelete(taskId: string) {
    this.deleteListeners.forEach((l) => l(taskId));
  }

  private async persistImmediately() {
    const tasksObj = Object.fromEntries(this.tasks);
    await this.store.saveImmediately(tasksObj);
  }

  private persistDebounced() {
    const tasksObj = Object.fromEntries(this.tasks);
    this.store.saveDebounced(tasksObj);
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

// 单例实例
export const taskManager = new TaskManager();
