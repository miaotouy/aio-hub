<template>
  <div class="section url-section">
    <div class="url-builder">
      <select v-model="currentMethod" class="method-selector">
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="DELETE">DELETE</option>
        <option value="PATCH">PATCH</option>
      </select>
      
      <div class="url-input-wrapper">
        <div
          ref="urlInput"
          class="url-input"
          contenteditable="true"
          spellcheck="false"
          @input="handleUrlInput"
          @paste="handlePaste"
        ></div>
        <div class="url-preview">{{ store.buildUrl }}</div>
      </div>
      
      <button @click="copyUrl" class="btn-icon" title="复制完整 URL">
        📋
      </button>
      
      <button
        v-if="!isLoading"
        @click="$emit('send')"
        class="btn-send"
        title="发送请求"
      >
        🚀 发送
      </button>
      <button
        v-else
        @click="handleAbort"
        class="btn-abort"
        title="中止请求"
      >
        ⏹️ 中止
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useApiTesterStore } from '../store';
import { createModuleLogger } from '@utils/logger';

defineProps<{
  isLoading?: boolean;
}>();

defineEmits<{
  send: [];
}>();

const store = useApiTesterStore();
const urlInput = ref<HTMLDivElement | null>(null);

// 日志实例
const logger = createModuleLogger('api-tester/UrlBuilder');

// HTTP 方法（独立管理，不依赖预设）
const currentMethod = computed({
  get: () => store.selectedPreset?.method || 'POST',
  set: (value) => {
    if (store.selectedPreset) {
      store.selectedPreset.method = value as any;
    }
  },
});

// 高亮 URL 中的变量
function highlightUrl(text: string): string {
  // 匹配 {{variable}} 格式
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return `<span class="url-variable" data-var="${varName}">${match}</span>`;
  });
}

// 处理输入
function handleUrlInput(event: Event) {
  const target = event.target as HTMLDivElement;
  const text = target.innerText || '';
  
  // 保存光标位置
  const selection = window.getSelection();
  const range = selection?.getRangeAt(0);
  const cursorOffset = range?.startOffset || 0;
  
  // 更新 store
  store.updateUrlTemplate(text);
  
  // 重新渲染高亮
  renderHighlightedUrl();
  
  // 恢复光标位置
  nextTick(() => {
    restoreCursor(cursorOffset);
  });
}

// 处理粘贴
function handlePaste(event: ClipboardEvent) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';
  document.execCommand('insertText', false, text);
}

// 渲染高亮后的 URL
function renderHighlightedUrl() {
  if (!urlInput.value) return;
  
  const text = store.urlTemplate;
  const highlighted = highlightUrl(text);
  
  // 只在内容真正改变时更新
  if (urlInput.value.innerHTML !== highlighted) {
    urlInput.value.innerHTML = highlighted;
  }
}

// 恢复光标位置
function restoreCursor(offset: number) {
  if (!urlInput.value) return;
  
  const selection = window.getSelection();
  const range = document.createRange();
  const textNode = urlInput.value.firstChild;
  
  try {
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const maxOffset = Math.min(offset, (textNode as Text).length);
      range.setStart(textNode, maxOffset);
      range.setEnd(textNode, maxOffset);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  } catch (e) {
    logger.warn('恢复光标位置失败', { error: e, offset, hasTextNode: !!textNode });
  }
}

// 复制 URL
function copyUrl() {
  const url = store.buildUrl;
  navigator.clipboard.writeText(url).then(() => {
    alert('URL 已复制到剪贴板');
  });
}

// 中止请求
function handleAbort() {
  store.abortRequest();
}

// 监听 urlTemplate 变化
watch(() => store.urlTemplate, () => {
  renderHighlightedUrl();
});

// 初始化
onMounted(() => {
  renderHighlightedUrl();
});
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
}

.section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: var(--text-color);
}

.url-builder {
  display: flex;
  align-items: stretch;
  gap: 8px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.method-selector {
  padding: 10px 15px;
  font-weight: bold;
  font-size: 14px;
  border: none;
  border-right: 1px solid var(--border-color);
  background: var(--container-bg);
  cursor: pointer;
  color: var(--text-color);
}

.method-selector:focus {
  outline: none;
  background: var(--input-bg);
}

.url-input-wrapper {
  flex: 1;
  position: relative;
  min-height: 40px;
}

.url-input {
  width: 100%;
  min-height: 20px;
  padding: 10px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.5;
  border: none;
  outline: none;
  white-space: nowrap;
  overflow-x: auto;
  color: var(--text-color);
  background: transparent;
}

.url-input:empty::before {
  content: '输入 URL 模板，例如: {{protocol}}://{{baseUrl}}/{{endpoint}}';
  color: var(--text-color-light);
  pointer-events: none;
}

/* 变量高亮样式 */
.url-input :deep(.url-variable) {
  background: rgba(64, 158, 255, 0.15);
  color: var(--primary-color);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.url-input :deep(.url-variable:hover) {
  background: rgba(64, 158, 255, 0.25);
}

.url-preview {
  position: absolute;
  bottom: -20px;
  left: 10px;
  right: 10px;
  font-size: 11px;
  color: var(--text-color-light);
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.url-preview::before {
  content: '➜ ';
  color: var(--primary-color);
}

.btn-icon {
  background: transparent;
  padding: 10px 12px;
  font-size: 18px;
  border: none;
  border-left: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--text-color);
}

.btn-icon:hover {
  background: var(--border-color);
}

.btn-send {
  padding: 10px 24px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-left: 1px solid var(--border-color);
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-send:hover:not(:disabled) {
  background: var(--primary-hover-color);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(64, 158, 255, 0.3);
}

.btn-send:disabled {
  background: var(--border-color);
  color: var(--text-color-light);
  cursor: not-allowed;
  transform: none;
}

.btn-abort {
  padding: 10px 24px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-left: 1px solid var(--border-color);
  background: var(--error-color);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-abort:hover {
  background: #c82333;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(245, 108, 108, 0.3);
}
</style>