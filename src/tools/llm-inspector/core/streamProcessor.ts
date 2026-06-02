/**
 * streamProcessor — 兼容层（已迁移至 Pinia store）
 *
 * 历史：原本是模块级响应式单例 + 100ms 节流（存在 SSR / 测试隔离 / HMR 风险）。
 * 迁移：2026-06，状态与方法已搬入 [`stores/inspectorStreamStore`](src/tools/llm-inspector/stores/inspectorStreamStore.ts:1)。
 *
 * 本文件保留是为了**消费方零改动**：
 * - 所有现有 `import { useStreamProcessor } from "../core/streamProcessor"` 都继续工作；
 * - 返回值结构与原 hook 完全一致（state 是 ref / shallowRef，方法直接调用）；
 * - `StreamContentProcessor` 类与 `createStreamProcessor` 工厂保留，它们不依赖响应式单例。
 *
 * 新代码请直接 import [`useInspectorStreamStore`](src/tools/llm-inspector/stores/inspectorStreamStore.ts:33)。
 */

import { storeToRefs } from "pinia";
import { useInspectorStreamStore } from "../stores/inspectorStreamStore";
import { extractStreamContent } from "./contentExtractor";

/**
 * 响应式访问器：对外暴露与原 streamProcessor 完全相同的 API。
 *
 * `streamBuffer` / `activeStreamIds` / `currentStreamId` 通过 `storeToRefs` 解构出
 * ref 形式，保持原 hook 解构后的 `xxx.value` 访问语法。计算属性 `isStreamingActive` /
 * `activeStreamCount` 也通过 `storeToRefs` 被识别为 computed ref。
 */
export function useStreamProcessor() {
  const store = useInspectorStreamStore();
  const {
    streamBuffer,
    activeStreamIds,
    currentStreamId,
    isStreamingActive,
    activeStreamCount,
  } = storeToRefs(store);

  return {
    // 状态
    streamBuffer,
    activeStreamIds,
    currentStreamId,

    // 计算属性
    isStreamingActive,
    activeStreamCount,

    // 方法
    getStreamBuffer: store.getStreamBuffer,
    getCurrentStreamId: store.getCurrentStreamId,
    isActiveStream: store.isActiveStream,
    processStreamUpdate: store.processStreamUpdate,
    getStreamContent: store.getStreamContent,
    clearStreamBuffer: store.clearStreamBuffer,
    clearAllStreamBuffers: store.clearAllStreamBuffers,
    isStreamingRecord: store.isStreamingRecord,
    getDisplayResponseBody: store.getDisplayResponseBody,
    extractContent: store.extractContent,
    extractReasoning: store.extractReasoning,
    canShowTextMode: store.canShowTextMode,
    getStreamStats: store.getStreamStats,
  };
}

/**
 * 流式内容预处理器（轻量类，不依赖响应式单例）
 *
 * 用于在 fetchWithTimeout 钩子中累积一个独立请求的 SSE chunk，与上面的全局
 * Pinia store 无关——store 管的是「所有请求的累积总缓冲」，本类管的是「单个请求
 * 的本地缓冲」。两者职责正交，本类保持原实现不变。
 */
export class StreamContentProcessor {
  private recordId: string;
  private chunks: string[] = [];
  private processedContent = "";

  constructor(recordId: string) {
    this.recordId = recordId;
  }

  addChunk(chunk: string): void {
    this.chunks.push(chunk);
    this.processedContent += chunk;
  }

  getContent(): string {
    return this.processedContent;
  }

  getChunkCount(): number {
    return this.chunks.length;
  }

  reset(): void {
    this.chunks = [];
    this.processedContent = "";
  }

  extractText(): string {
    return extractStreamContent(this.processedContent);
  }

  getStats() {
    return {
      recordId: this.recordId,
      chunkCount: this.chunks.length,
      contentLength: this.processedContent.length,
      textLength: this.extractText().length,
    };
  }
}

export function createStreamProcessor(
  recordId: string
): StreamContentProcessor {
  return new StreamContentProcessor(recordId);
}
