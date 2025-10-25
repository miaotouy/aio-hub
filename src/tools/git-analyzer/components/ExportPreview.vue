<template>
  <div class="preview-section">
    <div class="preview-header">
      <span>内容预览</span>
      <el-tag v-if="loadingFiles" type="warning" size="small" style="margin-left: 10px">
        正在加载文件信息...
      </el-tag>
      <el-button-group>
        <el-button size="small" @click="$emit('refresh')" :icon="RefreshRight" :loading="generating">
          刷新预览
        </el-button>
        <el-button size="small" @click="$emit('copy')" :icon="CopyDocument"> 复制 </el-button>
        <el-button size="small" @click="$emit('download')" :icon="Download"> 下载 </el-button>
      </el-button-group>
    </div>
    <div class="preview-content" v-loading="generating">
      <el-scrollbar>
        <pre v-if="format !== 'html'" class="preview-text">{{ content }}</pre>
        <div v-else v-html="content" class="preview-html"></div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CopyDocument, Download, RefreshRight } from '@element-plus/icons-vue'

defineProps<{
  content: string
  format: string
  generating: boolean
  loadingFiles: boolean
}>()

defineEmits<{
  refresh: []
  copy: []
  download: []
}>()
</script>

<style scoped>
.preview-section {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* 重要：允许 flex 子元素收缩 */
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color-light);
  font-weight: 500;
  flex-shrink: 0; /* 防止头部收缩 */
}

.preview-content {
  background: var(--container-bg);
  flex: 1;
  min-height: 0; /* 重要：允许 flex 子元素收缩 */
  display: flex;
  flex-direction: column;
}

/* el-scrollbar 需要占满父容器 */
.preview-content :deep(.el-scrollbar) {
  flex: 1;
  min-height: 0;
}

.preview-text {
  padding: 16px;
  margin: 0;
  font-family:
    'SF Mono',
    Monaco,
    'Cascadia Code',
    'Roboto Mono',
    Consolas,
    'Courier New',
    monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
}

.preview-html {
  padding: 16px;
}

/* 覆盖 HTML 预览中的样式 */
.preview-html :deep(h1),
.preview-html :deep(h2),
.preview-html :deep(h3) {
  margin-top: 0;
}

.preview-html :deep(table) {
  margin: 10px 0;
}
</style>