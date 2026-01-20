import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import type { FFmpegTask, FFmpegConfig } from "./types";
import { DEFAULT_FFMPEG_CONFIG } from "./config";
import { ffmpegConfigManager, ffmpegTasksManager } from "./utils/persistence";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ffmpegStore");

export const useFFmpegStore = defineStore("ffmpeg-tools", () => {
  // 状态
  const tasks = ref<FFmpegTask[]>([]);
  const config = ref<FFmpegConfig>({ ...DEFAULT_FFMPEG_CONFIG });
  const isInitialized = ref(false);

  // 加载配置
  const loadConfig = async () => {
    try {
      config.value = await ffmpegConfigManager.load();
    } catch (e) {
      logger.warn("加载 FFmpeg 配置失败", e);
    }
  };

  // 加载任务
  const loadTasks = async () => {
    try {
      const data = await ffmpegTasksManager.load();
      const list = data.list || [];
      // 处理应用重启后的任务状态
      tasks.value = list.map((task) => {
        if (task.status === "processing" || task.status === "pending") {
          return {
            ...task,
            status: "cancelled",
            error: "应用重启，任务已自动取消",
          };
        }
        return task;
      });
    } catch (e) {
      logger.warn("加载 FFmpeg 任务失败", e);
    }
  };

  // 保存配置
  const saveConfig = () => {
    ffmpegConfigManager.saveDebounced(config.value);
  };

  // 保存任务
  const saveTasks = () => {
    const tasksToSave = tasks.value.slice(0, 500); // 限制保存数量
    ffmpegTasksManager.saveDebounced({ list: tasksToSave });
  };

  // 监听配置变化
  watch(
    config,
    () => {
      if (!isInitialized.value) return;
      saveConfig();
    },
    { deep: true }
  );

  // 监听任务变化
  watch(
    tasks,
    () => {
      if (!isInitialized.value) return;
      saveTasks();
    },
    { deep: true }
  );

  // Getters
  const pendingTasks = computed(() => tasks.value.filter(t => t.status === "pending"));
  const activeTasks = computed(() => tasks.value.filter(t => t.status === "processing"));
  const completedTasks = computed(() => tasks.value.filter(t => t.status === "completed"));

  // 初始化
  const init = async () => {
    if (isInitialized.value) return;
    await Promise.all([loadConfig(), loadTasks()]);
    isInitialized.value = true;
    logger.info("FFmpeg Store 初始化完成");
  };

  // Actions
  const addTask = (task: Omit<FFmpegTask, "id" | "status" | "progress" | "createdAt">) => {
    const newTask: FFmpegTask = {
      ...task,
      id: crypto.randomUUID(),
      status: "pending",
      progress: {
        percent: 0,
        currentTime: 0,
        speed: "0x",
        bitrate: "0kbps",
      },
      createdAt: Date.now(),
    };
    tasks.value.unshift(newTask);
    return newTask;
  };

  const updateTask = (id: string, updates: Partial<FFmpegTask>) => {
    const task = tasks.value.find((t) => t.id === id);
    if (task) {
      Object.assign(task, updates);
      if (updates.status === "completed" || updates.status === "failed" || updates.status === "cancelled") {
        task.completedAt = Date.now();
      }
    }
  };

  const updateTaskProgress = (id: string, progress: Partial<FFmpegTask["progress"]>) => {
    const task = tasks.value.find((t) => t.id === id);
    if (task) {
      task.progress = { ...task.progress, ...progress };
    }
  };

  const addTaskLog = (id: string, log: string) => {
    const task = tasks.value.find((t) => t.id === id);
    if (task) {
      if (!task.logs) task.logs = [];
      task.logs.push(log);
      // 限制日志数量，防止内存溢出
      if (task.logs.length > 2000) {
        task.logs.shift();
      }
    }
  };

  const removeTask = (id: string) => {
    const index = tasks.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      tasks.value.splice(index, 1);
    }
  };

  const clearCompletedTasks = () => {
    tasks.value = tasks.value.filter((t) => t.status !== "completed");
  };

  const resetConfig = () => {
    config.value = { ...DEFAULT_FFMPEG_CONFIG };
  };

  // 立即初始化
  init();

  return {
    tasks,
    config,
    isInitialized,
    pendingTasks,
    activeTasks,
    completedTasks,
    init,
    addTask,
    updateTask,
    updateTaskProgress,
    addTaskLog,
    removeTask,
    clearCompletedTasks,
    resetConfig,
  };
});