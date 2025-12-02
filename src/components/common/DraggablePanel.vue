<template>
  <Teleport to="body">
    <div
      v-if="destroyOnClose ? modelValue : modelValue || hasOpened"
      v-show="modelValue"
      ref="panelRef"
      class="draggable-panel"
      :class="{ 'is-minimized': isMinimized, 'is-resizing': isResizing }"
      :style="panelStyle"
    >
      <!-- 标题栏 (拖拽区域) -->
      <div ref="handleRef" class="panel-header">
        <div class="header-title">{{ title }}</div>
        <div class="header-actions" @mousedown.stop>
          <slot name="header-actions"></slot>
        </div>
        <div class="header-controls">
          <div
            class="control-btn minimize-btn"
            @click.stop="toggleMinimize"
            :title="isMinimized ? '展开' : '最小化'"
          >
            <component :is="isMinimized ? Square : Minus" :size="14" />
          </div>
          <div class="control-btn close-btn" @click.stop="close" title="关闭">
            <X :size="14" />
          </div>
        </div>
      </div>

      <!-- 内容区域 -->
      <div v-show="!isMinimized" class="panel-content">
        <slot></slot>
      </div>

      <!-- 调整大小手柄 -->
      <div v-if="resizable && !isMinimized" class="resize-handle" @mousedown="initResize"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useDraggable, useWindowSize, useStorage } from "@vueuse/core";
import { Minus, Square, X } from "lucide-vue-next";

export interface DraggablePanelInstance {
  activate: () => void;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    width?: string;
    height?: string;
    initialX?: number;
    initialY?: number;
    destroyOnClose?: boolean;
    resizable?: boolean;
    minWidth?: number;
    minHeight?: number;
    persistenceKey?: string; // 新增：用于本地存储的唯一键
  }>(),
  {
    title: "悬浮面板",
    width: "400px",
    height: "500px",
    initialX: 100,
    initialY: 100,
    destroyOnClose: false,
    resizable: true,
    minWidth: 300,
    minHeight: 200,
    persistenceKey: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const hasOpened = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const handleRef = ref<HTMLElement | null>(null);
const isMinimized = ref(false);
const isResizing = ref(false);

// 根据是否有 persistenceKey，决定使用 useStorage 还是 ref
const currentWidth = props.persistenceKey
  ? useStorage(`${props.persistenceKey}-width`, parseInt(props.width) || 400)
  : ref(parseInt(props.width) || 400);

const currentHeight = props.persistenceKey
  ? useStorage(`${props.persistenceKey}-height`, parseInt(props.height) || 500)
  : ref(parseInt(props.height) || 500);

// 窗口尺寸，用于边界检查
const { width: windowWidth, height: windowHeight } = useWindowSize();

const initialPosition = props.persistenceKey
  ? useStorage(`${props.persistenceKey}-position`, { x: props.initialX, y: props.initialY })
  : ref({ x: props.initialX, y: props.initialY });

// 使用 useDraggable
const { x, y } = useDraggable(panelRef, {
  initialValue: initialPosition,
  handle: handleRef,
  preventDefault: true,
  onEnd: (position) => {
    ensureInViewport(position.x, position.y);
    if (props.persistenceKey) {
      initialPosition.value = { x: x.value, y: y.value };
    }
  },
});

// 确保面板在视口内 (基础边界检查)
const ensureInViewport = (targetX: number, targetY: number) => {
  const topMargin = 50; // 顶部安全边距
  const sideMargin = 0; // 左右拖拽时允许贴边，或者设为 20 保持一致

  const maxX = windowWidth.value - 50;
  const maxY = windowHeight.value - 30;

  let newX = targetX;
  let newY = targetY;

  if (newX < sideMargin) newX = sideMargin;
  if (newX > maxX) newX = maxX;
  // 修复：使用 topMargin 而不是 0，防止被标题栏遮挡
  if (newY < topMargin) newY = topMargin;
  if (newY > maxY) newY = maxY;

  x.value = newX;
  y.value = newY;
};

// 智能调整：适配视口尺寸和位置
const fitToViewport = () => {
  const vw = windowWidth.value;
  const vh = windowHeight.value;
  const topMargin = 50; // 顶部安全边距，避开自定义标题栏
  const sideMargin = 20; // 其他方向的安全边距

  // 1. 尺寸适配：如果超过视口大小，则缩小
  if (currentWidth.value > vw) {
    currentWidth.value = Math.max(props.minWidth, vw - sideMargin * 2);
  }
  // 只有非最小化状态才检查高度
  if (!isMinimized.value && currentHeight.value > vh) {
    currentHeight.value = Math.max(props.minHeight, vh - topMargin - sideMargin);
  }

  // 2. 位置归位：确保完全在视口内
  let newX = x.value;
  let newY = y.value;

  // 检查右边界
  if (newX + currentWidth.value > vw) {
    newX = Math.max(sideMargin, vw - currentWidth.value - sideMargin);
  }
  // 检查下边界 (仅当非最小化时考虑高度，最小化时高度很小通常不会超)
  const actualHeight = isMinimized.value ? 50 : currentHeight.value;
  if (newY + actualHeight > vh) {
    newY = Math.max(sideMargin, vh - actualHeight - sideMargin);
  }

  // 检查左/上边界 (优先级最高)
  if (newX < 0) newX = sideMargin;
  if (newY < 0) newY = topMargin;

  x.value = newX;
  y.value = newY;

  // 如果有持久化，更新存储
  if (props.persistenceKey) {
    initialPosition.value = { x: newX, y: newY };
  }
};

// 激活面板：展开、置顶、归位
const activate = () => {
  // 1. 如果最小化了，展开
  if (isMinimized.value) {
    isMinimized.value = false;
  }

  // 2. 确保在视口内并适配尺寸
  // 使用 nextTick 确保展开动画或 DOM 更新后计算准确
  nextTick(() => {
    fitToViewport();
  });
};

defineExpose({
  activate,
});

// --- 调整大小逻辑 ---
const initResize = (e: MouseEvent) => {
  if (!props.resizable || isMinimized.value) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = currentWidth.value;
  const startHeight = currentHeight.value;

  isResizing.value = true;

  const doDrag = (moveEvent: MouseEvent) => {
    const newWidth = startWidth + moveEvent.clientX - startX;
    const newHeight = startHeight + moveEvent.clientY - startY;

    currentWidth.value = Math.max(props.minWidth, newWidth);
    currentHeight.value = Math.max(props.minHeight, newHeight);
  };

  const stopDrag = () => {
    isResizing.value = false;
    window.removeEventListener("mousemove", doDrag);
    window.removeEventListener("mouseup", stopDrag);
    document.body.style.cursor = "";
    // 持久化尺寸
    if (props.persistenceKey) {
      // useStorage 会自动处理更新
    }
  };

  window.addEventListener("mousemove", doDrag);
  window.addEventListener("mouseup", stopDrag);
  e.preventDefault();
  document.body.style.cursor = "se-resize";
};

const panelStyle = computed(() => {
  return {
    left: `${x.value}px`,
    top: `${y.value}px`,
    width: `${currentWidth.value}px`,
    height: isMinimized.value ? "auto" : `${currentHeight.value}px`,
    zIndex: 2000,
  };
});

const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value;
};

