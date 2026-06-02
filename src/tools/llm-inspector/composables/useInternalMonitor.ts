/**
 * useInternalMonitor — 内部 LLM 调用监控接入器（C2）
 *
 * 负责把 [`inspectorHookRegistry`](src/tools/llm-inspector/core/hookRegistry.ts:1)
 * 触发的内部 LLM 请求 / 响应 / 流 / 错误事件，转换为 Inspector 现有的
 * [`CombinedRecord`](src/tools/llm-inspector/types.ts:42) / [`StreamUpdate`](src/tools/llm-inspector/types.ts:48)
 * 数据结构，写入 recordManager / streamProcessor。
 *
 * 双通道接入：
 * 1. **本地钩子**：`inspectorHookRegistry.register(...)` 同窗口零延迟回调；
 * 2. **跨窗口 Tauri Event**：监听 [`INSPECTOR_INTERNAL_EVENT`](src/tools/llm-inspector/types/hooks.ts:148)
 *    系列事件名，接收来自分离窗口/其他窗口的广播。
 *
 * 关键去重：
 * Tauri `emit()` 在同窗口也会回调订阅者本身，因此主窗口会同时收到本地回调与
 * Tauri event 两次。本模块以 `${type}:${requestId}:${timestamp}` 为短期 LRU 键
 * 去重；不同窗口的 emit 由于 timestamp 仍可能完全相同（取自 event payload 的
 * timestamp 字段），所以同事件会被去重为一次。stream chunk 因 timestamp 不同
 * 不会冲突。
 *
 * 生命周期：
 * 在 [`useInspectorManager`](src/tools/llm-inspector/composables/useInspectorManager.ts:31)
 * 的 setup 阶段调用本 composable，跟随 inspector 页面 mount/unmount。
 */

