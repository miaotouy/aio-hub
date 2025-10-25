<template>
  <div class="analysis-chart-view">
    <div class="view-header">
      <el-alert
        title="内容占比分析"
        type="success"
        :closable="false"
        show-icon
      >
        <template #default>
          以下图表展示了上下文各部分内容的字符数占比分布。
        </template>
      </el-alert>
    </div>

    <div ref="chartContainerRef" class="chart-container">
      <div ref="chartRef" class="chart"></div>
    </div>

    <div class="stats-detail">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">详细统计</div>
        </template>
        <div class="stats-table">
          <div class="stats-row">
            <span class="stats-label">
              <span class="color-indicator" :style="{ backgroundColor: themeColors.primary }"></span>
              系统提示
            </span>
            <span class="stats-value">
              {{ contextData.statistics.systemPromptCharCount.toLocaleString() }} 字符
              <span class="stats-percent">
                ({{ getPercentage(contextData.statistics.systemPromptCharCount) }}%)
              </span>
            </span>
          </div>
          <div class="stats-row">
            <span class="stats-label">
              <span class="color-indicator" :style="{ backgroundColor: themeColors.warning }"></span>
              预设消息
            </span>
            <span class="stats-value">
              {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
              <span class="stats-percent">
                ({{ getPercentage(contextData.statistics.presetMessagesCharCount) }}%)
              </span>
            </span>
          </div>
          <div class="stats-row">
            <span class="stats-label">
              <span class="color-indicator" :style="{ backgroundColor: themeColors.success }"></span>
              会话历史
            </span>
            <span class="stats-value">
              {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
              <span class="stats-percent">
                ({{ getPercentage(contextData.statistics.chatHistoryCharCount) }}%)
              </span>
            </span>
          </div>
          <div class="stats-row total">
            <span class="stats-label">总计</span>
            <span class="stats-value">
              {{ contextData.statistics.totalCharCount.toLocaleString() }} 字符
            </span>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue';
import { useContextChart } from '../../composables/useContextChart';
import type { ContextPreviewData } from '../../composables/useChatHandler';

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const { chartRef, drawChart, resizeChart, setupResizeObserver } = useContextChart(props.contextData);

// 图表容器的父元素引用
const chartContainerRef = ref<HTMLDivElement>();

// 获取主题颜色
const themeColors = computed(() => {
  const root = getComputedStyle(document.documentElement);
  return {
    primary: root.getPropertyValue('--el-color-primary').trim() || '#409eff',
    warning: root.getPropertyValue('--el-color-warning').trim() || '#e6a23c',
    success: root.getPropertyValue('--el-color-success').trim() || '#67c23a',
  };
});

// 计算百分比
const getPercentage = (value: number): string => {
  const total = props.contextData.statistics.totalCharCount;
  if (total === 0) return '0.0';
  return ((value / total) * 100).toFixed(1);
};

// 组件挂载后设置观察器
onMounted(() => {
  nextTick(() => {
    // 设置 ResizeObserver 监听容器尺寸变化
    if (chartContainerRef.value) {
      setupResizeObserver(chartContainerRef.value);
    }
    
    // 尝试立即绘制（如果容器已有尺寸）
    drawChart();
    
    // 监听窗口大小变化
    window.addEventListener('resize', resizeChart);
  });
});
</script>

<style scoped>
.analysis-chart-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
  box-sizing: border-box;
}

.view-header {
  flex-shrink: 0;
}

.chart-container {
  flex: 1;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.chart {
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.stats-detail {
  flex-shrink: 0;
}

.card-header {
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.stats-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.stats-row.total {
  border-bottom: none;
  border-top: 2px solid var(--el-border-color);
  padding-top: 12px;
  font-weight: bold;
}

.stats-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.color-indicator {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.stats-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.stats-percent {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 4px;
}
</style>