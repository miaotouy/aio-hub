<template>
  <div class="raw-request-view">
    <div class="view-header">
      <el-alert
        title="原始 API 请求预览"
        type="info"
        :closable="false"
        show-icon
      >
        <template #default>
          以下是将发送给 LLM API 的完整请求体（JSON 格式）。此预览仅用于调试，实际请求可能包含额外的参数。
        </template>
      </el-alert>
    </div>

    <div class="editor-container">
      <RichCodeEditor
        v-model="formattedJson"
        language="json"
        :read-only="true"
        :line-numbers="true"
        editor-type="codemirror"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';
import type { ContextPreviewData } from '../../composables/useChatHandler';

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

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
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 16px;
  box-sizing: border-box;
}

.view-header {
  flex-shrink: 0;
}

.editor-container {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

</style>