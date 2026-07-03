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

/**
 * inspectorStreamStore — Pinia store for LLM Inspector 流式缓冲
 *
 * 从原 [`core/streamProcessor.ts`](src/tools/llm-inspector/core/streamProcessor.ts:1) 模块级响应式单例迁移而来。
 *
 * 迁移动机：与 [`inspectorRecordsStore`](src/tools/llm-inspector/stores/inspectorRecordsStore.ts:1) 同源
 * （模块级响应式单例存在 SSR / 测试隔离 / HMR 风险，统一迁入 Pinia store）。
 *
 * 性能要点（沿用原实现，**不要动**）：
 * - `streamBuffer` 用 `shallowRef` + 手动 `triggerRef`，避免深度响应式开销；
 * - 100ms 节流：高频 SSE chunk 累积到 `pendingUpdates` Map，到期一次性 flush；
 * - 完成事件强制 flush，保证最终数据完整。
 *
 * 不放进 store state 的字段（保留为 store 闭包内变量）：
 * - `pendingUpdates: Map` —— 非响应式累积缓冲；
 * - `throttleTimer: ReturnType<typeof setTimeout> | null` —— 定时器句柄。
 */

import { defineStore } from "pinia";
import { ref, shallowRef, triggerRef, computed } from "vue";
import { createModuleLogger } from "@utils/logger";
import type { StreamUpdate, StreamBuffer } from "../types";
import {
  formatStreamingResponse,
  extractStreamContent,
  extractStreamReasoning,
  extractJsonContent,
} from "../core/contentExtractor";
import { isJson, formatJson } from "../core/utils";

const logger = createModuleLogger("LlmInspector/StreamStore");

