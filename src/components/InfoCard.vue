<template>
  <el-card v-if="content" shadow="never" class="info-card">
    <template #header>
      <div class="card-header">
        <span>{{ title }}</span>
        <el-button :icon="CopyDocument" text circle @click="copyContent"></el-button>
      </div>
    </template>
    <pre v-if="isCode" class="content-code"><code>{{ content }}</code></pre>
    <div v-else class="content-text">{{ content }}</div>
  </el-card>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
import { ElCard, ElButton, ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  isCode: {
    type: Boolean,
    default: false,
  },
});

const { content } = toRefs(props);

const copyContent = async () => {
  if (!content.value) return;
  try {
    await writeText(content.value);
    ElMessage.success('已复制到剪贴板！');
  } catch (error) {
    console.error('Failed to copy:', error);
    ElMessage.error('复制失败');
  }
};
</script>

<style scoped>
.info-card {
  border: 1px solid var(--border-color);
  background-color: var(--card-bg); /* 使用卡片背景色 */
  color: var(--text-color); /* 确保文本颜色与主题一致 */
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  color: var(--text-color); /* 确保头部文本颜色与主题一致 */
}

.content-code {
  white-space: pre-wrap;
  word-wrap: break-word;
  background-color: var(--input-bg);
  color: var(--text-color); /* 确保代码文本颜色与主题一致 */
  padding: 10px;
  border-radius: 4px;
  font-family: monospace;
  max-height: 400px;
  overflow-y: auto;
}

.content-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color); /* 确保普通文本颜色与主题一致 */
}
</style>