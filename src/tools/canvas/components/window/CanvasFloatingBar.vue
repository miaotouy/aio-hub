<template>
  <div 
    class="canvas-floating-bar-trigger" 
    @mouseenter="handleMouseEnterTrigger"
  >
    <div 
      class="canvas-floating-bar" 
      :class="{ 'is-visible': isVisible }"
      data-tauri-drag-region
      @mouseenter="handleMouseEnterBar"
      @mouseleave="handleMouseLeaveBar"
    >
      <div class="bar-left">
        <Brush :size="16" class="title-icon" />
        <span class="title-text">{{ title }}</span>
      </div>

      <div class="bar-center">
        <el-tooltip content="刷新预览" placement="bottom">
          <button class="icon-btn" @click="$emit('refresh')">
            <RefreshCw :size="16" />
          </button>
        </el-tooltip>
        <el-tooltip :content="showStatusBar ? '隐藏状态栏' : '显示状态栏'" placement="bottom">
          <button class="icon-btn" :class="{ 'is-active': showStatusBar }" @click="$emit('toggle-status-bar')">
            <PanelBottom :size="16" />
          </button>
        </el-tooltip>
        <el-tooltip :content="effectiveMode === 'srcdoc' ? '切换到物理预览 (支持图片/资源)' : '切换到内联预览 (实时影子文件)'" placement="bottom">
          <button class="icon-btn" :class="{ 'is-active': effectiveMode === 'physical' }" @click="$emit('toggle-preview-mode')">
            <Monitor :size="16" v-if="effectiveMode === 'srcdoc'" />
            <Code :size="16" v-else />
          </button>
        </el-tooltip>
        <el-tooltip content="在 VSCode 中打开" placement="bottom">
          <button class="icon-btn" @click="$emit('open-vscode')">
            <ExternalLink :size="16" />
          </button>
        </el-tooltip>
      </div>

      <div class="bar-right">
        <button class="icon-btn close-btn" @click="$emit('close')">
          <X :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { Brush, RefreshCw, PanelBottom, ExternalLink, X, Monitor, Code } from "lucide-vue-next";

defineProps<{
  title: string;
  showStatusBar: boolean;
  effectiveMode: "srcdoc" | "physical";
}>();

defineEmits<{
  (e: 'refresh'): void;
  (e: 'toggle-status-bar'): void;
  (e: 'toggle-preview-mode'): void;
  (e: 'open-vscode'): void;
  (e: 'close'): void;
}>();

const isVisible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function handleMouseEnterTrigger() {
  isVisible.value = true;
  clearHideTimer();
}

function handleMouseEnterBar() {
  isVisible.value = true;
  clearHideTimer();
}

function handleMouseLeaveBar() {
  startHideTimer();
}

function startHideTimer() {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    isVisible.value = false;
  }, 1500);
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

onUnmounted(() => {
  clearHideTimer();
});
</script>

<style scoped lang="scss">
.canvas-floating-bar-trigger {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  z-index: 1000;
}

.canvas-floating-bar {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 400px;
  max-width: 80%;
  height: 44px;
  padding: 0 16px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-top: none;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto;

  &.is-visible {
    transform: translate(-50%, 0);
  }

  .bar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    overflow: hidden;

    .title-icon {
      color: var(--el-color-primary);
      flex-shrink: 0;
    }

    .title-text {
      font-size: 13px;
      font-weight: 500;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .bar-center {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
  }

  .bar-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 1;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--el-text-color-regular);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--el-fill-color-light);
      color: var(--el-color-primary);
    }

    &.is-active {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }

    &.close-btn:hover {
      background: var(--el-color-danger-light-9);
      color: var(--el-color-danger);
    }
  }
}
</style>