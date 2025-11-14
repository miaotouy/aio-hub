<template>
  <div ref="rootEl" class="input-panel">
    <div class="panel-header">
      <span class="panel-title">输入文本</span>
      <el-tag type="info" size="small" effect="plain">{{ inputText.length }} 字符</el-tag>
    </div>
    <div class="panel-content">
      <el-input
        :model-value="inputText"
        @update:model-value="$emit('update:inputText', $event)"
        type="textarea"
        placeholder="请输入或粘贴要计算 Token 的文本..."
        class="input-textarea"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  inputText: string;
}

interface Emits {
  (e: 'update:inputText', value: string): void;
}

defineProps<Props>();
defineEmits<Emits>();

// 暴露根元素引用
const rootEl = ref<HTMLElement | null>(null);
defineExpose({ rootEl });
</script>

<style scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: transparent;
  flex-shrink: 0;
  box-sizing: border-box;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}


.panel-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  margin-top: -20px;
  box-sizing: border-box;
}

.input-textarea {
  height: 100%;
  box-sizing: border-box;
}

.input-textarea :deep(.el-textarea__inner) {
  height: 100%;
  resize: none;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  box-sizing: border-box;
}
</style>