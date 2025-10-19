<script setup lang="ts">
import { ref, onMounted, onBeforeMount, onUnmounted } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { createModuleLogger } from '../../utils/logger';

const logger = createModuleLogger('DetachPreviewHint');

interface Props {
  /** 是否显示预览提示 */
  visible?: boolean;
}

withDefaults(defineProps<Props>(), {
  visible: true,
});

// 是否可以分离（拖拽距离是否足够）
const canDetach = ref(false);

// 保存事件监听器的清理函数
let unlisten: (() => void) | null = null;

// 在组件挂载之前就设置监听器，确保不会错过任何事件
onBeforeMount(async () => {
  logger.info("DetachPreviewHint 开始初始化");
  
  // 立即设置监听器,避免错过早期事件
  unlisten = await listen<{ canDetach: boolean }>("detach-status-update", (event) => {
    logger.info("收到拖拽状态更新", {
      canDetach: event.payload.canDetach,
      payload: event.payload
    });
    canDetach.value = event.payload.canDetach;
  });

  logger.info("DetachPreviewHint 监听器已设置");
});

onMounted(() => {
  logger.info("DetachPreviewHint 挂载完成", {
    visible: true,
    initialCanDetach: canDetach.value
  });
});

// 组件卸载时清理事件监听器
onUnmounted(() => {
  if (unlisten) {
    unlisten();
    logger.info("DetachPreviewHint 事件监听器已清理");
  }
});
</script>

<template>
  <div v-if="visible" class="preview-hint" :class="canDetach ? 'can-detach' : 'cannot-detach'">
    <div class="hint-content">
      <span class="hint-icon">{{ canDetach ? '✓' : '✗' }}</span>
      <span class="hint-text">{{ canDetach ? '松手创建窗口' : '继续拖动或取消' }}</span>
    </div>
  </div>
</template>

<style scoped>
/* 预览提示 */
.preview-hint {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 10000; /* 比 TitleBar 的 9999 更高 */
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hint-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  backdrop-filter: blur(12px) saturate(180%);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1.5px solid;
}

.hint-icon {
  font-size: 14px;
  font-weight: bold;
}

.hint-text {
  letter-spacing: 0.3px;
}

/* 可以分离状态 - 成功提示 */
.preview-hint.can-detach .hint-content {
  background: color-mix(in srgb, var(--success-color) 12%, transparent);
  border-color: var(--success-color);
  color: var(--success-color);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--success-color) 20%, transparent),
              0 2px 8px color-mix(in srgb, var(--success-color) 15%, transparent);
  animation: gentleGlow 2s ease-in-out infinite;
}

/* 不可分离状态 - 警告提示 */
.preview-hint.cannot-detach .hint-content {
  background: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border-color: var(--warning-color);
  color: var(--warning-color);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--warning-color) 15%, transparent),
              0 2px 8px color-mix(in srgb, var(--warning-color) 10%, transparent);
}

/* 柔和的光晕动画 */
@keyframes gentleGlow {
  0%, 100% {
    box-shadow: 0 4px 16px color-mix(in srgb, var(--success-color) 20%, transparent),
                0 2px 8px color-mix(in srgb, var(--success-color) 15%, transparent);
  }
  50% {
    box-shadow: 0 6px 24px color-mix(in srgb, var(--success-color) 30%, transparent),
                0 3px 12px color-mix(in srgb, var(--success-color) 20%, transparent);
  }
}
</style>