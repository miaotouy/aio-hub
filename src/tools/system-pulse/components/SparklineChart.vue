<!-- src/tools/system-pulse/components/SparklineChart.vue -->
<!-- 通用迷你折线图，使用 ECharts Canvas 渲染，性能优先 -->
<template>
  <div ref="container" :style="{ height: `${height}px`, width: '100%' }" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  data: number[];
  color?: string;
  height?: number;
  unit?: string;
  maxValue?: number;
  fillArea?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  color: "#4a9eff",
  height: 60,
  unit: "%",
  fillArea: true,
});

const container = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

const option = computed(() => ({
  animation: false,
  grid: { top: 4, right: 4, bottom: 4, left: 4 },
  xAxis: {
    type: "category" as const,
    show: false,
    boundaryGap: false,
    data: props.data.map((_, i) => i),
  },
  yAxis: {
    type: "value" as const,
    show: false,
    min: 0,
    max: props.maxValue ?? undefined,
  },
  series: [
    {
      type: "line" as const,
      data: props.data,
      smooth: true,
      symbol: "none",
      lineStyle: { color: props.color, width: 1.5 },
      areaStyle: props.fillArea
        ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: props.color + "55" },
              { offset: 1, color: props.color + "05" },
            ]),
          }
        : undefined,
    },
  ],
}));

function initChart() {
  if (!container.value) return;
  chart = echarts.init(container.value, null, { renderer: "canvas" });
  chart.setOption(option.value);
}

watch(
  () => props.data,
  () => {
    chart?.setOption({ series: [{ data: props.data }] }, false, true);
  },
  { deep: false },
);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initChart();
  resizeObserver = new ResizeObserver(() => chart?.resize());
  if (container.value) resizeObserver.observe(container.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>
