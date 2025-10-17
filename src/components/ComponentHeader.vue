
<script setup lang="ts">
import { ref, computed } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('ComponentHeader');

interface Props {
  position?: 'top' | 'bottom' | 'left' | 'right';
  collapsible?: boolean;
  title?: string;
  dragMode?: 'window' | 'detach'; // 新增：拖拽模式
  showActions?: boolean; // 新增：是否显示操作按钮
}

interface Emits {
  (e: 'close'): void;
  (e: 'reattach'): void;
}

const props = withDefaults(defineProps<Props>(), {
  position: 'top',
  collapsible: true,
  title: '独立组件',
  dragMode: 'window', // 默认为窗口拖拽模式
  showActions: true // 默认显示操作按钮
});

const emit = defineEmits<Emits>();

const isCollapsed = ref(false);
const isHovered = ref(false);

// 根据位置计算样式类
const positionClasses = computed(() => {
  return {
    [`position-${props.position}`]: true,
    'collapsed': isCollapsed.value,
    'hovered': isHovered.value
  };
});

// 处理收起/展开
const toggleCollapse = () => {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value;
  }
};

// 处理重新附着到主窗口
const handleReattach = async () => {
  try {
    logger.info('请求重新附着到主窗口');
    const currentWindow = getCurrentWindow();
    const windowLabel = currentWindow.label;
    
    // 调用后端命令重新附着
    await invoke('reattach_component', { label: windowLabel });
    emit('reattach');
  } catch (error) {
    logger.error('重新附着失败', { error });
  }
};

// 处理关闭窗口
const handleClose = async () => {
  try {
    logger.info('请求关闭窗口');
    const currentWindow = getCurrentWindow();
    
    // 直接关闭窗口
    await currentWindow.close();
    emit('close');
  } catch (error) {
    logger.error('关闭窗口失败', { error });
  }
};
</script>

<template>
  <div 
    class="component-header" 
    :class="positionClasses"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- 拖拽区域 -->
    <div
      class="drag-handle"
      :class="{ 'is-window-drag': dragMode === 'window' }"
      :data-tauri-drag-region="dragMode === 'window' ? '' : undefined"
    >
      <slot name="drag-region">
        <div class="default-drag-handle">
          <span class="drag-icon">⋮⋮</span>
          <span v-if="!isCollapsed && dragMode === 'window'" class="component-title">{{ title }}</span>
        </div>
      </slot>
    </div>
    
    <!-- 操作按钮区域 -->
    <div v-if="showActions" class="actions" :class="{ 'collapsed': isCollapsed }">
      <!-- 收起/展开按钮 -->
      <button
        v-if="collapsible"
        @click="toggleCollapse"
        class="action-btn collapse-btn"
        :title="isCollapsed ? '展开' : '收起'"
      >
        <span v-if="isCollapsed">📌</span>
        <span v-else>📌</span>
      </button>
      
      <!-- 重新附着按钮 -->
      <button
        @click="handleReattach"
        class="action-btn reattach-btn"
        title="附着到主窗口"
      >
        ↩️
      </button>
      
      <!-- 关闭按钮 -->
      <button
        @click="handleClose"
        class="action-btn close-btn"
        title="关闭窗口"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.component-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(var(--sidebar-bg-rgb), 0.8);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-color);
  user-select: none;
  transition: all 0.2s ease;
  z-index: 1000;
}

/* 位置样式 */
.position-top {
  order: -1;
  border-bottom: 1px solid var(--border-color);
  border-radius: 8px 8px 0 0;
}

.position-bottom {
  order: 999;
  border-top: 1px solid var(--border-color);
  border-radius: 0 0 8px 8px;
}

.position-left {
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  border-radius: 8px 0 0 8px;
}

.position-right {
  flex-direction: column;
  border-left: 1px solid var(--border-color);
  border-radius: 0 8px 8px 0;
}

/* 拖拽区域 */
.drag-handle {
  display: flex;
  align-items: center;
  flex: 1;
  cursor: move;
  min-height: 24px;
}

.drag-handle.is-window-drag {
  /* 允许拖动窗口 */
  -webkit-app-region: drag;
}

.default-drag-handle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drag-icon {
  font-size: 12px;
  color: var(--text-color-light);
  opacity: 0.7;
}

.component-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* 操作按钮区域 */
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  /* 禁止拖动，以便点击按钮 */
  -webkit-app-region: no-drag;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  transition: background 0.2s;
}

.btn-toggle:hover {
  background: rgba(0, 0, 0, 0.1);
}

.theme-dark .btn-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}

.action-buttons {
  display: flex;
  gap: 2px;
  align-items: center;
}

.btn-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-action:hover {
  background: rgba(0, 0, 0, 0.1);
}

.theme-dark .btn-action:hover {
  background: rgba(255, 255, 255, 0.1);
}

.btn-reattach:hover {
  color: var(--primary-color);
}

.btn-close:hover {
  color: var(--error-color);
  background: rgba(239, 68, 68, 0.1);
}

/* 操作按钮样式 */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  font-size: 14px;
  /* 禁止拖动，以便点击按钮 */
  -webkit-app-region: no-drag;
}

.collapse-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.reattach-btn:hover {
  background: rgba(var(--success-color-rgb), 0.1);
  color: var(--success-color);
}

.close-btn:hover {
  background: rgba(var(--error-color-rgb), 0.1);
  color: var(--error-color);
}

/* 收起状态样式 */
.collapsed .actions {
  gap: 2px;
}

.collapsed .component-title {
  display: none;
}

.collapsed .drag-handle {
  min-width: 28px;
  justify-content: center;
}

/* 悬停状态样式 */
.hovered {
  background: rgba(var(--sidebar-bg-rgb), 0.95);
}

/* 动画 */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.component-header {
  animation: slideIn 0.2s ease-out;
}
</style>
