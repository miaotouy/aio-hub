import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { TranscriptionTask, TranscriptionConfig } from "../types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "../config";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { sanitizeErrorMessage } from "../utils/text";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import { transcriptionConfigManager, transcriptionTasksManager } from "../utils/persistence";

const logger = createModuleLogger("transcriptionStore");

export const useTranscriptionStore = defineStore("transcription", () => {
  // 状态
  const tasks = ref<TranscriptionTask[]>([]);
  const processingCount = ref(0);
  const lastTaskStartTime = ref(0);
  const isInitialized = ref(false);

  /** 外部请求工作台加载的资产 ID，消费后自动清空 */
  const pendingWorkbenchAssetId = ref<string | null>(null);

  // 配置
  const config = ref<TranscriptionConfig>({ ...DEFAULT_TRANSCRIPTION_CONFIG });

  // 初始化配置
  const loadConfig = async () => {
    try {
      config.value = await transcriptionConfigManager.load();
    } catch (e) {
      logger.warn("加载转写配置失败", e);
    }
  };

  // 保存配置
  const saveConfig = () => {
    transcriptionConfigManager.saveDebounced(config.value);
  };

  // 加载任务
  const loadTasks = async () => {
    try {
      const data = await transcriptionTasksManager.load();
      const list = data.list || [];
      let sanitizedCount = 0;
      // 处理未完成的任务：刷新后这些任务的执行上下文已丢失，标记为已取消
      // 同时清理已有记录中过长的 error 字段（历史遗留脏数据）
      tasks.value = list.map((task) => {
        if (task.status === "processing" || task.status === "pending") {
          return {
            ...task,
            status: "cancelled",
            error: "应用重启，任务已自动取消",
          };
        }
        if (task.error && task.error.length > 1500) {
          sanitizedCount++;
          return { ...task, error: sanitizeErrorMessage(task.error) };
        }
        return task;
      });
      if (sanitizedCount > 0) {
        logger.info(`已清理 ${sanitizedCount} 条历史任务的过长错误信息`);
      }
    } catch (e) {
      logger.warn("加载转写任务失败", e);
    }
  };

  // 保存任务
  const saveTasks = () => {
    // 只保存最近的 500 个任务 (文件持久化可以存更多)
    const tasksToSave = tasks.value.slice(-500);
    transcriptionTasksManager.saveDebounced({ list: tasksToSave });
  };

  // 监听配置变化并保存
  watch(
    config,
    () => {
      if (!isInitialized.value) return;
      saveConfig();
    },
    { deep: true }
  );

  // 监听任务变化并保存
  watch(
    tasks,
    () => {
      if (!isInitialized.value) return;
      saveTasks();
    },
    { deep: true }
  );

  // 初始化方法
  const init = async () => {
    if (isInitialized.value) return;
    await Promise.all([loadConfig(), loadTasks()]);
    isInitialized.value = true;
    logger.info("转写 Store 初始化完成");
  };

  // 任务管理
  const addTask = (task: TranscriptionTask) => {
    const existingIndex = tasks.value.findIndex((t) => t.assetId === task.assetId);
    if (existingIndex !== -1) {
      const existing = tasks.value[existingIndex];
      if (existing.status === "processing" || existing.status === "pending") {
        return existing;
      }

      // 如果旧任务已经有结果，将其继承给新任务，防止重试期间 UI 状态彻底丢失
      if (existing.resultPath && !task.resultPath) {
        task.resultPath = existing.resultPath;
      }
      if (existing.resultText && !task.resultText) {
        task.resultText = existing.resultText;
      }

      tasks.value.splice(existingIndex, 1);
    }
    tasks.value.push(task);
    return task;
  };

  const updateTask = (id: string, updates: Partial<TranscriptionTask>) => {
    const task = tasks.value.find((t) => t.id === id);
    if (task) {
      Object.assign(task, updates);
    }
  };

  const updateTaskByAssetId = (assetId: string, updates: Partial<TranscriptionTask>) => {
    const task = tasks.value.find((t) => t.assetId === assetId);
    if (task) {
      Object.assign(task, updates);
    }
  };

  const removeTask = (id: string) => {
    const index = tasks.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
    }
  };

  const getTaskByAssetId = (assetId: string) => {
    return tasks.value.find((t) => t.assetId === assetId);
  };

  /**
   * 提交转写任务
   */
  const submitTask = (asset: Asset, overrideConfig?: Partial<TranscriptionConfig>) => {
    const manager = useTranscriptionManager();
    return manager.addTask(asset, overrideConfig);
  };

  /**
   * 取消任务
   */
  const cancelTask = (assetId: string) => {
    const manager = useTranscriptionManager();
    manager.cancelTask(assetId);
  };

  /**
   * 重置配置为默认值
   */
  const resetConfig = () => {
    config.value = { ...DEFAULT_TRANSCRIPTION_CONFIG };
  };

  // 立即尝试初始化
  init();

  return {
    tasks,
    config,
    processingCount,
    lastTaskStartTime,
    isInitialized,
    pendingWorkbenchAssetId,
    init,
    addTask,
    updateTask,
    updateTaskByAssetId,
    removeTask,
    getTaskByAssetId,
    submitTask,
    cancelTask,
    resetConfig,
    saveConfig,
  };
});
