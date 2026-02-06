import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import type { KbMonitorMessage, RagPayload } from "../types/monitor";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { invoke } from "@tauri-apps/api/core";

const logger = createModuleLogger("kb-monitor-composable");
const errorHandler = createModuleErrorHandler("kb-monitor-composable");

/**
 * 知识库监控系统前端事件监听和缓冲机制
 */
let unlisten: UnlistenFn | null = null;
let bufferTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastMessageTime = Date.now();

export function useKbMonitor() {
  const store = useKnowledgeBaseStore();

  /**
   * 批量刷新缓冲区到日志列表
   */
  const flushBuffer = () => {
    if (store.monitor.buffer.length === 0) return;

    // 将缓冲区内容添加到日志列表
    const newLogs = [...store.monitor.buffer];

    // 组合新旧日志，并应用容量限制
    const combinedLogs = [...newLogs, ...store.monitor.logs];
    if (combinedLogs.length > store.monitor.maxCapacity) {
      store.monitor.logs = combinedLogs.slice(0, store.monitor.maxCapacity);
    } else {
      store.monitor.logs = combinedLogs;
    }

    // 更新统计信息
    const now = Date.now();
    const durationMin = (now - store.monitor.stats.lastUpdate) / 60000;

    if (durationMin > 0) {
      // 简单估算每分钟日志数
      const currentLPM = newLogs.length / Math.max(durationMin, 0.1);
      store.monitor.stats.logsPerMinute = Math.round(
        store.monitor.stats.logsPerMinute * 0.7 + currentLPM * 0.3
      );
    }

    // 计算错误率 (最近这一批)
    const errorCount = newLogs.filter((log) => log.level === "error").length;
    const batchErrorRate = errorCount / newLogs.length;
    store.monitor.stats.errorRate = Number(
      (store.monitor.stats.errorRate * 0.8 + batchErrorRate * 0.2).toFixed(2)
    );

    // 更新类型分布
    newLogs.forEach((log) => {
      if (store.monitor.stats.typeDistribution[log.type] !== undefined) {
        store.monitor.stats.typeDistribution[log.type]++;
      }
    });

    // 更新 RAG 平均耗时和历史记录
    const ragLogs = newLogs.filter((log) => log.type === "RAG");
    if (ragLogs.length > 0) {
      const durations = ragLogs.map((log) => (log.payload as RagPayload).stats.duration);
      const batchAvg = durations.reduce((acc, d) => acc + d, 0) / durations.length;

      if (store.monitor.stats.avgRagDuration === 0) {
        store.monitor.stats.avgRagDuration = batchAvg;
      } else {
        store.monitor.stats.avgRagDuration =
          store.monitor.stats.avgRagDuration * 0.7 + batchAvg * 0.3;
      }

      // 更新历史记录 (保留最近 20 次)
      const newHistory = [...store.monitor.stats.ragDurationHistory, ...durations];
      store.monitor.stats.ragDurationHistory = newHistory.slice(-20);
    }

    store.monitor.stats.lastUpdate = now;

    // 清空缓冲区
    store.monitor.buffer = [];
    bufferTimer = null;

    logger.debug(`刷新了 ${newLogs.length} 条监控日志`);
  };

  /**
   * 调度批量刷新
   */
  const scheduleFlush = () => {
    if (bufferTimer) return;

    // 500ms 刷新一次，平衡实时性和性能
    bufferTimer = setTimeout(flushBuffer, 500);
  };

  /**
   * 启动监听
   */
  const startListening = async () => {
    if (unlisten) return;

    try {
      unlisten = await listen<KbMonitorMessage>("kb-monitor", (event) => {
        const message = event.payload;
        lastMessageTime = Date.now();

        // 添加到缓冲区
        store.monitor.buffer.push(message);

        // 如果未暂停，启动批量刷新定时器
        if (!store.monitor.isPaused) {
          scheduleFlush();
        }
      });

      // 启动后端心跳推送（30s一次）
      if (!heartbeatTimer) {
        heartbeatTimer = setInterval(() => {
          invoke("kb_monitor_heartbeat").catch((e) =>
            errorHandler.handle(e, { userMessage: "发送心跳失败", showToUser: false })
          );
        }, 30000);
      }

      // 启动看门狗检测（60s无消息重连）
      if (!watchdogTimer) {
        watchdogTimer = setInterval(() => {
          const now = Date.now();
          if (now - lastMessageTime > 60000) {
            logger.warn("检测到监控连接可能断开，正在尝试重连...");
            stopListening();
            startListening();
          }
        }, 10000);
      }

      logger.info("已启动知识库监控监听");
    } catch (error) {
      logger.error("启动监控监听失败", error);
    }
  };

  /**
   * 停止监听
   */
  const stopListening = () => {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    if (bufferTimer) {
      clearTimeout(bufferTimer);
      bufferTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  };

  /**
   * 暂停/恢复刷新
   */
  const togglePause = (paused?: boolean) => {
    store.monitor.isPaused = paused ?? !store.monitor.isPaused;
    if (!store.monitor.isPaused) {
      scheduleFlush();
    }
  };

  /**
   * 清空日志
   */
  const clearLogs = () => {
    store.monitor.logs = [];
    store.monitor.buffer = [];
    store.monitor.stats.errorRate = 0;
    store.monitor.stats.logsPerMinute = 0;
    // 重置类型分布
    store.monitor.stats.typeDistribution = {
      RAG: 0,
      Index: 0,
      System: 0,
      Chain: 0,
    };
    store.monitor.stats.avgRagDuration = 0;
    store.monitor.stats.ragDurationHistory = [];
  };

  return {
    startListening,
    stopListening,
    togglePause,
    clearLogs,
    flushBuffer,
  };
}
