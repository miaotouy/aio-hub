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

import { ref, computed, watch } from "vue";
import type { MediaTask, MediaTaskStatus, MediaTaskType } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { useMediaStorage } from "./useMediaStorage";

export const MEDIA_TASK_AUTO_CLEAN_DELAY_MS = 5 * 60 * 1000;

export interface MediaTaskRuntimeSettings {
  maxConcurrentTasks: number;
  autoCleanCompleted: boolean;
}

const runtimeSettings: MediaTaskRuntimeSettings = {
  maxConcurrentTasks: 3,
  autoCleanCompleted: false,
};

const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
let runtimeSettingsListener: (() => void) | null = null;

export function setMediaTaskRuntimeSettingsListener(listener: () => void) {
  runtimeSettingsListener = listener;
}

export function getMediaTaskRuntimeSettings(): MediaTaskRuntimeSettings {
  return { ...runtimeSettings };
}

const normalizeMaxConcurrentTasks = (value: number | undefined) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return runtimeSettings.maxConcurrentTasks;
  return Math.max(1, Math.min(10, Math.floor(normalized)));
};

const logger = createModuleLogger("media-generator/task-manager");

// 这是一个全局单例，确保任务在不同组件间共享
const globalTasks = ref<MediaTask[]>([]);
const isInitialized = ref(false);

const normalizeTaskType = (task: MediaTask): MediaTaskType => {
  const type = task.type as string;
  if (type !== "audio") return task.type;

  const params = task.input?.params || {};
  const modelText =
    `${task.input?.modelId || ""} ${task.input?.profileId || ""}`.toLowerCase();
  if (
    modelText.includes("suno") ||
    params.suno_mode !== undefined ||
    params.tags ||
    params.make_instrumental !== undefined
  ) {
    return "music";
  }
  return "speech";
};

const normalizeTask = (task: MediaTask): MediaTask => ({
  ...task,
  type: normalizeTaskType(task),
});

const clearCleanupTimer = (taskId: string) => {
  const timer = cleanupTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(taskId);
  }
};