import { onMounted, onUnmounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { inspectorHookRegistry } from "../core/hookRegistry";
import { useRecordManager } from "../core/recordManager";
import { useStreamProcessor } from "../core/streamProcessor";
import { LruSet } from "../core/lruCache";
import {
  INSPECTOR_INTERNAL_EVENT,
  type InspectorErrorEvent,
  type InspectorRequestEvent,
  type InspectorResponseEvent,
  type InspectorStreamEvent,
} from "../types/hooks";
import type {
  RecordInspectorMetadata,
  RequestRecord,
  ResponseRecord,
  StreamUpdate,
} from "../types";

const logger = createModuleLogger("LlmInspector/InternalMonitor");
const errorHandler = createModuleErrorHandler("LlmInspector/InternalMonitor");

/** 去重 LRU 容量上限（条数）。同事件本地+Tauri 共占 1 条。 */
const DEDUP_LRU_LIMIT = 500;

/**
 * 把 InspectorRequestEvent 转成 RequestRecord
 */
function toRequestRecord(event: InspectorRequestEvent): RequestRecord {
  return {
    id: event.requestId,
    timestamp: event.timestamp,
    method: event.method,
    url: event.url,
    headers: event.headers,
    body: event.body,
    request_size: event.body ? event.body.length : 0,
  };
}

/**
 * 把 InspectorResponseEvent 转成 ResponseRecord
 */
function toResponseRecord(event: InspectorResponseEvent): ResponseRecord {
  return {
    id: event.requestId,
    timestamp: event.timestamp,
    status: event.status,
    headers: event.headers,
    body: event.body,
    response_size: event.body ? event.body.length : 0,
    duration_ms: event.durationMs,
  };
}

/**
 * 把 InspectorStreamEvent 转成 StreamUpdate
 */
function toStreamUpdate(event: InspectorStreamEvent): StreamUpdate {
  return {
    id: event.requestId,
    chunk: event.chunk,
    is_complete: event.isComplete,
  };
}

/**
 * 提取 InspectorContextMetadata 中与记录相关的字段
 */
function pickInspectorMetadata(
  metadata?: InspectorRequestEvent["metadata"]
): RecordInspectorMetadata | undefined {
  if (!metadata) return undefined;
  const picked: RecordInspectorMetadata = {};
  if (metadata.profileId) picked.profileId = metadata.profileId;
  if (metadata.modelId) picked.modelId = metadata.modelId;
  if (metadata.sessionId) picked.sessionId = metadata.sessionId;
  if (metadata.toolName) picked.toolName = metadata.toolName;
  if (metadata.purpose) picked.purpose = metadata.purpose;
  return Object.keys(picked).length > 0 ? picked : undefined;
}

/**
 * 接入内部钩子监控，跟随调用方组件生命周期。
 *
 * 默认开关 OFF（由 [`inspectorHookRegistry.enable()`](src/tools/llm-inspector/core/hookRegistry.ts:55)
 * 控制）。即使 enable 状态下，本 composable 也是惰性的——只有真实事件触发才会
 * 写入 recordManager。
 */
export function useInternalMonitor() {
  const recordManager = useRecordManager();
  const streamProcessor = useStreamProcessor();

  // 去重 LRU：以 `${type}:${requestId}:${timestamp}` 为键
  const seen = new LruSet<string>(DEDUP_LRU_LIMIT);

  /** 检查是否已处理过；返回 true 表示首次见到，false 表示重复。 */
  const markAndCheck = (key: string): boolean => seen.add(key);

  const handleRequest = (event: InspectorRequestEvent) => {
    const key = `req:${event.requestId}:${event.timestamp}`;
    if (!markAndCheck(key)) return;
    try {
      recordManager.addRequestRecord(
        toRequestRecord(event),
        "internal",
        pickInspectorMetadata(event.metadata)
      );
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "处理内部请求事件失败",
        showToUser: false,
        context: { requestId: event.requestId },
      });
    }
  };

  const handleResponse = (event: InspectorResponseEvent) => {
    const key = `res:${event.requestId}:${event.timestamp}`;
    if (!markAndCheck(key)) return;
    try {
      recordManager.updateResponseRecord(toResponseRecord(event));
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "处理内部响应事件失败",
        showToUser: false,
        context: { requestId: event.requestId },
      });
    }
  };

  const handleStream = (event: InspectorStreamEvent) => {
    const key = `stream:${event.requestId}:${event.timestamp}`;
    if (!markAndCheck(key)) return;
    try {
      streamProcessor.processStreamUpdate(toStreamUpdate(event));
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "处理内部流式事件失败",
        showToUser: false,
        context: { requestId: event.requestId },
      });
    }
  };

  const handleError = (event: InspectorErrorEvent) => {
    const key = `err:${event.requestId}:${event.timestamp}`;
    if (!markAndCheck(key)) return;
    // 错误事件不直接产生新记录；如果对应请求记录已存在，可补充一条状态码 0 的响应
    // 占位以表示请求失败。否则忽略——避免无中生有的孤立错误条目。
    try {
      const existing = recordManager.findRecordById(event.requestId);
      if (existing && !existing.response) {
        recordManager.updateResponseRecord({
          id: event.requestId,
          timestamp: event.timestamp,
          status: 0,
          headers: {},
          body: `[${event.errorName}] ${event.errorMessage}`,
          response_size: 0,
          duration_ms: existing.request.timestamp
            ? event.timestamp - existing.request.timestamp
            : 0,
        });
      }
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "处理内部错误事件失败",
        showToUser: false,
        context: { requestId: event.requestId },
      });
    }
  };

  // 本地钩子注销函数
  let unregisterLocal: (() => void) | null = null;
  // Tauri event 取消监听函数
  const tauriUnlisteners: UnlistenFn[] = [];

  onMounted(async () => {
    // 1) 注册本地钩子（同窗口零延迟）
    unregisterLocal = inspectorHookRegistry.register({
      onRequest: handleRequest,
      onResponse: handleResponse,
      onStream: handleStream,
      onError: handleError,
    });

    // 2) 监听 Tauri 跨窗口广播
    // 注意：listen 在非 Tauri 环境会抛错，单个失败不影响其他订阅
    const subscribePairs: Array<{
      channel: string;
      handler: (payload: unknown) => void;
    }> = [
      {
        channel: INSPECTOR_INTERNAL_EVENT.REQUEST,
        handler: (p) => handleRequest(p as InspectorRequestEvent),
      },
      {
        channel: INSPECTOR_INTERNAL_EVENT.RESPONSE,
        handler: (p) => handleResponse(p as InspectorResponseEvent),
      },
      {
        channel: INSPECTOR_INTERNAL_EVENT.STREAM,
        handler: (p) => handleStream(p as InspectorStreamEvent),
      },
      {
        channel: INSPECTOR_INTERNAL_EVENT.ERROR,
        handler: (p) => handleError(p as InspectorErrorEvent),
      },
    ];

    for (const { channel, handler } of subscribePairs) {
      try {
        const unlisten = await listen(channel, (event) =>
          handler(event.payload)
        );
        tauriUnlisteners.push(unlisten);
      } catch (error) {
        logger.debug("Tauri listen 失败（可能在非 Tauri 环境）", {
          channel,
          error: String(error),
        });
      }
    }

    logger.debug("内部监控已挂载", {
      tauriListeners: tauriUnlisteners.length,
    });
  });

  onUnmounted(() => {
    if (unregisterLocal) {
      unregisterLocal();
      unregisterLocal = null;
    }
    for (const unlisten of tauriUnlisteners) {
      try {
        unlisten();
      } catch {
        // 单个 unlisten 失败不阻塞其他清理
      }
    }
    tauriUnlisteners.length = 0;
    seen.clear();
    logger.debug("内部监控已卸载");
  });
}
