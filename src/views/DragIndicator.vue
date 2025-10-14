<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, type Component } from 'vue';
import { useTheme } from '../composables/useTheme';
import { listen } from '@tauri-apps/api/event';
import { toolsConfig } from '../config/tools';

const { currentTheme } = useTheme();
const canDetach = ref(false); // 从事件中获取状态
const toolName = ref('工具');
let unlistenUpdate: (() => void) | null = null;
let unlistenSession: (() => void) | null = null;

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
  // 监听来自后端的事件以更新工具名称（保留兼容旧事件）
  unlistenUpdate = await listen<{ tool_name: string }>('update-drag-indicator', (event) => {
    toolName.value = event.payload.tool_name || '工具';
  });

  // 监听新的拖拽会话更新事件
  unlistenSession = await listen<{ can_detach: boolean; tool_name: string }>('drag-session-update', (event) => {
    canDetach.value = event.payload.can_detach;
    if (event.payload.tool_name) {
      toolName.value = event.payload.tool_name;
    }
  });
});

onUnmounted(() => {
  // 组件卸载时清理监听器
  if (unlistenUpdate) {
    unlistenUpdate();
  }
  if (unlistenSession) {
    unlistenSession();
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
  background: color-mix(in srgb, var(--card-bg) 85%, transparent);
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 18px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1),
              0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: row; /* 横向布局 */
  align-items: center;
  gap: 12px;
  backdrop-filter: blur(12px) saturate(180%);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto; /* 指示器本身可以接收鼠标事件 */
  min-width: 200px;
  position: relative;
  overflow: hidden;
}

/* 可以分离状态 - 优雅的成功提示 */
.drag-indicator.can-detach {
  border-color: var(--success-color);
  box-shadow: 0 4px 20px color-mix(in srgb, var(--success-color) 20%, transparent),
              0 2px 10px color-mix(in srgb, var(--success-color) 15%, transparent),
              0 0 0 1px color-mix(in srgb, var(--success-color) 10%, transparent);
  animation: gentleGlow 2s ease-in-out infinite, floatUp 3s ease-in-out infinite;
}

/* 不可分离状态 - 柔和的警告提示 */
.drag-indicator.cannot-detach {
  border-color: var(--warning-color);
  box-shadow: 0 4px 20px color-mix(in srgb, var(--warning-color) 15%, transparent),
              0 2px 10px color-mix(in srgb, var(--warning-color) 10%, transparent);
  animation: subtlePulse 2s ease-in-out infinite;
}

/* 内部光晕效果 */
.drag-indicator.can-detach::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--success-color) 8%, transparent) 0%,
    transparent 70%
  );
  opacity: 0;
  animation: innerGlow 2s ease-in-out infinite;
  pointer-events: none;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drag-indicator.can-detach .icon-wrapper {
  animation: iconBounce 2s ease-in-out infinite;
}

.tool-icon {
  color: var(--text-color);
  transition: color 0.3s ease, filter 0.3s ease;
}

.drag-indicator.can-detach .tool-icon {
  color: var(--success-color);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--success-color) 30%, transparent));
}

.drag-indicator.cannot-detach .tool-icon {
  color: var(--warning-color);
}

.emoji-icon {
  font-size: 20px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.tool-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

.status-indicator {
  display: flex;
  align-items: center;
  margin-left: auto; /* 推到右侧 */
}

.hint {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  padding: 5px 12px;
  border-radius: 6px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.drag-indicator.can-detach .hint {
  color: var(--success-color);
  background: color-mix(in srgb, var(--success-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--success-color) 25%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--success-color) 15%, transparent);
}

.drag-indicator.cannot-detach .hint {
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning-color) 20%, transparent);
}

/* 柔和的光晕动画 - 用于成功状态 */
@keyframes gentleGlow {
  0%, 100% {
    box-shadow: 0 4px 20px color-mix(in srgb, var(--success-color) 20%, transparent),
                0 2px 10px color-mix(in srgb, var(--success-color) 15%, transparent),
                0 0 0 1px color-mix(in srgb, var(--success-color) 10%, transparent);
  }
  50% {
    box-shadow: 0 6px 28px color-mix(in srgb, var(--success-color) 30%, transparent),
                0 3px 14px color-mix(in srgb, var(--success-color) 20%, transparent),
                0 0 0 1px color-mix(in srgb, var(--success-color) 15%, transparent);
  }
}

/* 轻微的脉冲效果 - 用于警告状态 */
@keyframes subtlePulse {
  0%, 100% {
    box-shadow: 0 4px 20px color-mix(in srgb, var(--warning-color) 15%, transparent),
                0 2px 10px color-mix(in srgb, var(--warning-color) 10%, transparent);
  }
  50% {
    box-shadow: 0 5px 24px color-mix(in srgb, var(--warning-color) 20%, transparent),
                0 3px 12px color-mix(in srgb, var(--warning-color) 15%, transparent);
  }
}

/* 优雅的上浮效果 */
@keyframes floatUp {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-3px);
  }
}

/* 图标微弹跳效果 */
@keyframes iconBounce {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

/* 内部光晕呼吸效果 */
@keyframes innerGlow {
  0%, 100% {
    opacity: 0;
  }
  50% {
    opacity: 0.6;
  }
}

/* 暗色主题适配 */
.theme-dark .drag-indicator {
  background: color-mix(in srgb, var(--card-bg) 75%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3),
              0 4px 12px rgba(0, 0, 0, 0.2);
}

.theme-dark .drag-indicator.can-detach {
  box-shadow: 0 8px 28px color-mix(in srgb, var(--success-color) 25%, transparent),
              0 4px 14px color-mix(in srgb, var(--success-color) 18%, transparent),
              0 0 0 1px color-mix(in srgb, var(--success-color) 20%, transparent);
}

.theme-dark .drag-indicator.cannot-detach {
  box-shadow: 0 8px 28px color-mix(in srgb, var(--warning-color) 20%, transparent),
              0 4px 14px color-mix(in srgb, var(--warning-color) 15%, transparent);
}
</style>