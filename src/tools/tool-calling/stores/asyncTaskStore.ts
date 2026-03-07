/**
 * 异步任务状态管理 (Pinia Store)
 *
 * 提供响应式的任务状态管理，与 TaskManager 集成
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { taskManager } from "../core/async-task/task-manager";
import type { AsyncTaskMetadata, TaskStatus } from "../core/async-task/types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("tool-calling/async-task-store");

export const useAsyncTaskStore = defineStore("asyncTask", () => {
  // 状态
  const tasks = ref<Map<string, AsyncTaskMetadata>>(new Map());
  const isInitialized = ref(false);

  // 计算属性
  const taskList = computed(() => {
    return Array.from(tasks.value.values()).sort((a, b) => b.createdAt - a.createdAt);
  });

  const pendingTasks = computed(() => taskList.value.filter((t) => t.status === "pending"));
  const runningTasks = computed(() => taskList.value.filter((t) => t.status === "running"));
  const completedTasks = computed(() => taskList.value.filter((t) => t.status === "completed"));
  const failedTasks = computed(() => taskList.value.filter((t) => t.status === "failed"));
  const cancelledTasks = computed(() => taskList.value.filter((t) => t.status === "cancelled"));
  const interruptedTasks = computed(() => taskList.value.filter((t) => t.status === "interrupted"));
  const activeTasks = computed(() => taskList.value.filter((t) => t.status === "pending" || t.status === "running"));
  const activeTaskCount = computed(() => activeTasks.value.length);

  // 方法

  /**
   * 初始化 Store
   * 建立与 TaskManager 的实时同步订阅
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return;

    try {
      // 1. 等待管理器就绪
      await taskManager.waitForInitialization();

      // 2. 标记中断任务（启动检查）
      await taskManager.markRunningTasksAsInterrupted();

      // 3. 初始加载
      const allTasks = await taskManager.getAllTasks();
      tasks.value.clear();
      allTasks.forEach((task) => tasks.value.set(task.taskId, task));

      // 4. 订阅实时更新
      taskManager.onTaskUpdated((task) => {
        tasks.value.set(task.taskId, task);
      });

      taskManager.onTaskDeleted((taskId) => {
        tasks.value.delete(taskId);
      });

      isInitialized.value = true;
      logger.info("异步任务 Store 初始化完成（实时同步已激活）", { taskCount: tasks.value.size });
    } catch (error) {
      logger.error("异步任务 Store 初始化失败", error);
      throw error;
    }
  }

  /**
   * 获取单个任务
   */
  function getTask(taskId: string): AsyncTaskMetadata | undefined {
    return tasks.value.get(taskId);
  }

  /**
   * 提交新任务
   */
  async function submitTask(toolName: string, args: Record<string, unknown>, requestId: string): Promise<string> {
    return await taskManager.submitTask(toolName, args, requestId);
  }

  /**
   * 取消任务
   */
  async function cancelTask(taskId: string): Promise<boolean> {
    return await taskManager.cancelTask(taskId);
  }

  /**
   * 重试任务
   */
  async function retryTask(taskId: string): Promise<string> {
    return await taskManager.retryTask(taskId);
  }

  /**
   * 删除任务
   */
  async function deleteTask(taskId: string): Promise<boolean> {
    return await taskManager.deleteTask(taskId);
  }

  /**
   * 批量删除任务
   */
  async function deleteTasks(taskIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (const taskId of taskIds) {
      const success = await deleteTask(taskId);
      if (success) deletedCount++;
    }
    return deletedCount;
  }

  /**
   * 清理过期任务
   */
  async function cleanupExpiredTasks(maxAgeMs?: number): Promise<number> {
    return await taskManager.cleanupExpiredTasks(maxAgeMs);
  }

  /**
   * 按状态筛选任务
   */
  function getTasksByStatus(status: TaskStatus): AsyncTaskMetadata[] {
    return taskList.value.filter((t) => t.status === status);
  }

  return {
    // 状态
    tasks,
    isInitialized,

    // 计算属性
    taskList,
    pendingTasks,
    runningTasks,
    completedTasks,
    failedTasks,
    cancelledTasks,
    interruptedTasks,
    activeTasks,
    activeTaskCount,

    // 方法
    initialize,
    getTask,
    submitTask,
    cancelTask,
    retryTask,
    deleteTask,
    deleteTasks,
    cleanupExpiredTasks,
    getTasksByStatus,
  };
});
