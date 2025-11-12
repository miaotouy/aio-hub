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
import { computed } from 'vue';
import DocumentViewer from '@/components/common/DocumentViewer.vue';
import type { ContextPreviewData } from '../../composables/useChatHandler';

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const dynamicFileName = computed(() => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `原始 API 请求预览_${timestamp}.json`;
});

// 将上下文数据转换为 API 请求格式的 JSON
const formattedJson = computed(() => {
  const requestBody: Record<string, any> = {
    model: props.contextData.agentInfo.modelId,
    messages: props.contextData.finalMessages,
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