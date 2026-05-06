<template>
  <div
    class="canvas-title-bar"
    :class="{ 'is-pinned': pinned, 'is-visible': isVisible || pinned }"
    data-tauri-drag-region
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 左侧：标题 & 图标（继承父级 drag，整个区域可拖拽） -->
    <div class="bar-left">
      <Brush :size="16" class="title-icon" />
      <span class="title-text" :title="title">{{ title }}</span>
    </div>

    <!-- 中间：操作按钮（no-drag，按钮可点击） -->
    <div class="bar-center">
      <el-tooltip content="刷新预览" placement="bottom">
        <button class="icon-btn" @click="$emit('refresh')">
          <RefreshCw :size="14" />
        </button>
      </el-tooltip>
      <el-tooltip :content="showStatusBar ? '隐藏状态栏' : '显示状态栏'" placement="bottom">
        <button class="icon-btn" :class="{ 'is-active': showStatusBar }" @click="$emit('toggle-status-bar')">
          <PanelBottom :size="14" />
        </button>
      </el-tooltip>
      <el-tooltip content="在 VSCode 中打开" placement="bottom">
        <button class="icon-btn" @click="$emit('open-vscode')">
          <ExternalLink :size="14" />
        </button>
      </el-tooltip>
      <div class="divider" />
      <el-tooltip :content="pinned ? '取消置顶' : '固定标题栏'" placement="bottom">
        <button class="icon-btn" :class="{ 'is-active': pinned }" @click="$emit('update:pinned', !pinned)">
          <Pin :size="14" :fill="pinned ? 'currentColor' : 'none'" />
        </button>
      </el-tooltip>
    </div>

    <!-- 右侧：窗口控制按钮（no-drag，按钮可点击） -->
    <div class="bar-right">
      <template v-if="!isMacOS">
        <button class="win-btn minimize-btn" title="最小化" @click="minimizeWindow">
          <Minus :size="16" />
        </button>
        <button class="win-btn maximize-btn" :title="isMaximized ? '还原' : '最大化'" @click="toggleMaximize">
          <Layers v-if="isMaximized" :size="14" />
          <Square v-else :size="14" />
        </button>
      </template>
      <button class="win-btn close-btn" title="关闭" @click="$emit('close')">
        <X :size="16" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Brush, RefreshCw, PanelBottom, ExternalLink, X, Pin, Minus, Square, Layers } from "lucide-vue-next";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { platform } from "@tauri-apps/plugin-os";

defineProps<{
  title: string;
  showStatusBar: boolean;
  pinned: boolean;
}>();

defineEmits<{
  (e: "refresh"): void;
  (e: "toggle-status-bar"): void;
  (e: "open-vscode"): void;
  (e: "close"): void;
  (e: "update:pinned", value: boolean): void;
}>();

const appWindow = getCurrentWebviewWindow();
const isVisible = ref(false);
const isMaximized = ref(false);
const isMacOS = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

// 清理函数列表（在 setup 顶层定义）
const cleanupFns: (() => void)[] = [];

onMounted(async () => {
  isMacOS.value = platform() === "macos";
  isMaximized.value = await appWindow.isMaximized();

  const unlisten = await appWindow.onResized(async () => {
    isMaximized.value = await appWindow.isMaximized();
  });
  cleanupFns.push(unlisten);
});

// 在 setup 顶层注册 onUnmounted（不能放在 async 回调里）
onUnmounted(() => {
  cleanupFns.forEach((fn) => fn());
  clearHideTimer();
});

function handleMouseEnter() {
  isVisible.value = true;
  clearHideTimer();
}

function handleMouseLeave() {
  startHideTimer();
}

function startHideTimer() {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    isVisible.value = false;
  }, 1000);
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

const minimizeWindow = () => appWindow.minimize();
const toggleMaximize = () => appWindow.toggleMaximize();
</script>

<style scoped lang="scss">
.canvas-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--titlebar-height, 36px);
  padding: 0;
  user-select: none;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* 统一拖拽：整个标题栏可拖拽窗口 */
  -webkit-app-region: drag;

  /* ── Pinned 模式：正常文档流 ── */
  &.is-pinned {
    position: relative;
  }

  /* ── Unpinned 模式：悬浮 + 滑入动画 ── */
  &:not(.is-pinned) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: var(--card-bg);
    backdrop-filter: blur(var(--ui-blur));
    transform: translateY(-100%);

    &.is-visible {
      transform: translateY(0);
    }

    /*
     * 感应区：利用 ::after 伪元素。
     * 当 bar 处于 translateY(-100%) 时，bar 本体在视口外（-36px ~ 0），
     * 而 ::after（bottom: -10px, height: 10px）刚好落在视口顶部 0 ~ 10px，
     * 作为不可见的鼠标触发区域。
     * 当 bar 滑入（translateY(0)）后，::after 在 bar 下方作为缓冲区，
     * 防止鼠标快速滑出时立即触发 mouseleave。
     */
    &::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: -10px;
      height: 10px;
    }
  }
}

/* ── 左侧：标题区域（继承 drag，可拖拽） ── */
.bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  flex: 1;
  min-width: 0;
  height: 100%;

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

/* ── 中间：操作按钮 ── */
.bar-center {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
  height: 100%;

  .divider {
    width: 1px;
    height: 16px;
    background: var(--border-color);
    margin: 0 4px;
  }
}

/* ── 右侧：窗口控制 ── */
.bar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  height: 100%;
}

/* ── 操作按钮样式 ── */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-color-primary);
  }

  &.is-active {
    background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
    color: var(--el-color-primary);
  }
}

/* ── 窗口控制按钮样式 ── */
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.close-btn:hover {
    background-color: #e81123;
    color: white;
  }
}

@media (max-width: 600px) {
  .title-text {
    display: none;
  }
}
</style>