const close = () => {
  emit("update:modelValue", false);
  emit("close");
};

// 监听 modelValue 变化
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      hasOpened.value = true;
      // 打开时自动激活（归位、展开）
      activate();
    }
  },
  { immediate: true }
);

// 监听 props 变化更新内部尺寸（如果外部改变了 props）
watch(
  () => [props.width, props.height],
  ([w, h]) => {
    if (w) currentWidth.value = parseInt(w) || 400;
    if (h) currentHeight.value = parseInt(h) || 500;
  }
);
</script>

<style scoped>
.draggable-panel {
  position: fixed;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    height 0.3s ease,
    width 0.3s ease,
    opacity 0.2s;
}

.draggable-panel.is-minimized {
  height: auto !important;
  width: 200px !important; /* 最小化时缩短宽度 */
}

.draggable-panel.is-resizing {
  transition: none !important;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--bg-color-soft);
  border-bottom: 1px solid var(--border-color);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: auto; /* 让标题占据左侧剩余空间，把 actions 推到右边 */
}

.header-actions {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-left: 8px;
  border-left: 1px solid var(--border-color);
}

.control-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s;
}

.control-btn:hover {
  background-color: var(--fill-color);
  color: var(--text-color);
}

.close-btn:hover {
  background-color: var(--el-color-danger);
  color: white;
}

.panel-content {
  flex: 1;
  min-height: 0; /* 关键：允许 flex 子项小于内容高度，从而触发滚动 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  z-index: 10;
}

.resize-handle::after {
  content: "";
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-bottom: 2px solid var(--el-text-color-placeholder);
  border-right: 2px solid var(--el-text-color-placeholder);
  opacity: 0.7;
  border-bottom-right-radius: 6px;
  transition: all 0.2s;
}

.resize-handle:hover::after {
  opacity: 1;
  border-color: var(--el-color-primary);
}
</style>
