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

import { ref, computed, watch, toRefs } from "vue";
import { useInspectorStreamStore } from "../stores/inspectorStreamStore";
import {
  copyToClipboard,
  maskSensitiveData,
  formatJson,
  formatSize,
  getStatusClass,
} from "../core/utils";
import type { CombinedRecord, ViewMode } from "../types";

export function useRecordDetail(props: {
  record: CombinedRecord | null;
  maskApiKeys?: boolean;
}) {
  const { record, maskApiKeys } = toRefs(props);
  const streamStore = useInspectorStreamStore();

  const viewMode = ref<ViewMode>("raw");

  // 计算属性
  const isStreamingActive = computed(() => {
    return record.value
      ? streamStore.isStreamingRecord(record.value.id)
      : false;
  });

  const isStreamingResponse = computed(() => {
    if (isStreamingActive.value) return true;
    if (!record.value?.response?.headers) return false;
    const contentType =
      record.value.response.headers["content-type"] ||
      record.value.response.headers["Content-Type"] ||
      "";
    return contentType.includes("text/event-stream");
  });

  /**
   * 性能关键：避免对全局 streamBuffer 的"无辜订阅"。
   *
   * 背景：streamStore.streamBuffer 是 shallowRef，任何一个请求的流式更新
   * 都会改变它的引用。如果一个静态的、已结束的记录的 computed 也依赖了
   * streamBuffer，那么后台其他请求的流式更新会强制它重新计算，造成大量
   * 不必要的 CPU 消耗（尤其是大文本的格式化 / 解析）。
   *
   * 解决：通过分支隔离——当记录不在活跃流中时，直接走静态分支并只读
   * record.response.body，**完全不访问** streamStore.streamBuffer，
   * Vue 的惰性依赖收集会自动让它从 streamBuffer 的订阅中"脱离"。
   */

  const displayResponseBody = computed(() => {
    if (!record.value) return "";
    const recordId = record.value.id;
    const responseBody = record.value.response?.body;

    // 静态记录分支：不订阅 streamBuffer，避免被其他流式请求的更新连带触发
    if (!streamStore.isStreamingRecord(recordId)) {
      if (!responseBody) return "";
      return streamStore.getDisplayResponseBody(
        recordId,
        responseBody,
        isStreamingResponse.value
      );
    }

    // 活跃流分支：正常订阅 streamBuffer
    return streamStore.getDisplayResponseBody(
      recordId,
      responseBody,
      isStreamingResponse.value
    );
  });

  const canShowTextMode = computed(() => {
    if (!record.value) return false;
    const recordId = record.value.id;
    const responseBody = record.value.response?.body;

    // 静态记录分支
    if (!streamStore.isStreamingRecord(recordId)) {
      if (!responseBody) return false;
      return streamStore.canShowTextMode(recordId, responseBody);
    }

    return streamStore.canShowTextMode(recordId, responseBody);
  });

  const extractedContent = computed(() => {
    if (!record.value) return "";
    const recordId = record.value.id;
    const responseBody = record.value.response?.body;
    const requestUrl = record.value.request.url;

    // 静态记录分支：不订阅 streamBuffer
    if (!streamStore.isStreamingRecord(recordId)) {
      if (!responseBody) return "";
      return streamStore.extractContent(
        recordId,
        responseBody,
        isStreamingResponse.value,
        requestUrl
      );
    }

    return streamStore.extractContent(
      recordId,
      responseBody,
      isStreamingResponse.value,
      requestUrl
    );
  });

  const extractedReasoning = computed(() => {
    if (!record.value) return "";
    const recordId = record.value.id;
    const responseBody = record.value.response?.body;
    const requestUrl = record.value.request.url;

    // 静态记录分支：不订阅 streamBuffer
    if (!streamStore.isStreamingRecord(recordId)) {
      if (!responseBody) return "";
      return streamStore.extractReasoning(
        recordId,
        responseBody,
        isStreamingResponse.value,
        requestUrl
      );
    }

    return streamStore.extractReasoning(
      recordId,
      responseBody,
      isStreamingResponse.value,
      requestUrl
    );
  });

  // 复制功能
  async function copyWithMask(text: string, message: string = "已复制") {
    try {
      const textToCopy = maskApiKeys?.value ? maskSensitiveData(text) : text;
      await copyToClipboard(textToCopy, message);
    } catch (err) {
      console.error("复制失败:", err);
    }
  }

  function copyRequestHeaders() {
    if (!record.value) return;
    const headers = Object.entries(record.value.request.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    copyWithMask(headers, "请求头已复制");
  }

  function copyRequestBody() {
    if (!record.value?.request.body) return;
    const body = formatJson(record.value.request.body);
    copyWithMask(body, "请求体已复制");
  }

  function copyResponseHeaders() {
    if (!record.value?.response) return;
    const headers = Object.entries(record.value.response.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    copyWithMask(headers, "响应头已复制");
  }

  function copyResponseBody() {
    if (!record.value) return;
    const body = streamStore.getDisplayResponseBody(
      record.value.id,
      record.value.response?.body,
      isStreamingResponse.value
    );
    copyWithMask(body, "响应体已复制");
  }

  function copyAll() {
    if (!record.value) return;

    let fullText = "=== 请求信息 ===\n";
    fullText += `方法: ${record.value.request.method}\n`;
    fullText += `URL: ${record.value.request.url}\n`;
    fullText += `时间: ${new Date(record.value.request.timestamp).toLocaleString()}\n\n`;

    fullText += "--- 请求头 ---\n";
    fullText += Object.entries(record.value.request.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    fullText += "\n\n";

    if (record.value.request.body) {
      fullText += "--- 请求体 ---\n";
      fullText += formatJson(record.value.request.body);
      fullText += "\n\n";
    }

    if (record.value.response || isStreamingActive.value) {
      fullText += "=== 响应信息 ===\n";
      if (record.value.response) {
        fullText += `状态码: ${record.value.response.status}\n`;
        fullText += `耗时: ${record.value.response.duration_ms}ms\n`;
        fullText += `大小: ${formatSize(record.value.response.response_size)}\n\n`;

        fullText += "--- 响应头 ---\n";
        fullText += Object.entries(record.value.response.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n");
        fullText += "\n\n";
      }

      const responseBody = streamStore.getDisplayResponseBody(
        record.value.id,
        record.value.response?.body,
        isStreamingResponse.value
      );
      if (responseBody) {
        fullText += "--- 响应体 ---\n";
        fullText += responseBody;
      }
    }

    copyWithMask(fullText, "完整信息已复制");
  }

  // 监听记录变化
  watch(
    () => record.value?.id,
    (newId, oldId) => {
      if (newId !== oldId) {
        viewMode.value = "raw";
      }
    }
  );

  return {
    viewMode,
    isStreamingActive,
    isStreamingResponse,
    displayResponseBody,
    canShowTextMode,
    extractedContent,
    extractedReasoning,
    copyRequestHeaders,
    copyRequestBody,
    copyResponseHeaders,
    copyResponseBody,
    copyAll,
    // 从 utils.ts 导入
    formatSize,
    getStatusClass,
    isJson: (str: string) =>
      str
        ? streamStore
            .getDisplayResponseBody(record.value?.id || "", str)
            .startsWith("{")
        : false,
    formatJson,
  };
}
