<template>
  <el-card shadow="never" :class="['info-card', { 'glass-card': appearanceSettings?.enableUiBlur, 'is-bare': bare }]">
      <template v-if="title" #header>
        <div class="card-header">
          <span>{{ title }}</span>
          <div>
            <slot name="headerExtra"></slot>
            <el-button v-if="content" :icon="CopyDocument" text circle @click="copyContent"></el-button>
          </div>
        </div>
      </template>
      <slot>
        <pre v-if="isCode && content" class="content-code"><code>{{ content }}</code></pre>
        <div v-else-if="content" class="content-text">{{ content }}</div>
      </slot>
    </el-card>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
import { ElCard, ElButton } from 'element-plus';
import { customMessage } from '@/utils/customMessage';
import { CopyDocument } from '@element-plus/icons-vue';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { createModuleLogger } from '@utils/logger';
import { useThemeAppearance } from '@/composables/useThemeAppearance';

// 创建日志实例
const logger = createModuleLogger('InfoCard');

const { appearanceSettings } = useThemeAppearance();

const props = defineProps({
  title: {
    type: String,
    required: false,
    default: '',
  },
  content: {
    type: String,
    required: false,
    default: '',
  },
  isCode: {
    type: Boolean,
    default: false,
  },
  bare: {
    type: Boolean,
    default: false,
  },
});

const { content, title, bare } = toRefs(props);

const copyContent = async () => {
  if (!content.value) return;
  try {
    await writeText(content.value);
    customMessage.success('已复制到剪贴板！');
  } catch (error) {
    logger.error('复制内容到剪贴板失败', error, {
      title: title.value,
      contentLength: content.value.length,
    });
    customMessage.error('复制失败');
  }
};
</script>

<style scoped>
.info-card {
  border: 1px solid var(--border-color);
  background-color: var(--card-bg); /* 使用卡片背景色 */
  color: var(--text-color); /* 确保文本颜色与主题一致 */
  display: flex;
  flex-direction: column;
  flex: 1; /* 让卡片本身在 flex 容器中可伸缩 */
  min-height: 0; /* 关键：允许 flex item 在内容溢出时正确缩小 */
}

.info-card:not(.is-bare) :deep(.el-card__body) {
  flex: 1; /* 让卡片内容区域占满剩余空间 */
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px; /* 恢复合理的内边距 */
}

:deep(.el-card__header) {
  padding: 10px 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  color: var(--text-color); /* 确保头部文本颜色与主题一致 */
}

.card-header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content-code {
  white-space: pre-wrap;
  word-wrap: break-word;
  background-color: var(--input-bg);
  color: var(--text-color); /* 确保代码文本颜色与主题一致 */
  padding: 10px;
  border-radius: 4px;
  font-family: monospace;
  overflow-y: auto;
  flex: 1; /* 占满卡片内容区域 */
  min-height: 0;
  margin: 0; /* 重置 pre 标签的默认 margin */
}

.content-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color); /* 确保普通文本颜色与主题一致 */
  overflow-y: auto;
  flex: 1; /* 占满卡片内容区域 */
  min-height: 0;
  margin: 0; /* 移除默认边距 */
}
</style>