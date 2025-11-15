<template>
  <div class="llm-think-node" :class="{ 'is-collapsed': isCollapsed }">
    <div class="llm-think-header" @click="toggleCollapse">
      <div class="llm-think-title">
        <span class="llm-think-icon">{{ isCollapsed ? '▶' : '▼' }}</span>
        <span class="llm-think-label">{{ props.displayName }}</span>
      </div>
      <div class="llm-think-meta">
        <span class="llm-think-tag">{{ props.rawTagName }}</span>
      </div>
    </div>
    <div v-show="!isCollapsed" class="llm-think-content">
      <!-- 使用默认插槽渲染内部 AST，由 AstNodeRenderer 递归提供 -->
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Props {
  rawTagName: string;
  ruleId: string;
  displayName: string;
  collapsedByDefault: boolean;
}

const props = defineProps<Props>();

const isCollapsed = ref(props.collapsedByDefault);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
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
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: rgba(100, 181, 246, 0.05);
  transition: background 0.2s ease;
}

.llm-think-header:hover {
  background: rgba(100, 181, 246, 0.1);
}

.llm-think-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--el-text-color-primary);
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

.llm-think-meta {
  display: flex;
  align-items: center;
  gap: 6px;
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

.llm-think-content {
  padding: 14px;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
  animation: slideDown 0.2s ease;
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
  
  .llm-think-header:hover {
    background: rgba(100, 181, 246, 0.08);
  }
}
</style>