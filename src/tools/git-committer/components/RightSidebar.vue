<template>
  <div class="git-committer-right-sidebar">
    <!-- 上半部分：简易 Commit 历史树 -->
    <div class="section-wrapper history-section">
      <div class="section-header">
        <History class="w-4 h-4 mr-1.5" />
        <span class="section-title">最近提交历史</span>
      </div>
      <div class="section-content">
        <div v-if="isLoadingHistory" class="loading-wrapper">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon>
          <span class="ml-2 text-xs text-secondary">正在加载历史...</span>
        </div>
        <div v-else-if="commits.length === 0" class="empty-tip">
          暂无提交记录
        </div>
        <div v-else class="commit-tree">
          <div
            v-for="(commit, index) in commits"
            :key="commit.hash"
            class="commit-node"
          >
            <!-- 连线 -->
            <div class="tree-line-wrapper">
              <div class="tree-dot" />
              <div v-if="index < commits.length - 1" class="tree-line" />
            </div>
            <!-- 提交内容 -->
            <div class="commit-info">
              <div class="commit-msg-row">
                <span class="commit-hash">{{
                  commit.hash.substring(0, 7)
                }}</span>
                <span class="commit-msg" :title="commit.message">{{
                  commit.message
                }}</span>
              </div>
              <div class="commit-meta-row">
                <span class="commit-author">{{ commit.author }}</span>
                <span class="commit-date">{{ formatTime(commit.date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 下半部分：提交统计图表 -->
    <div class="section-wrapper chart-section">
      <div class="section-header">
        <BarChart3 class="w-4 h-4 mr-1.5" />
        <span class="section-title">近 14 天提交频次</span>
      </div>
      <div class="section-content chart-content" ref="chartRef">
        <div v-if="commits.length === 0" class="empty-tip">暂无统计数据</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { History, BarChart3 } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import * as echarts from "echarts";
import { formatDistanceToNow, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  currentRepoPath,
  currentStatus,
} from "../composables/useGitCommitterState";

interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

const commits = ref<GitCommit[]>([]);
const isLoadingHistory = ref(false);
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

// ===== 加载 Commit 历史 =====
const loadHistory = async () => {
  if (!currentRepoPath.value || !currentStatus.value?.branch) {
    commits.value = [];
    return;
  }
  isLoadingHistory.value = true;
  try {
    const list = await invoke<GitCommit[]>("git_get_branch_commits", {
      path: currentRepoPath.value,
      branch: currentStatus.value.branch,
      limit: 20,
    });
    commits.value = list || [];
    nextTick(() => {
      renderChart();
    });
  } catch (e) {
    console.error("加载 Commit 历史失败", e);
    commits.value = [];
  } finally {
    isLoadingHistory.value = false;
  }
};

// 监听当前仓库或分支变化，重新加载历史
watch(
  [currentRepoPath, () => currentStatus.value?.branch],
  () => {
    loadHistory();
  },
  { immediate: true }
);

// 获取 CSS 变量的真实颜色值
const getCssVar = (name: string) => {
  if (!chartRef.value) return "";
  return getComputedStyle(chartRef.value).getPropertyValue(name).trim();
};

// ===== 渲染 ECharts 柱状图 =====
const renderChart = () => {
  if (!chartRef.value || commits.value.length === 0) return;

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
    return commits.value.filter((c) => {
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

// ===== 监听窗口大小变化，重绘图表 =====
const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  if (chartInstance) {
    chartInstance.dispose();
  }
});

// ===== 格式化时间 =====
const formatTime = (dateStr: string) => {
  try {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: zhCN,
    });
  } catch {
    return dateStr;
  }
};
</script>

<style scoped>
.git-committer-right-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--sidebar-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
  border-left: var(--border-width) solid var(--border-color);
}

.section-wrapper {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow: hidden;
}

.history-section {
  flex: 1;
  border-bottom: var(--border-width) solid var(--border-color);
}

.chart-section {
  height: 220px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.chart-content {
  width: 100%;
  height: 100%;
}

.loading-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-tip {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* Commit 历史树 */
.commit-tree {
  display: flex;
  flex-direction: column;
}

.commit-node {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 12px;
}

.tree-line-wrapper {
  width: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.tree-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  border: 2px solid var(--card-bg);
  z-index: 2;
  margin-top: 4px;
}

.tree-line {
  width: 2px;
  flex: 1;
  background-color: var(--border-color);
  margin-top: -2px;
  margin-bottom: -12px;
}

.commit-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.commit-msg-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.commit-hash {
  font-family: monospace;
  font-size: 11px;
  color: var(--el-color-primary);
  font-weight: bold;
  flex-shrink: 0;
}

.commit-msg {
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.commit-author {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.commit-date {
  flex-shrink: 0;
}
</style>
