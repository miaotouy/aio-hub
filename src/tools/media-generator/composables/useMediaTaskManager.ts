import { ref, computed, watch } from "vue";
import type { MediaTask, MediaTaskStatus } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { useMediaStorage } from "./useMediaStorage";

const logger = createModuleLogger("media-generator/task-manager");

// 这是一个全局单例，确保任务在不同组件间共享
const globalTasks = ref<MediaTask[]>([]);
const isInitialized = ref(false);

export function useMediaTaskManager() {
  const storage = useMediaStorage();

  /**
   * 初始化任务池
   */
  const init = async () => {
    if (isInitialized.value) return;
    try {
      const tasks = await storage.loadTasks();
      globalTasks.value = Array.isArray(tasks) ? tasks : [];
      isInitialized.value = true;
      logger.info("全局任务池初始化完成", { count: globalTasks.value.length });
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
   * 汇总任务 (旧版兼容，现在主要用于合并)
   */
  const syncTasks = (tasks: MediaTask[]) => {
    // 合并新任务，避免重复
    const existingIds = new Set(globalTasks.value.map((t) => t.id));
    const newTasks = tasks.filter((t) => !existingIds.has(t.id));
    if (newTasks.length > 0) {
      globalTasks.value = [...globalTasks.value, ...newTasks];
    }
  };

  /**
   * 添加任务
   * 姐姐，注意：现在推荐使用 useTaskActionManager 中的 addTaskNode
   * 它会处理树形结构的关联。这里的全局任务池仅负责存储和状态同步。
   */
  const addTask = (task: MediaTask) => {
    // 检查是否已经存在
    if (!globalTasks.value.find((t) => t.id === task.id)) {
      globalTasks.value.unshift(task);
      logger.debug("已添加全局任务到任务池", { taskId: task.id });
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
      }
      logger.debug("全局任务状态更新", { taskId, status });
    }
  };

  /**
   * 移除任务
   */
  const removeTask = (taskId: string) => {
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
  };
}
