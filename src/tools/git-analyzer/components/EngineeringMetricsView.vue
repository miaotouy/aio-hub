<template>
  <section class="engineering-view">
    <div class="coverage-row">
      <el-alert
        v-if="metrics.commitsWithStats < metrics.totalCommits"
        type="warning"
        :closable="false"
        show-icon
        :title="`行数统计已加载 ${metrics.commitsWithStats}/${metrics.totalCommits} 条提交；提交体积分布和总增删行数按已加载数据计算。`"
      >
        <template v-if="repositorySource === 'local'" #default>
          <el-button
            link
            type="primary"
            :loading="enriching"
            :disabled="loading || enriching"
            @click="$emit('enrich-data')"
          >
            补齐本地提交统计
          </el-button>
        </template>
      </el-alert>
      <el-alert
        v-if="metrics.commitsWithFiles < metrics.totalCommits"
        type="info"
        :closable="false"
        show-icon
        :title="fileCoverageMessage"
      />
    </div>

    <div class="metric-summary" v-if="metrics.commitsWithStats > 0">
      <div class="metric-value">
        <strong>{{ metrics.additions.toLocaleString() }}</strong>
        <span>新增行</span>
      </div>
      <div class="metric-value">
        <strong>{{ metrics.deletions.toLocaleString() }}</strong>
        <span>删除行</span>
      </div>
      <div class="metric-value">
        <strong>{{
          (metrics.additions + metrics.deletions).toLocaleString()
        }}</strong>
        <span>代码流动量</span>
      </div>
      <div class="metric-value">
        <strong
          >{{ metrics.commitsWithStats }}/{{ metrics.totalCommits }}</strong
        >
        <span>含行数统计</span>
      </div>
    </div>

    <el-row :gutter="12">
      <el-col :span="12">
        <InfoCard title="文件修改热点">
          <div ref="hotFilesChart" class="metric-chart"></div>
        </InfoCard>
      </el-col>
      <el-col :span="12">
        <InfoCard title="提交体积分布">
          <div ref="commitSizesChart" class="metric-chart"></div>
        </InfoCard>
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useDark } from "@vueuse/core";
import * as echarts from "echarts";
import InfoCard from "@/components/common/InfoCard.vue";
import {
  calculateEngineeringMetrics,
  escapeHtml,
} from "../composables/useGitProcessor";
import type { GitCommit } from "../types";

const props = defineProps<{
  commits: GitCommit[];
  repositorySource: "local" | "github";
  loading: boolean;
  enriching: boolean;
}>();

defineEmits<{ "enrich-data": [] }>();

const isDark = useDark();
const hotFilesChart = ref<HTMLElement>();
const commitSizesChart = ref<HTMLElement>();
const metrics = computed(() => calculateEngineeringMetrics(props.commits));
const fileCoverageMessage = computed(() =>
  props.repositorySource === "github"
    ? `完整文件明细 ${metrics.value.commitsWithFiles}/${metrics.value.totalCommits} 条，另有 ${metrics.value.commitsWithPartialFiles} 条仅加载了部分文件；公开仓库列表按需读取详情。`
    : `文件路径已加载 ${metrics.value.commitsWithFiles}/${metrics.value.totalCommits} 条提交；热点文件按已加载路径统计。`
);
let resizeObserver: ResizeObserver | null = null;

function getChartColors() {
  const root = getComputedStyle(document.documentElement);
  return {
    text: root.getPropertyValue("--text-color").trim(),
    muted: root.getPropertyValue("--text-color-light").trim(),
    border: root.getPropertyValue("--border-color").trim(),
    primary: root.getPropertyValue("--primary-color").trim(),
    background: root.getPropertyValue("--container-bg").trim(),
  };
}

function updateCharts() {
  const metricsValue = metrics.value;
  const colors = getChartColors();

  if (hotFilesChart.value) {
    const chart =
      echarts.getInstanceByDom(hotFilesChart.value) ??
      echarts.init(hotFilesChart.value);
    const files = [...metricsValue.hotFiles].reverse();
    chart.setOption(
      {
        textStyle: { color: colors.text },
        grid: { left: 16, right: 24, top: 12, bottom: 24, containLabel: true },
        xAxis: {
          type: "value",
          name: "提交次数",
          axisLabel: { color: colors.muted },
          splitLine: { lineStyle: { color: colors.border } },
        },
        yAxis: {
          type: "category",
          data: files.map((file) => file.path),
          axisLabel: { color: colors.muted, width: 190, overflow: "truncate" },
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: colors.background,
          formatter: (items: Array<{ dataIndex: number }>) => {
            const file = files[items[0]?.dataIndex];
            if (!file) return "";
            return `${escapeHtml(file.path)}<br/>修改 ${file.changes} 次`;
          },
        },
        series: [
          {
            type: "bar",
            data: files.map((file) => file.changes),
            itemStyle: { color: colors.primary, borderRadius: [0, 3, 3, 0] },
          },
        ],
      },
      { notMerge: true }
    );
  }

  if (commitSizesChart.value) {
    const chart =
      echarts.getInstanceByDom(commitSizesChart.value) ??
      echarts.init(commitSizesChart.value);
    chart.setOption(
      {
        textStyle: { color: colors.text },
        grid: { left: 16, right: 24, top: 12, bottom: 24, containLabel: true },
        xAxis: {
          type: "category",
          data: metricsValue.commitSizes.map((item) => item.label),
          axisLabel: { color: colors.muted, interval: 0, rotate: 18 },
          axisLine: { lineStyle: { color: colors.border } },
        },
        yAxis: {
          type: "value",
          name: "提交数",
          axisLabel: { color: colors.muted },
          splitLine: { lineStyle: { color: colors.border } },
        },
        tooltip: { trigger: "axis", backgroundColor: colors.background },
        series: [
          {
            type: "bar",
            data: metricsValue.commitSizes.map((item) => item.count),
            itemStyle: { color: colors.primary },
          },
        ],
      },
      { notMerge: true }
    );
  }
}

watch(
  () => props.commits,
  () => nextTick(updateCharts),
  { deep: true }
);
watch(isDark, () => nextTick(updateCharts));

onMounted(() => {
  nextTick(updateCharts);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      hotFilesChart.value &&
        echarts.getInstanceByDom(hotFilesChart.value)?.resize();
      commitSizesChart.value &&
        echarts.getInstanceByDom(commitSizesChart.value)?.resize();
    });
    hotFilesChart.value && resizeObserver.observe(hotFilesChart.value);
    commitSizesChart.value && resizeObserver.observe(commitSizesChart.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (hotFilesChart.value) {
    echarts.getInstanceByDom(hotFilesChart.value)?.dispose();
  }
  if (commitSizesChart.value) {
    echarts.getInstanceByDom(commitSizesChart.value)?.dispose();
  }
});
</script>

<style scoped>
.engineering-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 16px 0;
}

.coverage-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-block: 1px solid var(--border-color-light);
}

.metric-value {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
}

.metric-value + .metric-value {
  border-left: 1px solid var(--border-color-light);
}

.metric-value strong {
  font-size: 20px;
  color: var(--text-color);
}

.metric-value span {
  color: var(--text-color-light);
  font-size: 12px;
}

.metric-chart {
  height: 300px;
  min-height: 300px;
}

@media (max-width: 768px) {
  .metric-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-value:nth-child(3) {
    border-left: 0;
    border-top: 1px solid var(--border-color-light);
  }

  .metric-value:nth-child(4) {
    border-top: 1px solid var(--border-color-light);
  }
}
</style>