export function useMediaTaskManager() {
  const storage = useMediaStorage();

  /**
   * 初始化任务池
   */
  const init = async () => {
    if (isInitialized.value) return;
    try {
      const tasks = await storage.loadTasks();
      let recoveredCount = 0;
      globalTasks.value = Array.isArray(tasks)
        ? tasks.map((task) => {
            const normalizedTask = normalizeTask(task);
            // 生成请求不能跨进程恢复。将上次退出时仍在运行或排队的任务
            // 明确落为错误，避免重启后任务池永久显示为 pending/processing。
            if (
              normalizedTask.status === "pending" ||
              normalizedTask.status === "processing"
            ) {
              recoveredCount += 1;
              return {
                ...normalizedTask,
                status: "error" as const,
                error:
                  normalizedTask.status === "processing"
                    ? "应用重启，生成中断"
                    : "应用重启，排队任务未恢复",
                statusText:
                  normalizedTask.status === "processing"
                    ? "应用重启，生成中断"
                    : "应用重启，排队任务未恢复",
              };
            }
            return normalizedTask;
          })
        : [];
      isInitialized.value = true;
      if (recoveredCount > 0) {
        await storage.saveTasks(globalTasks.value);
      }
      if (runtimeSettings.autoCleanCompleted) {
        globalTasks.value
          .filter((task) => task.status === "completed")
          .forEach((task) => scheduleCompletedCleanup(task.id));
      }
      logger.info("全局任务池初始化完成", {
        count: globalTasks.value.length,
        recoveredCount,
      });
    } catch (error) {
      logger.error("全局任务池初始化失败", error);
    }
  };

  /**
   * 保存任务池
   */
  const save = async () => {
    if (!isInitialized.value) return;
    try {
      await storage.saveTasks(globalTasks.value);
    } catch (error) {
      logger.error("全局任务池保存失败", error);
    }
  };

  // 监听任务变化自动保存
  watch(
    globalTasks,
    (newTasks) => {
      if (!isInitialized.value) return;
      storage.saveTasksDebounced(newTasks);
    },
    { deep: true }
  );

  /**
   * 应用设置页中的任务运行时配置。
   * 任务池是全局单例，因此配置也必须在各个工作区实例之间共享。
   */
  const configureRuntimeSettings = (
    settings: Partial<MediaTaskRuntimeSettings>
  ) => {
    runtimeSettings.maxConcurrentTasks = normalizeMaxConcurrentTasks(
      settings.maxConcurrentTasks
    );
    if (settings.autoCleanCompleted !== undefined) {
      runtimeSettings.autoCleanCompleted = settings.autoCleanCompleted === true;
    }

    if (runtimeSettings.autoCleanCompleted) {
      globalTasks.value
        .filter((task) => task.status === "completed")
        .forEach((task) => scheduleCompletedCleanup(task.id));
    } else {
      cleanupTimers.forEach((_, taskId) => clearCleanupTimer(taskId));
    }
    runtimeSettingsListener?.();
  };

  const scheduleCompletedCleanup = (taskId: string) => {
    if (!runtimeSettings.autoCleanCompleted || cleanupTimers.has(taskId))
      return;
    cleanupTimers.set(
      taskId,
      setTimeout(() => {
        cleanupTimers.delete(taskId);
        const task = globalTasks.value.find((item) => item.id === taskId);
        if (
          task?.status === "completed" &&
          runtimeSettings.autoCleanCompleted
        ) {
          globalTasks.value = globalTasks.value.filter(
            (item) => item.id !== taskId
          );
          logger.debug("自动清理已完成媒体任务", { taskId });
        }
      }, MEDIA_TASK_AUTO_CLEAN_DELAY_MS)
    );
  };

  /**
   * 汇总任务 (旧版兼容，现在主要用于合并)
   */
  const syncTasks = (tasks: MediaTask[]) => {
    // 合并新任务，避免重复
    const existingIds = new Set(globalTasks.value.map((t) => t.id));
    const newTasks = tasks
      .filter((t) => !existingIds.has(t.id))
      .map(normalizeTask);
    if (newTasks.length > 0) {
      globalTasks.value = [...globalTasks.value, ...newTasks];
    }
  };

  /**
   * 添加任务
   * 注意：现在推荐使用 useTaskActionManager 中的 addTaskNode
   * 它会处理树形结构的关联。这里的全局任务池仅负责存储和状态同步。
   */
  const addTask = (task: MediaTask) => {
    const normalizedTask = normalizeTask(task);
    // 检查是否已经存在
    if (!globalTasks.value.find((t) => t.id === normalizedTask.id)) {
      globalTasks.value.unshift(normalizedTask);
      logger.debug("已添加全局任务到任务池", { taskId: normalizedTask.id });
    }
  };

  /**
   * 更新任务状态
   */
  const updateTaskStatus = (
    taskId: string,
    status: MediaTaskStatus,
    updates?: Partial<MediaTask>
  ) => {
    const task = globalTasks.value.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      if (updates) {
        Object.assign(task, updates);
      }
      if (status === "completed") {
        task.completedAt = Date.now();
        scheduleCompletedCleanup(taskId);
      } else {
        clearCleanupTimer(taskId);
      }
      logger.debug("全局任务状态更新", { taskId, status });
    }
  };

  /**
   * 移除任务
   */
  const removeTask = (taskId: string) => {
    clearCleanupTimer(taskId);
    globalTasks.value = globalTasks.value.filter((t) => t.id !== taskId);
    logger.debug("全局任务已移除", { taskId });
  };

  /**
   * 获取任务
   */
  const getTask = (taskId: string) => {
    return globalTasks.value.find((t) => t.id === taskId);
  };

  // 统计信息
  // 统计信息
  const stats = computed(() => {
    const list = Array.isArray(globalTasks.value) ? globalTasks.value : [];
    const total = list.length;
    const processing = list.filter((t) => t?.status === "processing").length;
    const completed = list.filter((t) => t?.status === "completed").length;
    const error = list.filter((t) => t?.status === "error").length;
    const pending = list.filter((t) => t?.status === "pending").length;
    return { total, processing, completed, error, pending };
  });
  return {
    tasks: globalTasks,
    stats,
    init,
    save,
    addTask,
    updateTaskStatus,
    removeTask,
    getTask,
    syncTasks,
    configureRuntimeSettings,
    getRuntimeSettings: getMediaTaskRuntimeSettings,
  };
}
