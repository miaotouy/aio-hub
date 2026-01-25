<template>
  <Teleport to="body">
    <div
      v-if="props.destroyOnClose ? props.modelValue : hasOpened"
      v-show="props.modelValue"
      class="base-dialog-backdrop"
      :style="backdropStyles"
      :class="{
        'backdrop-visible': showContentTransition,
        'backdrop-hidden': !showContentTransition,
        'no-transition': !props.enableTransition,
      }"
      @click="props.closeOnBackdropClick && handleClose()"
    >
      <div
        class="base-dialog-container"
        :class="[
          props.bare ? 'dialog-bare' : 'dialog-styled',
          props.dialogClass,
          {
            'dialog-enter': showContentTransition,
            'dialog-leave': !showContentTransition,
            'glass-overlay': isGlassEffectActive && !props.bare,
            'no-transition': !props.enableTransition,
          },
        ]"
        :style="dialogStyles"
        @click.stop
      >
        <!-- 头部区域 -->
        <div
          v-if="hasHeaderSlot || props.title || props.showCloseButton"
          class="dialog-header"
          :class="{ 'with-border': !props.bare }"
        >
          <slot name="header">
            <h3 v-if="props.title" class="dialog-title">
              {{ props.title }}
            </h3>
            <div v-else></div>
          </slot>
          <button
            v-if="props.showCloseButton"
            @click="handleClose"
            class="dialog-close-btn"
            aria-label="关闭"
          >
            <svg
              class="close-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="dialog-content" :class="props.contentClass" v-loading="props.loading">
          <slot name="content">
            <slot></slot>
          </slot>
        </div>

        <!-- 底部区域 -->
        <div
          v-if="hasFooterSlot && props.showFooter"
          class="dialog-footer"
          :class="{ 'with-border': !props.bare }"
        >
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, useSlots, computed, nextTick } from "vue";
import { useThemeAppearance } from "@/composables/useThemeAppearance";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    width?: string;
    maxWidth?: string;
    maxHeight?: string;
    height?: string;
    top?: string;
    showCloseButton?: boolean;
    closeOnBackdropClick?: boolean;
    bare?: boolean;
    dialogClass?: string;
    contentClass?: string;
    zIndex?: number;
    destroyOnClose?: boolean;
    showFooter?: boolean; // Added prop
    enableTransition?: boolean;
    loading?: boolean;
  }>(),
  {
    showCloseButton: true,
    closeOnBackdropClick: true,
    width: "600px",
    height: "auto",
    bare: false,
    dialogClass: "",
    contentClass: "",
    zIndex: 1999,
    destroyOnClose: true,
    showFooter: true, // Default to true if slot exists
    enableTransition: true,
    loading: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
  (e: "open"): void;
}>();

// 记录是否已经打开过
const hasOpened = ref(false);

const slots = useSlots();
const hasFooterSlot = computed(() => !!slots.footer);
const hasHeaderSlot = computed(() => !!slots.header);

const { appearanceSettings } = useThemeAppearance();
const isGlassEffectActive = computed(
  () => appearanceSettings.value.enableUiEffects && appearanceSettings.value.enableUiBlur
);

const showContentTransition = ref(false);
const dynamicZIndex = ref(props.zIndex);

const backdropStyles = computed(() => {
  const styles: Record<string, any> = {
    zIndex: dynamicZIndex.value,
  };

  // 始终添加顶部内边距以避开标题栏
  // 这样无论是居中还是自定义 top，都能保证不被遮挡
  // 且在居中模式下，视觉重心会稍微下移，更符合桌面应用体验
  if (props.top) {
    styles.alignItems = "flex-start";
    // 使用 calc 叠加标题栏高度
    styles.paddingTop = `calc(var(--titlebar-height) + ${props.top})`;
  } else {
    styles.alignItems = "center";
    // 只添加顶部内边距，不添加底部内边距
    // 这样内容区域的垂直中心会下移 (titlebar-height / 2)，即在"除去标题栏后的剩余空间"内居中
    styles.paddingTop = "var(--titlebar-height)";
  }
  return styles;
});

// 格式化尺寸值，为纯数字添加 'px' 单位
const formatSize = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const val = String(value);
  // 检查字符串是否为纯数字（整数或浮点数）
  if (/^\d+(\.\d+)?$/.test(val)) {
    return `${val}px`;
  }
  return val;
};

// 计算对话框样式
const dialogStyles = computed(() => {
  const styles: Record<string, string> = {};

  const formattedWidth = formatSize(props.width);
  if (formattedWidth) {
    styles.width = formattedWidth;
  }

  const formattedMaxWidth = formatSize(props.maxWidth);
  if (formattedMaxWidth) {
    styles.maxWidth = formattedMaxWidth;
  } else if (formattedWidth) {
    // 如果没有指定 maxWidth，则使用 width 作为 maxWidth
    styles.maxWidth = formattedWidth;
  }

  const formattedHeight = formatSize(props.height);
  if (formattedHeight && formattedHeight !== "auto") {
    styles.height = formattedHeight;
  }

  return styles;
});

watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      hasOpened.value = true;
      emit("open");
      // 对话框打开时，可能需要递增 z-index（如果有多个对话框）
      // 这里简化处理，直接使用传入的 zIndex
      dynamicZIndex.value = props.zIndex;

      // DOM 更新后启动入场动画
      // 使用双重 requestAnimationFrame 确保在浏览器重绘后应用类名
      // 解决 v-if 导致元素刚插入时动画不触发的问题
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            showContentTransition.value = true;
          });
        });
      });
    } else {
      showContentTransition.value = false;
    }
  },
  { immediate: true }
);

function handleClose() {
  showContentTransition.value = false;
  // 等待退场动画完成，如果禁用了动画则立即关闭
  const delay = props.enableTransition ? 300 : 0;
  setTimeout(() => {
    emit("update:modelValue", false);
    emit("close");
  }, delay);
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (props.modelValue && event.key === "Escape" && props.showCloseButton) {
    handleClose();
  }
};

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
/* 遮罩层 */
.base-dialog-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(var(--backdrop-bg-rgb), 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.3s ease;
}

.backdrop-hidden {
  opacity: 0;
}

.backdrop-visible {
  opacity: 1;
}

.no-transition {
  transition: none !important;
}

/* 对话框容器 */
.base-dialog-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 90vw;
  max-height: 90vh;
  transition: all 0.3s ease;
}

/* 样式模式 */
.dialog-styled {
  background-color: var(--card-bg);
  border-radius: 8px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
}

/* 无样式模式 */
.dialog-bare {
  background: transparent;
  box-shadow: none;
  border: none;
}

/* 动画效果 */
.dialog-leave {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}

.dialog-enter {
  opacity: 1;
  transform: scale(1) translateY(0);
}

/* 头部 */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  flex-shrink: 0;
}

.dialog-header.with-border {
  border-bottom: 1px solid var(--border-color);
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.dialog-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-close-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.dialog-close-btn:active {
  background-color: var(--el-fill-color);
}

.close-icon {
  width: 20px;
  height: 20px;
}

/* 内容区域 */
.dialog-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  min-height: 0; /* 重要：配合 flex 正确处理滚动 */
}

/* 底部 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  flex-shrink: 0;
}

.dialog-footer.with-border {
  border-top: 1px solid var(--border-color);
}

/* 滚动条样式 */
.dialog-content::-webkit-scrollbar {
  width: 6px;
}

.dialog-content::-webkit-scrollbar-track {
  background: transparent;
}

.dialog-content::-webkit-scrollbar-thumb {
  background: var(--el-border-color-light);
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color);
}
</style>
