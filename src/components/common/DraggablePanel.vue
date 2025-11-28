<template>
  <Teleport to="body">
    <div
      v-if="destroyOnClose ? modelValue : (modelValue || hasOpened)"
      v-show="modelValue"
      ref="panelRef"
      class="draggable-panel"
      :class="{ 'is-minimized': isMinimized, 'is-resizing': isResizing }"
      :style="panelStyle"
    >
      <!-- 标题栏 (拖拽区域) -->
      <div ref="handleRef" class="panel-header">
        <div class="header-title">{{ title }}</div>
        <div class="header-controls">
          <div
            class="control-btn minimize-btn"
            @click.stop="toggleMinimize"
            :title="isMinimized ? '展开' : '最小化'"
          >
            <component
              :is="isMinimized ? Square : Minus"
              :size="14"
            />
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
      <div
        v-if="resizable && !isMinimized"
        class="resize-handle"
        @mousedown="initResize"
      ></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useDraggable, useWindowSize, useStorage } from "@vueuse/core";
import { Minus, Square, X } from "lucide-vue-next";

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

// 确保面板在视口内
const ensureInViewport = (targetX: number, targetY: number) => {
  const maxX = windowWidth.value - 50;
  const maxY = windowHeight.value - 30;

  let newX = targetX;
  let newY = targetY;

  if (newX < 0) newX = 0;
  if (newX > maxX) newX = maxX;
  if (newY < 0) newY = 0;
  if (newY > maxY) newY = maxY;

  x.value = newX;
  y.value = newY;
};

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
      
      // 每次打开时，确保在可视范围内
      // 使用 nextTick 确保 DOM 更新后获取准确尺寸（如果需要更精确的计算）
      nextTick(() => {
        ensureInViewport(x.value, y.value);
        
        // 如果当前位置完全在屏幕外，重置到中心或默认位置
        if (x.value > windowWidth.value || y.value > windowHeight.value) {
           x.value = Math.min(windowWidth.value / 2 - currentWidth.value / 2, Math.max(0, windowWidth.value - currentWidth.value - 20));
           y.value = Math.min(windowHeight.value / 2 - currentHeight.value / 2, Math.max(0, windowHeight.value - currentHeight.value - 20));
        }
      });
    }
  }
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
  transition: height 0.3s ease, width 0.3s ease, opacity 0.2s;
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
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
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