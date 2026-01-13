import { ref, computed, watch, toRefs } from 'vue';
import { useStreamProcessor } from '../core/streamProcessor';
import { copyToClipboard, maskSensitiveData, formatJson, formatSize, getStatusClass } from '../core/utils';
import type { CombinedRecord, ViewMode } from '../types';

export function useRecordDetail(props: { record: CombinedRecord | null; maskApiKeys?: boolean; }) {
  const { record, maskApiKeys } = toRefs(props);
  const streamProcessor = useStreamProcessor();

  const viewMode = ref<ViewMode>('raw');

  // 计算属性
  const isStreamingActive = computed(() => {
    return record.value ? streamProcessor.isStreamingRecord(record.value.id) : false;
  });

  const isStreamingResponse = computed(() => {
    if (isStreamingActive.value) return true;
    if (!record.value?.response?.headers) return false;
    const contentType = record.value.response.headers['content-type'] || record.value.response.headers['Content-Type'] || '';
    return contentType.includes('text/event-stream');
  });

  const displayResponseBody = computed(() => {
    if (!record.value) return '';
    return streamProcessor.getDisplayResponseBody(record.value.id, record.value.response?.body, isStreamingResponse.value);
  });

  const canShowTextMode = computed(() => {
    return record.value ? streamProcessor.canShowTextMode(record.value.id, record.value.response?.body) : false;
  });

  const extractedContent = computed(() => {
    if (!record.value) return '';
    return streamProcessor.extractContent(record.value.id, record.value.response?.body, isStreamingResponse.value);
  });

  // 复制功能
  async function copyWithMask(text: string, message: string = '已复制') {
    try {
      const textToCopy = maskApiKeys?.value ? maskSensitiveData(text) : text;
      await copyToClipboard(textToCopy, message);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }

  function copyRequestHeaders() {
    if (!record.value) return;
    const headers = Object.entries(record.value.request.headers).map(([key, value]) => `${key}: ${value}`).join('\n');
    copyWithMask(headers, '请求头已复制');
  }

  function copyRequestBody() {
    if (!record.value?.request.body) return;
    const body = formatJson(record.value.request.body);
    copyWithMask(body, '请求体已复制');
  }

  function copyResponseHeaders() {
    if (!record.value?.response) return;
    const headers = Object.entries(record.value.response.headers).map(([key, value]) => `${key}: ${value}`).join('\n');
    copyWithMask(headers, '响应头已复制');
  }

  function copyResponseBody() {
    if (!record.value) return;
    const body = streamProcessor.getDisplayResponseBody(record.value.id, record.value.response?.body, isStreamingResponse.value);
    copyWithMask(body, '响应体已复制');
  }

  function copyAll() {
    if (!record.value) return;

    let fullText = '=== 请求信息 ===\n';
    fullText += `方法: ${record.value.request.method}\n`;
    fullText += `URL: ${record.value.request.url}\n`;
    fullText += `时间: ${new Date(record.value.request.timestamp).toLocaleString()}\n\n`;

    fullText += '--- 请求头 ---\n';
    fullText += Object.entries(record.value.request.headers).map(([key, value]) => `${key}: ${value}`).join('\n');
    fullText += '\n\n';

    if (record.value.request.body) {
      fullText += '--- 请求体 ---\n';
      fullText += formatJson(record.value.request.body);
      fullText += '\n\n';
    }

    if (record.value.response || isStreamingActive.value) {
      fullText += '=== 响应信息 ===\n';
      if (record.value.response) {
        fullText += `状态码: ${record.value.response.status}\n`;
        fullText += `耗时: ${record.value.response.duration_ms}ms\n`;
        fullText += `大小: ${formatSize(record.value.response.response_size)}\n\n`;

        fullText += '--- 响应头 ---\n';
        fullText += Object.entries(record.value.response.headers).map(([key, value]) => `${key}: ${value}`).join('\n');
        fullText += '\n\n';
      }

      const responseBody = streamProcessor.getDisplayResponseBody(record.value.id, record.value.response?.body, isStreamingResponse.value);
      if (responseBody) {
        fullText += '--- 响应体 ---\n';
        fullText += responseBody;
      }
    }

    copyWithMask(fullText, '完整信息已复制');
  }

  // 监听记录变化
  watch(() => record.value?.id, (newId, oldId) => {
    if (newId !== oldId) {
      viewMode.value = 'raw';
    }
  });

  return {
    viewMode,
    isStreamingActive,
    isStreamingResponse,
    displayResponseBody,
    canShowTextMode,
    extractedContent,
    copyRequestHeaders,
    copyRequestBody,
    copyResponseHeaders,
    copyResponseBody,
    copyAll,
    // 从 utils.ts 导入
    formatSize,
    getStatusClass,
    isJson: (str: string) => str ? streamProcessor.getDisplayResponseBody(record.value?.id || '', str).startsWith('{') : false,
    formatJson,
  };
}