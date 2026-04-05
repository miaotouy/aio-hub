import { defineStore } from "pinia";
import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { v4 as uuidv4 } from "uuid";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { DOWNLOAD_EVENTS, type DownloadCompletedPayload, type DownloadItem } from "@/types/download";
import { downloadHistoryManager } from "@/utils/downloadHistory";

const logger = createModuleLogger("DownloadStore");
const errorHandler = createModuleErrorHandler("DownloadStore");

const MAX_HISTORY_COUNT = 50;

/**
 * 下载历史存储 Store
 */
export const useDownloadStore = defineStore("download", () => {
  const history = ref<DownloadItem[]>([]);
  const isLoaded = ref(false);
  const lastCompletedId = ref<string>(""); // 用于触发 UI 动画
  let unlistenCompleted: (() => void) | null = null;

  /**
   * 从全局事件同步下载记录
   */
  async function syncFromEvent(payload: DownloadCompletedPayload) {
    // 如果是成功状态，添加到历史记录
    if (payload.status === "success") {
      // 检查是否已经存在（避免重复添加，虽然 UUID 理论上不重复）
      const exists = history.value.some((item) => item.id === payload.id);
      if (exists) {
        // 如果已存在，更新状态即可
        await updateStatus(payload.id, "success");
      } else {
        const newItem: DownloadItem = {
          id: payload.id,
          filename: payload.filename,
          filepath: payload.filepath,
          size: payload.size,
          status: "success",
          timestamp: payload.timestamp,
        };

        history.value.unshift(newItem);
        if (history.value.length > MAX_HISTORY_COUNT) {
          history.value = history.value.slice(0, MAX_HISTORY_COUNT);
        }
        await save();
      }

      lastCompletedId.value = payload.id; // 触发 UI 动画
      logger.debug("从全局事件同步下载记录", { filename: payload.filename });
    } else if (payload.status === "failed") {
      await updateStatus(payload.id, "failed", payload.error);
    }
  }

  /**
   * 初始化全局事件监听
   */
  async function initializeEventListener() {
    try {
      // 如果已经有监听器，先清理
      if (unlistenCompleted) {
        unlistenCompleted();
      }

      unlistenCompleted = await listen(DOWNLOAD_EVENTS.COMPLETED, (event) => {
        const payload = event.payload as DownloadCompletedPayload;
        syncFromEvent(payload);
      });
      logger.info("下载事件监听已初始化");
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "初始化下载事件监听失败",
        showToUser: false,
      });
    }
  }

  /**
   * 从本地加载历史记录
   */
  async function load() {
    try {
      const data = await downloadHistoryManager.load();
      if (data && data.history) {
        history.value = data.history;
      }
      isLoaded.value = true;

      // 初始化全局事件监听
      await initializeEventListener();

      logger.info("下载历史加载成功", { count: history.value.length });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载下载历史失败",
        showToUser: false,
      });
    }
  }

  /**
   * 保存历史记录到本地
   */
  async function save() {
    try {
      await downloadHistoryManager.save({
        history: history.value,
        version: "1.0.0",
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存下载历史失败",
        showToUser: false,
      });
    }
  }

  /**
   * 添加下载记录
   */
  async function addDownload(item: Omit<DownloadItem, "id" | "timestamp">) {
    const newItem: DownloadItem = {
      ...item,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    // 添加到开头（最新的在前）
    history.value.unshift(newItem);

    // 限制数量
    if (history.value.length > MAX_HISTORY_COUNT) {
      history.value = history.value.slice(0, MAX_HISTORY_COUNT);
    }

    await save();
    logger.debug("添加下载记录", { filename: newItem.filename });
    return newItem;
  }

  /**
   * 删除单条记录
   */
  async function removeDownload(id: string) {
    history.value = history.value.filter((item) => item.id !== id);
    await save();
  }

  /**
   * 清空所有历史
   */
  async function clearHistory() {
    history.value = [];
    await save();
    logger.info("已清空下载历史");
  }

  /**
   * 更新下载状态
   */
  async function updateStatus(id: string, status: DownloadItem["status"], error?: string) {
    const item = history.value.find((i) => i.id === id);
    if (item) {
      item.status = status;
      if (error !== undefined) {
        item.error = error;
      }
      await save();
    }
  }

  /**
   * 获取最近 N 条记录
   */
  function getRecent(count = 10) {
    return history.value.slice(0, count);
  }

  // 初始化加载
  load();

  return {
    history,
    isLoaded,
    lastCompletedId,
    addDownload,
    removeDownload,
    clearHistory,
    updateStatus,
    getRecent,
    syncFromEvent,
  };
});
