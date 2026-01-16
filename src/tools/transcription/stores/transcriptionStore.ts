import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { TranscriptionTask, TranscriptionConfig } from "../types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "../config";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("transcriptionStore");

const STORAGE_KEY = "aio_transcription_config";
const STORAGE_KEY_TASKS = "aio_transcription_tasks";

export const useTranscriptionStore = defineStore("transcription", () => {
  // 状态
  const tasks = ref<TranscriptionTask[]>([]);
  const processingCount = ref(0);
  const lastTaskStartTime = ref(0);

  // 配置
  const config = ref<TranscriptionConfig>({ ...DEFAULT_TRANSCRIPTION_CONFIG });

  // 初始化配置
  const loadConfig = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        config.value = { ...DEFAULT_TRANSCRIPTION_CONFIG, ...parsed };
      }
    } catch (e) {
      logger.warn("加载转写配置失败", e);
    }
  };

  // 保存配置
  const saveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
  };

  // 加载任务
  const loadTasks = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_TASKS);
      if (stored) {
        const parsed = JSON.parse(stored) as TranscriptionTask[];
        // 处理未完成的任务：刷新后这些任务的执行上下文已丢失，标记为已取消
        tasks.value = parsed.map(task => {
          if (task.status === "processing" || task.status === "pending") {
            return {
              ...task,
              status: "cancelled",
              error: "应用重启，任务已自动取消"
            };
          }
          return task;
        });
      }
    } catch (e) {
      logger.warn("加载转写任务失败", e);
    }
  };

  // 保存任务
  const saveTasks = () => {
    // 只保存最近的 100 个任务，防止 localStorage 溢出
    const tasksToSave = tasks.value.slice(-100);
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasksToSave));
  };

  // 监听配置变化并保存
  watch(config, saveConfig, { deep: true });

  // 监听任务变化并保存
  watch(tasks, saveTasks, { deep: true });

  // 任务管理
  const addTask = (task: TranscriptionTask) => {
    const existingIndex = tasks.value.findIndex(t => t.assetId === task.assetId);
    if (existingIndex !== -1) {
      const existing = tasks.value[existingIndex];
      if (existing.status === "processing" || existing.status === "pending") {
        return existing;
      }
      tasks.value.splice(existingIndex, 1);
    }
    tasks.value.push(task);
    return task;
  };

  const updateTask = (id: string, updates: Partial<TranscriptionTask>) => {
    const task = tasks.value.find(t => t.id === id);
    if (task) {
      Object.assign(task, updates);
    }
  };

  const updateTaskByAssetId = (assetId: string, updates: Partial<TranscriptionTask>) => {
    const task = tasks.value.find(t => t.assetId === assetId);
    if (task) {
      Object.assign(task, updates);
    }
  };

  const removeTask = (id: string) => {
    const index = tasks.value.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
    }
  };

  const getTaskByAssetId = (assetId: string) => {
    return tasks.value.find(t => t.assetId === assetId);
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

  // 初始化
  loadConfig();
  loadTasks();

  return {
    tasks,
    config,
    processingCount,
    lastTaskStartTime,
    addTask,
    updateTask,
    updateTaskByAssetId,
    removeTask,
    getTaskByAssetId,
    submitTask,
    cancelTask,
    saveConfig
  };
});