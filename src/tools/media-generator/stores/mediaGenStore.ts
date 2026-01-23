import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MediaTask, MediaTaskStatus } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('media-generator/store');

export const useMediaGenStore = defineStore('media-generator', () => {
  const tasks = ref<MediaTask[]>([]);
  const activeTaskId = ref<string | null>(null);

  /**
   * 添加新任务
   */
  const addTask = (task: MediaTask) => {
    tasks.value.unshift(task);
    logger.info('任务已添加', { taskId: task.id, type: task.type });
  };

  /**
   * 更新任务状态
   */
  const updateTaskStatus = (taskId: string, status: MediaTaskStatus, updates?: Partial<MediaTask>) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (updates) {
        Object.assign(task, updates);
      }
      if (status === 'completed') {
        task.completedAt = Date.now();
      }
      logger.debug('任务状态已更新', { taskId, status });
    }
  };

  /**
   * 获取任务
   */
  const getTask = (taskId: string) => {
    return tasks.value.find(t => t.id === taskId);
  };

  /**
   * 删除任务
   */
  const removeTask = (taskId: string) => {
    const index = tasks.value.findIndex(t => t.id === taskId);
    if (index !== -1) {
      tasks.value.splice(index, 1);
      logger.info('任务已删除', { taskId });
    }
  };

  return {
    tasks,
    activeTaskId,
    addTask,
    updateTaskStatus,
    getTask,
    removeTask
  };
});