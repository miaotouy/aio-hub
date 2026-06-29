<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 波形数据 (0-255 的整数数组) */
    waveform?: number[];
    /** 组件高度，默认 40px */
    height?: number | string;
    /** 柱状条宽度，默认 3px */
    barWidth?: number;
    /** 柱状条间距，默认 1px */
    barGap?: number;
    /** 是否显示为圆角柱状条，默认 true */
    rounded?: boolean;
    /** 主题色，默认使用 --el-color-primary */
    color?: string;
    /** 是否显示加载骨架屏（当 waveform 为空时） */
    showSkeleton?: boolean;
  }>(),
  {
    waveform: () => [],
    height: 40,
    barWidth: 3,
    barGap: 1,
    rounded: true,
    color: "",
    showSkeleton: true,
  }
);

const svgHeight = computed(() =>
  typeof props.height === "number" ? props.height : parseInt(props.height)
);

const svgWidth = computed(() => {
  const count = props.waveform.length || 100;
  return count * (props.barWidth + props.barGap) + props.barGap;
});

const barColor = computed(() => props.color || "var(--el-color-primary)");

const barRadius = computed(() =>
  props.rounded ? Math.min(props.barWidth / 2, 2) : 0
);

/**
 * 将波形值 (0-255) 映射为 SVG 柱状条高度 (0 ~ svgHeight)
 * 保留底部 10% 的留白，让波形看起来更精致
 */
function mapHeight(value: number): number {
  const maxBarHeight = svgHeight.value * 0.9;
  return Math.max(1, (value / 255) * maxBarHeight);
}

/**
 * 生成骨架屏波形数据（模拟一个自然的音频波形形状）
 */
const skeletonWaveform = computed(() => {
  const points: number[] = [];
  const count = 100;
  for (let i = 0; i < count; i++) {
    const position = (i + 0.5) / count;
    const envelope = Math.sin(position * Math.PI);
    const texture =
      0.58 +
      0.22 * Math.sin(i * 0.43) +
      0.14 * Math.sin(i * 0.91 + 1.7) +
      0.06 * Math.sin(i * 1.83 + 0.4);
    const value = Math.round((0.18 + envelope * 0.82) * texture * 220);
    points.push(Math.min(220, Math.max(8, value)));
  }
  return points;
});

const displayWaveform = computed(() => {
  if (props.waveform.length > 0) return props.waveform;
  if (props.showSkeleton) return skeletonWaveform.value;
  return [];
});

const isSkeleton = computed(
  () => props.waveform.length === 0 && props.showSkeleton
);
</script>

<template>
  <div
    class="audio-waveform"
    :style="{
      height: typeof height === 'number' ? height + 'px' : height,
    }"
  >
    <svg
      v-if="displayWaveform.length > 0"
      :width="svgWidth"
      :height="svgHeight"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      class="waveform-svg"
    >
      <g v-for="(value, index) in displayWaveform" :key="index">
        <rect
          :x="index * (barWidth + barGap) + barGap"
          :y="(svgHeight - mapHeight(value)) / 2"
          :width="barWidth"
          :height="mapHeight(value)"
          :rx="barRadius"
          :ry="barRadius"
          :fill="barColor"
          :class="{ skeleton: isSkeleton }"
        />
      </g>
    </svg>
    <div v-else class="waveform-empty">
      <slot name="empty">
        <span class="empty-text">无波形数据</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.audio-waveform {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: hidden;
}

.waveform-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.waveform-svg rect {
  transition:
    height 0.3s ease,
    y 0.3s ease;
}

.waveform-svg rect.skeleton {
  opacity: 0.3;
  animation: waveform-pulse 1.5s ease-in-out infinite;
}

@keyframes waveform-pulse {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.5;
  }
}

.waveform-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.empty-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
