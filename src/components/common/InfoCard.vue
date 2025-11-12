<template>
  <el-card
    shadow="never"
    :class="['info-card', { 'glass-card': appearanceSettings?.enableUiBlur, 'is-bare': bare }]"
  >
    <template #header>
      <slot name="header">
        <!-- 如果有 title prop，显示默认的 header -->
        <div v-if="title" class="card-header">
          <span>{{ title }}</span>
          <div>
            <slot name="headerExtra"></slot>
            <el-button
              v-if="content"
              :icon="CopyDocument"
              text
              circle
              @click="copyContent"
            ></el-button>
          </div>
        </div>
        <!-- bare 模式且没有 title 时，将默认插槽内容渲染到 header -->
        <slot v-else-if="bare"></slot>
      </slot>
    </template>
    <!-- 非 bare 模式下，正常渲染 body -->
    <template v-if="!bare">
      <slot>
        <pre v-if="isCode && content" class="content-code"><code>{{ content }}</code></pre>
        <div v-else-if="content" class="content-text">{{ content }}</div>
      </slot>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { toRefs } from "vue";
import { ElCard, ElButton } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { CopyDocument } from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createModuleLogger } from "@utils/logger";
import { useThemeAppearance } from "@/composables/useThemeAppearance";

// 创建日志实例
const logger = createModuleLogger("InfoCard");

const { appearanceSettings } = useThemeAppearance();

const props = defineProps({
  title: {
    type: String,
    required: false,
    default: "",
  },
  content: {
    type: String,
    required: false,
    default: "",
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
    customMessage.success("已复制到剪贴板！");
  } catch (error) {
    logger.error("复制内容到剪贴板失败", error, {
      title: title.value,
      contentLength: content.value.length,
    });
    customMessage.error("复制失败");
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
  /* 移除了 flex: 1 和 height: 100%，让卡片根据内容自适应高度 */
}

/* 毛玻璃效果 */
.info-card.glass-card {
  backdrop-filter: blur(var(--ui-blur));
}

/* bare 模式：仅显示头部 */
.info-card.is-bare :deep(.el-card__body) {
  display: none;
}

/* 非 bare 模式：body 正常显示 */
.info-card:not(.is-bare) :deep(.el-card__body) {
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
