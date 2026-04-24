<!-- src/tools/system-pulse/components/SparklineChart.vue -->
<!-- 通用迷你折线图，使用 ECharts Canvas 渲染，性能优先 -->
<template>
  <div ref="container" :style="containerStyle" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Dataset {
  name?: string;
  data: number[];
  color?: string;
}

interface Props {
  data: number[] | Dataset[];
  color?: string | string[];
  height?: number | string;
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

const containerStyle = computed(() => {
  const h = typeof props.height === "number" ? `${props.height}px` : props.height;
  return { height: h, width: "100%" };
});

const container = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

const datasets = computed<Dataset[]>(() => {
  if (Array.isArray(props.data) && props.data.length > 0 && typeof props.data[0] === "number") {
    return [
      {
        data: props.data as number[],
        color: typeof props.color === "string" ? props.color : props.color?.[0],
      },
    ];
  }
  return (props.data as Dataset[]).map((d, i) => ({
    ...d,
    color: d.color || (Array.isArray(props.color) ? props.color[i] : props.color),
  }));
});

const option = computed(() => ({
  animation: false,
  grid: { top: 4, right: 4, bottom: 4, left: 4 },
  xAxis: {
    type: "category" as const,
    show: false,
    boundaryGap: false,
    data: datasets.value[0]?.data.map((_, i) => i) || [],
  },
  yAxis: {
    type: "value" as const,
    show: false,
    min: 0,
    max: props.maxValue ?? undefined,
  },
  series: datasets.value.map((d) => ({
    type: "line" as const,
    name: d.name,
    data: d.data,
    smooth: true,
    symbol: "none",
    lineStyle: { color: d.color, width: 1.5 },
    areaStyle: props.fillArea
      ? {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: (d.color || "#4a9eff") + "55" },
            { offset: 1, color: (d.color || "#4a9eff") + "05" },
          ]),
        }
      : undefined,
  })),
}));

function initChart() {
  if (!container.value) return;
  chart = echarts.init(container.value, null, { renderer: "canvas" });
  chart.setOption(option.value);
}

watch(
  () => props.data,
  () => {
    chart?.setOption(option.value, false, true);
  },
  { deep: true },
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
