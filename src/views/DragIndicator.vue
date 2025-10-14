<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, type Component } from 'vue';
import { useTheme } from '../composables/useTheme';
import { listen } from '@tauri-apps/api/event';
import { toolsConfig } from '../config/tools';

const { currentTheme } = useTheme();
const canDetach = ref(false); // 从事件中获取状态
const toolName = ref('工具');
let unlistenUpdate: (() => void) | null = null;
let unlistenStatus: (() => void) | null = null;

// 根据工具名称获取图标
const toolIcon = computed<Component | string>(() => {
  const tool = toolsConfig.find(t => t.name === toolName.value);
  return tool?.icon || '📦';
});

// 动态提示文本
const hintText = computed(() => {
  return canDetach.value ? '✓ 释放以创建窗口' : '✗ 继续拖动或取消';
});

// 动态样式类
const indicatorClass = computed(() => {
  return canDetach.value ? 'can-detach' : 'cannot-detach';
});

onMounted(async () => {
  // 监听来自后端的事件以更新工具名称
  unlistenUpdate = await listen<{ tool_name: string }>('update-drag-indicator', (event) => {
    toolName.value = event.payload.tool_name || '工具';
  });

  // 监听拖拽状态
  unlistenStatus = await listen<{ canDetach: boolean }>('update-drag-status', (event) => {
    canDetach.value = event.payload.canDetach;
  });
});

onUnmounted(() => {
  // 组件卸载时清理监听器
  if (unlistenUpdate) {
    unlistenUpdate();
  }
  if (unlistenStatus) {
    unlistenStatus();
  }
});
</script>

<template>
  <div class="drag-indicator-container" :class="`theme-${currentTheme}`">
    <div class="drag-indicator" :class="indicatorClass">
      <!-- 图标 -->
      <div class="icon-wrapper">
        <el-icon v-if="typeof toolIcon !== 'string'" class="tool-icon" :size="20">
          <component :is="toolIcon" />
        </el-icon>
        <span v-else class="emoji-icon">{{ toolIcon }}</span>
      </div>
      
      <!-- 工具名称 -->
      <div class="tool-name">{{ toolName }}</div>
      
      <!-- 状态指示 -->
      <div class="status-indicator">
        <span class="hint">{{ hintText }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 确保容器完全透明 */
.drag-indicator-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  overflow: hidden;
  pointer-events: none; /* 让鼠标事件穿透容器 */
}

/* 横向布局的指示器 */
.drag-indicator {
  background: var(--card-bg);
  border: 2px solid var(--primary-color);
  border-radius: 8px;
  padding: 10px 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: row; /* 横向布局 */
  align-items: center;
  gap: 12px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  pointer-events: auto; /* 指示器本身可以接收鼠标事件 */
  min-width: 200px;
}

/* 可以分离状态 - 绿色 */
.drag-indicator.can-detach {
  border-color: var(--success-color);
  animation: successPulse 1.5s ease-in-out infinite;
}

/* 不可分离状态 - 警告色 */
.drag-indicator.cannot-detach {
  border-color: var(--warning-color);
  animation: warningPulse 1.5s ease-in-out infinite;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-icon {
  color: var(--primary-color);
  transition: color 0.3s ease;
}

.drag-indicator.can-detach .tool-icon {
  color: var(--success-color);
}

.drag-indicator.cannot-detach .tool-icon {
  color: var(--warning-color);
}

.emoji-icon {
  font-size: 20px;
  line-height: 1;
}

.tool-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  margin-left: auto; /* 推到右侧 */
}

.hint {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.drag-indicator.can-detach .hint {
  color: var(--success-color);
  background: rgba(103, 194, 58, 0.15);
}

.drag-indicator.cannot-detach .hint {
  color: var(--warning-color);
  background: rgba(230, 162, 60, 0.15);
}

/* 成功状态动画 */
@keyframes successPulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  50% {
    transform: scale(1.02);
    box-shadow: 0 12px 32px rgba(103, 194, 58, 0.3);
  }
}

/* 警告状态动画 */
@keyframes warningPulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  50% {
    transform: scale(1.02);
    box-shadow: 0 12px 32px rgba(230, 162, 60, 0.3);
  }
}
</style>