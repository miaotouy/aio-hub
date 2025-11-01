<template>
  <div class="input-panel">
    <div class="panel-header">
      <span class="panel-title">输入文本</span>
      <div class="char-count">{{ inputText.length }} 字符</div>
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
interface Props {
  inputText: string;
}

interface Emits {
  (e: 'update:inputText', value: string): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;
  overflow: hidden;
  border-right: 1px solid var(--border-color);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.char-count {
  font-size: 12px;
  color: var(--text-color-light);
  background-color: var(--border-color-light);
  padding: 2px 8px;
  border-radius: 4px;
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.input-textarea {
  height: 100%;
}

.input-textarea :deep(.el-textarea__inner) {
  height: 100%;
  resize: none;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
}
</style>