import { ref, computed, watch } from 'vue';
import { createModuleLogger } from '@utils/logger';
import type { StreamUpdate, StreamBuffer } from './types';
import { formatStreamingResponse, extractStreamContent, extractJsonContent, isJson, formatJson } from './utils';

const logger = createModuleLogger('LlmInspector/StreamProcessor');

// 流式缓冲区
const streamBuffer = ref<StreamBuffer>({});
const activeStreamIds = ref<Set<string>>(new Set());

// 当前活动的流式ID
const currentStreamId = ref<string | null>(null);

/**
 * 获取流式缓冲区
 */
export function getStreamBuffer(): StreamBuffer {
  return streamBuffer.value;
}

/**
 * 获取当前活动的流式ID
 */
export function getCurrentStreamId(): string | null {
  return currentStreamId.value;
}

/**
 * 检查是否是活动的流
 */
export function isActiveStream(streamId: string): boolean {
  return activeStreamIds.value.has(streamId);
}

/**
 * 处理流式更新
 */
export function processStreamUpdate(update: StreamUpdate): void {
  logger.debug('处理流式更新', {
    streamId: update.id,
    isComplete: update.is_complete,
    chunkLength: update.chunk?.length
  });

  // 更新缓冲区
  if (update.chunk) {
    const currentContent = streamBuffer.value[update.id] || '';
    streamBuffer.value[update.id] = currentContent + update.chunk;
  }

  // 管理活动流状态
  if (!update.is_complete) {
    activeStreamIds.value.add(update.id);
    currentStreamId.value = update.id;
    logger.debug('流式传输开始', { streamId: update.id });
  } else {
    activeStreamIds.value.delete(update.id);
    if (currentStreamId.value === update.id) {
      currentStreamId.value = null;
    }
    logger.debug('流式传输完成', { streamId: update.id });
  }
}

/**
 * 获取指定记录的流式内容
 */
export function getStreamContent(recordId: string): string {
  return streamBuffer.value[recordId] || '';
}

/**
 * 清理指定记录的流式缓冲
 */
export function clearStreamBuffer(recordId: string): void {
  delete streamBuffer.value[recordId];
  activeStreamIds.value.delete(recordId);
  if (currentStreamId.value === recordId) {
    currentStreamId.value = null;
  }
  logger.debug('清理流式缓冲', { recordId });
}

/**
 * 清理所有流式缓冲
 */
export function clearAllStreamBuffers(): void {
  streamBuffer.value = {};
  activeStreamIds.value.clear();
  currentStreamId.value = null;
  logger.debug('清理所有流式缓冲');
}

/**
 * 检查记录是否正在流式传输
 */
export function isStreamingRecord(recordId: string): boolean {
  return activeStreamIds.value.has(recordId);
}

/**
 * 获取显示的响应体内容
 */
export function getDisplayResponseBody(recordId: string, originalBody?: string, isStreamingResponse?: boolean): string {
  // 优先使用流式缓冲内容
  const bufferedContent = streamBuffer.value[recordId];
  const body = bufferedContent || originalBody || '';

  if (!body) return '';

  // 如果是流式响应，格式化SSE
  if (isStreamingResponse || isStreamingRecord(recordId)) {
    return formatStreamingResponse(body);
  }

  // 如果是JSON，格式化显示
  if (isJson(body)) {
    return formatJson(body);
  }

  return body;
}

/**
 * 提取正文内容
 */
export function extractContent(recordId: string, originalBody?: string, isStreamingResponse?: boolean): string {
  const body = streamBuffer.value[recordId] || originalBody || '';

  if (!body) return '';

  // 如果是流式响应，使用流式提取
  if (isStreamingResponse || isStreamingRecord(recordId)) {
    return extractStreamContent(body);
  }

  // 如果是JSON，使用JSON提取
  if (isJson(body)) {
    return extractJsonContent(body);
  }

  return body;
}

/**
 * 检查是否可以显示正文模式
 */
export function canShowTextMode(recordId: string, originalBody?: string): boolean {
  // 如果正在流式传输，始终允许显示正文模式
  if (isStreamingRecord(recordId)) {
    return true;
  }

  const body = streamBuffer.value[recordId] || originalBody || '';

  if (!body) {
    return false;
  }

  // 检查是否是流式响应或JSON响应
  return body.includes('data: ') || isJson(body);
}

/**
 * 获取流式传输统计
 */
export function getStreamStats() {
  const stats = {
    activeStreams: activeStreamIds.value.size,
    totalBuffered: Object.keys(streamBuffer.value).length,
    bufferSize: Object.values(streamBuffer.value).reduce((total, content) => total + content.length, 0),
    currentStreamId: currentStreamId.value
  };

  logger.debug('流式传输统计', stats);
  return stats;
}

/**
 * 创建流式处理器组合式函数
 */
export function useStreamProcessor() {
  // 计算属性
  const isStreamingActive = computed(() => {
    return currentStreamId.value !== null;
  });

  const activeStreamCount = computed(() => {
    return activeStreamIds.value.size;
  });

  // 监听当前流式ID变化
  watch(currentStreamId, (newId, oldId) => {
    logger.debug('当前流式ID变化', { newId, oldId });
  });

  return {
    // 状态
    streamBuffer: streamBuffer,
    activeStreamIds: activeStreamIds,
    currentStreamId: currentStreamId,

    // 计算属性
    isStreamingActive,
    activeStreamCount,

    // 方法
    getStreamBuffer,
    getCurrentStreamId,
    isActiveStream,
    processStreamUpdate,
    getStreamContent,
    clearStreamBuffer,
    clearAllStreamBuffers,
    isStreamingRecord,
    getDisplayResponseBody,
    extractContent,
    canShowTextMode,
    getStreamStats
  };
}

/**
 * 流式内容预处理器
 */
export class StreamContentProcessor {
  private recordId: string;
  private chunks: string[] = [];
  private processedContent = '';

  constructor(recordId: string) {
    this.recordId = recordId;
  }

  /**
   * 添加数据块
   */
  addChunk(chunk: string): void {
    this.chunks.push(chunk);
    this.processedContent += chunk;
  }

  /**
   * 获取累积的内容
   */
  getContent(): string {
    return this.processedContent;
  }

  /**
   * 获取块数量
   */
  getChunkCount(): number {
    return this.chunks.length;
  }

  /**
   * 重置处理器
   */
  reset(): void {
    this.chunks = [];
    this.processedContent = '';
  }

  /**
   * 提取纯文本内容
   */
  extractText(): string {
    return extractStreamContent(this.processedContent);
  }

  /**
   * 获取处理统计
   */
  getStats() {
    return {
      recordId: this.recordId,
      chunkCount: this.chunks.length,
      contentLength: this.processedContent.length,
      textLength: this.extractText().length
    };
  }
}

/**
 * 创建流式内容处理器
 */
export function createStreamProcessor(recordId: string): StreamContentProcessor {
  return new StreamContentProcessor(recordId);
}