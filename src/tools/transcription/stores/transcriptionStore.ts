import { defineStore } from "pinia";
import { ref, reactive, watch } from "vue";
import type { TranscriptionTask, TranscriptionConfig } from "../types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "../config";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("transcriptionStore");

const STORAGE_KEY = "aio_transcription_config";

export const useTranscriptionStore = defineStore("transcription", () => {
  // 状态
  const tasks = reactive<TranscriptionTask[]>([]);
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

  // 监听配置变化并保存
  watch(config, saveConfig, { deep: true });

  // 任务管理
  const addTask = (task: TranscriptionTask) => {
    const existingIndex = tasks.findIndex(t => t.assetId === task.assetId);
    if (existingIndex !== -1) {
      const existing = tasks[existingIndex];
      if (existing.status === "processing" || existing.status === "pending") {
        return existing;
      }
      tasks.splice(existingIndex, 1);
    }
    tasks.push(task);
    return task;
  };

  const updateTask = (id: string, updates: Partial<TranscriptionTask>) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      Object.assign(task, updates);
    }
  };

  const updateTaskByAssetId = (assetId: string, updates: Partial<TranscriptionTask>) => {
    const task = tasks.find(t => t.assetId === assetId);
    if (task) {
      Object.assign(task, updates);
    }
  };

  const removeTask = (id: string) => {
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks.splice(index, 1);
    }
  };

  const getTaskByAssetId = (assetId: string) => {
    return tasks.find(t => t.assetId === assetId);
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