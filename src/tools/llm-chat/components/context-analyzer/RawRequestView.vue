<template>
  <div class="raw-request-view">
    <DocumentViewer
      :content="formattedJson"
      :file-name="dynamicFileName"
      file-type-hint="application/json"
      editor-type="codemirror"
      show-engine-switch
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import type { ContextPreviewData } from "../../types/context";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const dynamicFileName = computed(() => {
  // 优先使用目标消息的时间戳，否则使用当前时间
  const now = props.contextData.targetTimestamp
    ? new Date(props.contextData.targetTimestamp)
    : new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
  return `原始 API 请求预览_${timestamp}.json`;
});

// 将上下文数据转换为 API 请求格式的 JSON
const formattedJson = computed(() => {
  // 过滤掉内部元数据，只保留发送给 LLM 的标准字段
  const cleanMessages = props.contextData.finalMessages.map(
    ({ role, content }: { role: string; content: any }) => ({
      role,
      content,
    })
  );

  // 过滤掉内部处理参数，只保留真正的 API 参数
  const internalParams = [
    "contextManagement",
    "contextPostProcessing",
    "contextCompression",
    "enabledParameters",
    "custom",
  ];

  const filteredParams = Object.entries(props.contextData.parameters || {}).reduce(
    (acc, [key, value]) => {
      if (!internalParams.includes(key)) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, any>
  );

  const requestBody: Record<string, any> = {
    model: props.contextData.agentInfo.modelId,
    ...filteredParams, // 展开显示过滤后的请求参数
    messages: cleanMessages,
  };

  // 注意：不再单独添加 system 字段
  // finalMessages 已经包含了所有处理后的消息（包括 system 角色）
  // 这是经过上下文后处理管道处理后的最终消息列表

  // 格式化为带缩进的 JSON
  return JSON.stringify(requestBody, null, 2);
});
</script>

<style scoped>
.raw-request-view {
  height: 100%;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
}
</style>
