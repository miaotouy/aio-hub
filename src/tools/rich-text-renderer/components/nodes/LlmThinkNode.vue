<template>
  <div class="llm-think-node" :class="{ 'is-collapsed': isCollapsed }">
    <div class="llm-think-header">
      <div class="llm-think-title" @click="toggleCollapse">
        <span class="llm-think-icon">{{ isCollapsed ? '▶' : '▼' }}</span>
        <span class="llm-think-label">{{ props.displayName }}</span>
        <span class="llm-think-tag">{{ props.rawTagName }}</span>
      </div>
      <div class="header-actions">
        <!-- 切换渲染/原始视图 -->
        <el-tooltip :content="showRaw ? '显示渲染内容' : '显示原始文本'" :show-after="300">
          <button
            class="action-btn"
            :class="{ 'action-btn-active': showRaw }"
            @click="toggleRawView"
          >
            <Code2 :size="14" />
          </button>
        </el-tooltip>

        <!-- 复制按钮 -->
        <el-tooltip :content="copied ? '已复制' : '复制内容'" :show-after="300">
          <button class="action-btn" :class="{ 'action-btn-active': copied }" @click="copyContent">
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>
    <div v-show="!isCollapsed" class="llm-think-content">
      <!-- 原始文本视图 -->
      <pre v-if="showRaw" class="raw-content">{{ props.rawContent }}</pre>
      <!-- 渲染内容视图 -->
      <div v-else class="rendered-content">
        <!-- 使用默认插槽渲染内部 AST，由 AstNodeRenderer 递归提供 -->
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Copy, Check, Code2 } from 'lucide-vue-next';
import { customMessage } from '@/utils/customMessage';

interface Props {
  rawTagName: string;
  ruleId: string;
  displayName: string;
  collapsedByDefault: boolean;
  rawContent?: string; // 原始文本内容
}

const props = defineProps<Props>();

const isCollapsed = ref(props.collapsedByDefault);
const showRaw = ref(false);
const copied = ref(false);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

const toggleRawView = () => {
  showRaw.value = !showRaw.value;
};

const copyContent = async () => {
  try {
    const textToCopy = showRaw.value ? (props.rawContent || '') : props.rawContent || '';
    await navigator.clipboard.writeText(textToCopy);
    copied.value = true;
    customMessage.success('内容已复制');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('[LlmThinkNode] 复制失败:', error);
    customMessage.error('复制失败');
  }
};

onMounted(() => {
  isCollapsed.value = props.collapsedByDefault;
});
</script>

<style scoped>
.llm-think-node {
  margin: 12px 0;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  background: var(--card-bg, rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(var(--ui-blur, 8px));
  overflow: hidden;
  transition: all 0.2s ease;
}

.llm-think-node:hover {
  border-color: var(--el-color-primary, #409eff);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.llm-think-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  user-select: none;
  background: rgba(100, 181, 246, 0.05);
  transition: background 0.2s ease;
}

.llm-think-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  cursor: pointer;
  flex: 1;
}

.llm-think-icon {
  font-size: 12px;
  color: var(--el-color-primary, #409eff);
  transition: transform 0.2s ease;
}

.is-collapsed .llm-think-icon {
  transform: rotate(0deg);
}

.llm-think-label {
  font-size: 14px;
}

.llm-think-tag {
  padding: 2px 8px;
  font-size: 11px;
  font-family: 'Monaco', 'Consolas', monospace;
  color: var(--el-color-primary-light-3);
  background: rgba(100, 181, 246, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(100, 181, 246, 0.2);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.action-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: var(--el-color-primary);
  color: white;
}

.action-btn-active::before {
  display: none;
}

.action-btn-active:hover:not(:disabled) {
  background-color: var(--el-color-primary-light-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.llm-think-content {
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
  animation: slideDown 0.2s ease;
}

.rendered-content {
  padding: 14px;
}

.raw-content {
  margin: 0;
  padding: 14px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  background: var(--code-block-bg, var(--container-bg));
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 深色模式优化 */
@media (prefers-color-scheme: dark) {
  .llm-think-node {
    background: rgba(255, 255, 255, 0.02);
  }
  
  .llm-think-header {
    background: rgba(100, 181, 246, 0.03);
  }
}
</style>