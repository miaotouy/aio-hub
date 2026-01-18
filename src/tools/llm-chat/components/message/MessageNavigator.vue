<script setup lang="ts">
import { computed, ref } from "vue";
import { useScroll, useThrottleFn } from "@vueuse/core";
import { ArrowUp, ArrowDown, DArrowLeft, DArrowRight } from "@element-plus/icons-vue";

interface Props {
  /** 滚动容器的引用 */
  scrollElement: HTMLElement | null;
  /** 消息总数 */
  messageCount: number;
  /** 当前可视消息索引 (1-based) */
  currentIndex?: number;
  /** 是否有新消息（用于显示徽章） */
  hasNewMessages?: boolean;
}

interface Emits {
  (e: "scroll-to-top"): void;
  (e: "scroll-to-bottom"): void;
  (e: "scroll-to-next"): void;
  (e: "scroll-to-prev"): void;
  /** 已看到新消息（触底时触发） */
  (e: "seen-new-messages"): void;
}

const props = withDefaults(defineProps<Props>(), {
  hasNewMessages: false,
});

const emit = defineEmits<Emits>();

// 使用 useScroll 追踪滚动状态
const { arrivedState } = useScroll(
  computed(() => props.scrollElement),
  {
    offset: { top: 50, bottom: 50 },
  }
);

// 当前可见的消息索引
const currentMessageIndex = computed(() => {
  // 如果外部传入了准确的索引（通常来自虚拟列表），直接使用
  if (props.currentIndex !== undefined) {
    return props.currentIndex;
  }
  // 降级方案：基于滚动百分比估算
  if (props.messageCount === 0) return 0;
  // 这里暂时无法准确估算，只能返回 0 或基于像素的粗略值，但在 MessageList 场景下通常都有 currentIndex
  return 1;
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

// 监听触底状态，如果当前有新消息标记且触底了，通知外部清除
import { watch } from "vue";
watch(
  () => arrivedState.bottom,
  (isAtBottom) => {
    if (isAtBottom && props.hasNewMessages) {
      emit("seen-new-messages");
    }
  }
);
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
