<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useScroll, useThrottleFn, useResizeObserver } from "@vueuse/core";
import { ArrowUp, ArrowDown, DArrowLeft, DArrowRight } from "@element-plus/icons-vue";

interface Props {
  /** 滚动容器的引用 */
  scrollElement: HTMLElement | null;
  /** 消息总数 */
  messageCount: number;
  /** 是否有新消息（用于显示徽章） */
  hasNewMessages?: boolean;
}

interface Emits {
  (e: "scroll-to-top"): void;
  (e: "scroll-to-bottom"): void;
  (e: "scroll-to-next"): void;
  (e: "scroll-to-prev"): void;
}

const props = withDefaults(defineProps<Props>(), {
  hasNewMessages: false,
});

const emit = defineEmits<Emits>();

// 使用 useScroll 追踪滚动状态，获取响应式的 y 值
const { arrivedState, y } = useScroll(
  computed(() => props.scrollElement),
  {
    offset: { top: 50, bottom: 50 },
  }
);

// 追踪容器尺寸变化（响应式）
const scrollHeight = ref(0);
const clientHeight = ref(0);

// 使用 ResizeObserver 监听容器尺寸变化
useResizeObserver(
  computed(() => props.scrollElement),
  () => {
    if (props.scrollElement) {
      scrollHeight.value = props.scrollElement.scrollHeight;
      clientHeight.value = props.scrollElement.clientHeight;
    }
  }
);

// 监听元素变化，初始化和更新尺寸
watchEffect(() => {
  if (props.scrollElement) {
    scrollHeight.value = props.scrollElement.scrollHeight;
    clientHeight.value = props.scrollElement.clientHeight;
  }
});

// 当前滚动位置的百分比（0-100），使用响应式值
const scrollPercentage = computed(() => {
  if (!props.scrollElement || scrollHeight.value <= clientHeight.value) return 100;
  const maxScroll = scrollHeight.value - clientHeight.value;
  if (maxScroll <= 0) return 100;
  // 限制百分比在 0-100 范围内，防止进度条溢出
  return Math.min(100, Math.max(0, Math.round((y.value / maxScroll) * 100)));
});

// 估算当前可见的消息索引（基于滚动百分比）
const currentMessageIndex = computed(() => {
  if (props.messageCount === 0) return 0;
  return Math.round((scrollPercentage.value / 100) * (props.messageCount - 1)) + 1;
});

// 是否显示导航器：有消息且不是很少的消息时显示
const showNavigator = computed(() => props.messageCount > 3);

// 是否可以向上滚动
const canScrollUp = computed(() => !arrivedState.top);

// 是否可以向下滚动
const canScrollDown = computed(() => !arrivedState.bottom);

// 节流的滚动处理
const handleScrollToTop = useThrottleFn(() => emit("scroll-to-top"), 300);
const handleScrollToBottom = useThrottleFn(() => emit("scroll-to-bottom"), 300);
const handleScrollToNext = useThrottleFn(() => emit("scroll-to-next"), 200);
const handleScrollToPrev = useThrottleFn(() => emit("scroll-to-prev"), 200);

// 响应式展开/收起状态
const isExpanded = ref(false);

// 鼠标进入时展开
const handleMouseEnter = () => {
  isExpanded.value = true;
};

// 鼠标离开时收起
const handleMouseLeave = () => {
  isExpanded.value = false;
};
</script>