export const useInspectorStreamStore = defineStore("llmInspectorStream", () => {
  // === 响应式状态 ===

  /** SSE 累积缓冲：shallowRef 避免深度响应式 */
  const streamBuffer = shallowRef<StreamBuffer>({});

  /** 正在进行中的流 ID 集合 */
  const activeStreamIds = ref<Set<string>>(new Set());

  /** 当前活跃的流 ID（最近一次开始流的请求） */
  const currentStreamId = ref<string | null>(null);

  // === 非响应式闭包状态 ===
  const pendingUpdates = new Map<string, string>();
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  function flushUpdates() {
    if (pendingUpdates.size === 0) {
      throttleTimer = null;
      return;
    }

    const nextBuffer = { ...streamBuffer.value };
    for (const [id, chunk] of pendingUpdates.entries()) {
      nextBuffer[id] = (nextBuffer[id] || "") + chunk;
    }
    pendingUpdates.clear();
    streamBuffer.value = nextBuffer;
    triggerRef(streamBuffer);
    throttleTimer = null;
  }

  // === 查询方法 ===

  function getStreamBuffer(): StreamBuffer {
    return streamBuffer.value;
  }

  function getCurrentStreamId(): string | null {
    return currentStreamId.value;
  }

  function isActiveStream(streamId: string): boolean {
    return activeStreamIds.value.has(streamId);
  }

  function isStreamingRecord(recordId: string): boolean {
    return activeStreamIds.value.has(recordId);
  }

  function getStreamContent(recordId: string): string {
    return streamBuffer.value[recordId] || "";
  }

  // === 流式更新 ===

  function processStreamUpdate(update: StreamUpdate): void {
    logger.debug("处理流式更新", {
      streamId: update.id,
      isComplete: update.is_complete,
      chunkLength: update.chunk?.length,
    });

    // 节流累积
    if (update.chunk) {
      const currentPending = pendingUpdates.get(update.id) || "";
      pendingUpdates.set(update.id, currentPending + update.chunk);

      if (!throttleTimer) {
        throttleTimer = setTimeout(flushUpdates, 100);
      }
    }

    if (!update.is_complete) {
      activeStreamIds.value.add(update.id);
      currentStreamId.value = update.id;
      logger.debug("流式传输开始", { streamId: update.id });
    } else {
      // 强制 flush 保证完整
      if (pendingUpdates.has(update.id)) {
        const nextBuffer = { ...streamBuffer.value };
        nextBuffer[update.id] =
          (nextBuffer[update.id] || "") + (pendingUpdates.get(update.id) || "");
        pendingUpdates.delete(update.id);
        streamBuffer.value = nextBuffer;
        triggerRef(streamBuffer);
      }

      activeStreamIds.value.delete(update.id);
      if (currentStreamId.value === update.id) {
        currentStreamId.value = null;
      }
      logger.debug("流式传输完成", { streamId: update.id });
    }
  }

  function clearStreamBuffer(recordId: string): void {
    pendingUpdates.delete(recordId);
    const nextBuffer = { ...streamBuffer.value };
    delete nextBuffer[recordId];
    streamBuffer.value = nextBuffer;
    triggerRef(streamBuffer);

    activeStreamIds.value.delete(recordId);
    if (currentStreamId.value === recordId) {
      currentStreamId.value = null;
    }
    logger.debug("清理流式缓冲", { recordId });
  }

  function clearAllStreamBuffers(): void {
    pendingUpdates.clear();
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    streamBuffer.value = {};
    triggerRef(streamBuffer);
    activeStreamIds.value.clear();
    currentStreamId.value = null;
    logger.debug("清理所有流式缓冲");
  }

  // === 内容提取（封装 contentExtractor / utils） ===

  function getDisplayResponseBody(
    recordId: string,
    originalBody?: string,
    isStreamingResponse?: boolean
  ): string {
    const bufferedContent = streamBuffer.value[recordId];
    const body = bufferedContent || originalBody || "";

    if (!body) return "";

    if (isStreamingResponse || isStreamingRecord(recordId)) {
      return formatStreamingResponse(body);
    }

    if (isJson(body)) {
      return formatJson(body);
    }

    return body;
  }

  function extractContent(
    recordId: string,
    originalBody?: string,
    isStreamingResponse?: boolean,
    requestUrl?: string
  ): string {
    const body = streamBuffer.value[recordId] || originalBody || "";

    if (!body) return "";

    if (isStreamingResponse || isStreamingRecord(recordId)) {
      return extractStreamContent(body, requestUrl);
    }

    if (isJson(body)) {
      return extractJsonContent(body, requestUrl);
    }

    return body;
  }

  /**
   * 实时提取思维链内容（仅流式场景有意义）。
   * 非流式：返回空，交由 messageParser 处理。
   */
  function extractReasoning(
    recordId: string,
    originalBody?: string,
    isStreamingResponse?: boolean,
    requestUrl?: string
  ): string {
    const body = streamBuffer.value[recordId] || originalBody || "";

    if (!body) return "";

    if (isStreamingResponse || isStreamingRecord(recordId)) {
      return extractStreamReasoning(body, requestUrl);
    }

    return "";
  }

  function canShowTextMode(recordId: string, originalBody?: string): boolean {
    if (isStreamingRecord(recordId)) {
      return true;
    }

    const body = streamBuffer.value[recordId] || originalBody || "";

    if (!body) {
      return false;
    }

    return body.includes("data: ") || isJson(body);
  }

  // === 统计 ===

  function getStreamStats() {
    const stats = {
      activeStreams: activeStreamIds.value.size,
      totalBuffered: Object.keys(streamBuffer.value).length,
      bufferSize: Object.values(streamBuffer.value).reduce(
        (total, content) => total + content.length,
        0
      ),
      currentStreamId: currentStreamId.value,
    };

    logger.debug("流式传输统计", stats);
    return stats;
  }

  // === 计算属性 ===
  const isStreamingActive = computed(() => currentStreamId.value !== null);
  const activeStreamCount = computed(() => activeStreamIds.value.size);

  return {
    // 状态
    streamBuffer,
    activeStreamIds,
    currentStreamId,

    // 计算属性
    isStreamingActive,
    activeStreamCount,

    // 查询
    getStreamBuffer,
    getCurrentStreamId,
    isActiveStream,
    isStreamingRecord,
    getStreamContent,

    // 写入
    processStreamUpdate,
    clearStreamBuffer,
    clearAllStreamBuffers,

    // 内容提取
    getDisplayResponseBody,
    extractContent,
    extractReasoning,
    canShowTextMode,

    // 统计
    getStreamStats,
  };
});
