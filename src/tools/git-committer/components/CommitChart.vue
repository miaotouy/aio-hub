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

// 获取 CSS 变量的真实颜色值
const getCssVar = (name: string) => {
  if (!chartRef.value) return "";
  return getComputedStyle(chartRef.value).getPropertyValue(name).trim();
};

// ===== 渲染 ECharts 柱状图 =====
const renderChart = () => {
  if (!chartRef.value || props.commits.length === 0) return;

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  const primaryColor = getCssVar("--el-color-primary") || "#409eff";
  const primaryColorRgb = getCssVar("--el-color-primary-rgb") || "64, 158, 255";

  // 计算近 14 天的提交频次
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  }).reverse();

  const counts = days.map((day) => {
    return props.commits.filter((c) => {
      try {
        return c.date.startsWith(day);
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
      axisLine: { lineStyle: { color: "var(--border-color)" } },
      axisLabel: { fontSize: 9, color: "var(--el-text-color-secondary)" },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { lineStyle: { color: "var(--border-color)" } },
      axisLabel: { fontSize: 9, color: "var(--el-text-color-secondary)" },
      splitLine: {
        lineStyle: { color: "var(--border-color)", type: "dashed" },
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
        barWidth: "60%",
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

// ===== 监听窗口大小变化，重绘图表 =====
const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
  nextTick(() => {
    renderChart();
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
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