<template>
  <Transition name="slide-left">
    <div
      v-if="showNavigator"
      class="message-navigator"
      :class="{ 'is-expanded': isExpanded }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <!-- 到顶按钮 -->
      <el-tooltip
        :content="canScrollUp ? '跳转到顶部' : '已在顶部'"
        placement="right"
        :show-after="300"
      >
        <div
          class="nav-button nav-button-jump"
          :class="{ disabled: !canScrollUp }"
          @click="handleScrollToTop"
        >
          <el-icon :size="14" style="transform: rotate(90deg)">
            <DArrowLeft />
          </el-icon>
        </div>
      </el-tooltip>

      <!-- 向上按钮 -->
      <el-tooltip
        :content="canScrollUp ? '上一条消息 (↑)' : '已在顶部'"
        placement="right"
        :show-after="300"
      >
        <div class="nav-button" :class="{ disabled: !canScrollUp }" @click="handleScrollToPrev">
          <el-icon :size="14">
            <ArrowUp />
          </el-icon>
        </div>
      </el-tooltip>

      <!-- 刻度指示器 -->
      <div class="progress-track">
        <div class="progress-bar" :style="{ height: `${scrollPercentage}%` }" />
        <div class="progress-indicator" :style="{ top: `${scrollPercentage}%` }">
          <span class="indicator-dot" :class="{ 'has-new': hasNewMessages }"></span>
        </div>
      </div>

      <!-- 消息计数器 -->
      <div class="message-counter">
        <span class="current">{{ currentMessageIndex }}</span>
        <span class="divider">/</span>
        <span class="total">{{ messageCount }}</span>
      </div>

      <!-- 向下按钮 -->
      <el-tooltip
        :content="canScrollDown ? '下一条消息 (↓)' : '已在底部'"
        placement="right"
        :show-after="300"
      >
        <div
          class="nav-button"
          :class="{ disabled: !canScrollDown, 'has-new-badge': hasNewMessages && canScrollDown }"
          @click="handleScrollToNext"
        >
          <el-icon :size="14">
            <ArrowDown />
          </el-icon>
          <div v-if="hasNewMessages && canScrollDown" class="new-message-dot"></div>
        </div>
      </el-tooltip>

      <!-- 到底按钮 -->
      <el-tooltip
        :content="canScrollDown ? '跳转到底部' : '已在底部'"
        placement="right"
        :show-after="300"
      >
        <div
          class="nav-button nav-button-jump"
          :class="{ disabled: !canScrollDown, 'has-new-badge': hasNewMessages && canScrollDown }"
          @click="handleScrollToBottom"
        >
          <el-icon :size="14" style="transform: rotate(90deg)">
            <DArrowRight />
          </el-icon>
          <div v-if="hasNewMessages && canScrollDown" class="new-message-dot"></div>
        </div>
      </el-tooltip>
    </div>
  </Transition>
</template>

<style scoped>
.message-navigator {
  position: absolute;
  left: -50px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;

  background: var(--el-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  user-select: none;
  backdrop-filter: blur(var(--ui-blur));
  background: color-mix(in srgb, var(--el-bg-color) 90%, transparent);

  /* 平滑过渡 */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* 收起状态半透明 */
  opacity: 0.5;
}

/* 触发范围的伪元素 */
.message-navigator::before {
  content: "";
  position: absolute;
  top: -40px;
  bottom: -40px;
  left: -10px;
  right: -40px;
  z-index: -1;
  pointer-events: auto;
  /* 调试用：取消注释可以看到触发区域 */
  /* background: rgba(255, 0, 0, 0.1); */
}

/* 展开状态 */
.message-navigator.is-expanded {
  left: 10px;
  opacity: 1;
}

/* 导航按钮 */
.nav-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--text-color-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-button:hover:not(.disabled) {
  background: var(--primary-color);
  color: white;
  transform: scale(1.05);
}

.nav-button:active:not(.disabled) {
  transform: scale(0.95);
}

.nav-button.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 跳转按钮样式 */
.nav-button-jump {
  background: var(--el-fill-color);
  border: 1px solid var(--border-color);
}

.nav-button-jump:hover:not(.disabled) {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

/* 新消息圆点 */
.new-message-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  background: var(--el-color-danger);
  border-radius: 50%;
  border: 1.5px solid var(--el-bg-color);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

/* 进度轨道 */
.progress-track {
  position: relative;
  width: 3px;
  height: 120px;
  background: var(--el-fill-color);
  border-radius: 1.5px;
  overflow: visible;

  /* 收起状态时向右偏移 */
  transform: translateX(45px);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 展开状态时进度条回到正常位置 */
.message-navigator.is-expanded .progress-track {
  transform: translateX(0);
}

.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(
    to bottom,
    var(--primary-color),
    color-mix(in srgb, var(--primary-color) 70%, transparent)
  );
  border-radius: 2px;
  transition: height 0.3s ease;
}

.progress-indicator {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: top 0.3s ease;
}

.indicator-dot {
  display: block;
  width: 10px;
  height: 10px;
  background: var(--primary-color);
  border: 2px solid var(--el-bg-color);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
}

.indicator-dot.has-new {
  background: var(--el-color-danger);
  animation: pulse-indicator 2s infinite;
}

@keyframes pulse-indicator {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  50% {
    transform: scale(1.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}

/* 消息计数器 */
.message-counter {
  display: flex;
  align-items: baseline;
  gap: 1px;
  font-size: 11px;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.message-counter .current {
  color: var(--primary-color);
  font-weight: 600;
}

.message-counter .divider {
  opacity: 0.5;
}

.message-counter .total {
  font-size: 10px;
}

/* 过渡动画 */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-20px);
}

.slide-left-enter-to,
.slide-left-leave-from {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}
</style>
