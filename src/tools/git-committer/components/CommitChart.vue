<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<template>
  <div class="chart-container" ref="chartRef">
    <div v-if="commits.length === 0" class="empty-tip">暂无统计数据</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import * as echarts from "echarts";

interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

const props = defineProps<{
  commits: GitCommit[];
}>();

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

// 获取 CSS 变量的真实颜色值
const getCssVar = (name: string) => {
  if (!chartRef.value) return "";
  return getComputedStyle(chartRef.value).getPropertyValue(name).trim();
};

// ===== 渲染 ECharts 柱状图 =====
const renderChart = () => {
  if (!chartRef.value) return;

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  if (props.commits.length === 0) {
    chartInstance.clear();
    return;
  }

  const primaryColor = getCssVar("--el-color-primary") || "#409eff";
  const primaryColorRgb = getCssVar("--el-color-primary-rgb") || "64, 158, 255";

  // 计算近 14 天的提交频次
  const toDayKey = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return toDayKey(d);
  }).reverse();

  const counts = days.map((day) => {
    return props.commits.filter((c) => {
      try {
        return toDayKey(new Date(c.date)) === day;
      } catch {
        return false;
      }
    }).length;
  });

  const option: echarts.EChartsOption = {
    grid: {
      top: 10,
      bottom: 20,
      left: 30,
      right: 10,
    },
    xAxis: {
      type: "category",
      data: days.map((d) => d.substring(5)), // 仅显示月-日
      axisTick: { show: false },
      axisLine: { lineStyle: { color: getCssVar("--border-color") } },
      axisLabel: {
        interval: 1,
        fontSize: 9,
        color: getCssVar("--el-text-color-secondary"),
      },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { fontSize: 9, color: getCssVar("--el-text-color-secondary") },
      splitLine: {
        lineStyle: { color: getCssVar("--border-color"), type: "dashed" },
      },
    },
    tooltip: {
      trigger: "axis",
      formatter: "{b}: {c} 次提交",
    },
    series: [
      {
        data: counts,
        type: "bar",
        barMaxWidth: 14,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: primaryColor },
            { offset: 1, color: `rgba(${primaryColorRgb}, 0.3)` },
          ]),
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  chartInstance.setOption(option);
};

// 监听数据变化，重新渲染
watch(
  () => props.commits,
  () => {
    nextTick(() => {
      renderChart();
    });
  },
  { deep: true }
);

onMounted(() => {
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => chartInstance?.resize());
    resizeObserver.observe(chartRef.value);
  }
  nextTick(() => {
    renderChart();
  });
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (chartInstance) {
    chartInstance.dispose();
  }
});
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.empty-tip {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
