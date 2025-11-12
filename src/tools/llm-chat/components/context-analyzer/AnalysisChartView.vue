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
          <span>
            {{ chartMode === 'token'
              ? '以下图表展示了上下文各部分内容的 Token 占比分布。'
              : '以下图表展示了上下文各部分内容的字符数占比分布。'
            }}
          </span>
        </template>
      </el-alert>
    </div>

    <div ref="chartContainerRef" class="chart-container">
      <el-radio-group v-model="chartMode" size="small" class="mode-switch">
        <el-radio-button value="token">Token 占比</el-radio-button>
        <el-radio-button value="char">字符数占比</el-radio-button>
      </el-radio-group>
      <div ref="chartRef" class="chart"></div>
    </div>

    <div class="stats-detail">
      <InfoCard>
        <template #header>
          <div class="card-header">
            <span>详细统计</span>
            <el-tag v-if="contextData.statistics.tokenizerName" size="small" type="info">
              {{ contextData.statistics.isEstimated ? '估算' : '精确' }} - {{ contextData.statistics.tokenizerName }}
            </el-tag>
          </div>
        </template>
        <div class="stats-table">
          <div class="stats-row">
            <span class="stats-label">
              <span class="color-indicator" :style="{ backgroundColor: themeColors.primary }"></span>
              系统提示
            </span>
            <span class="stats-value">
              <template v-if="contextData.statistics.systemPromptTokenCount !== undefined">
                {{ contextData.statistics.systemPromptTokenCount.toLocaleString() }} tokens
                <span class="stats-percent">
                  ({{ getTokenPercentage(contextData.statistics.systemPromptTokenCount) }}%)
                </span>
                <span class="char-info">
                  {{ contextData.statistics.systemPromptCharCount.toLocaleString() }} 字符
                </span>
              </template>
              <template v-else>
                {{ contextData.statistics.systemPromptCharCount.toLocaleString() }} 字符
                <span class="stats-percent">
                  ({{ getPercentage(contextData.statistics.systemPromptCharCount) }}%)
                </span>
              </template>
            </span>
          </div>
          <div class="stats-row">
            <span class="stats-label">
              <span class="color-indicator" :style="{ backgroundColor: themeColors.warning }"></span>
              预设消息
            </span>
            <span class="stats-value">
              <template v-if="contextData.statistics.presetMessagesTokenCount !== undefined">
                {{ contextData.statistics.presetMessagesTokenCount.toLocaleString() }} tokens
                <span class="stats-percent">
                  ({{ getTokenPercentage(contextData.statistics.presetMessagesTokenCount) }}%)
                </span>
                <span class="char-info">
                  {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
                </span>
              </template>
              <template v-else>
                {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
                <span class="stats-percent">
                  ({{ getPercentage(contextData.statistics.presetMessagesCharCount) }}%)
                </span>
              </template>
            </span>
          </div>
          <div class="stats-row">
            <span class="stats-label">
              <span class="color-indicator" :style="{ backgroundColor: themeColors.success }"></span>
              会话历史
            </span>
            <span class="stats-value">
              <template v-if="contextData.statistics.chatHistoryTokenCount !== undefined">
                {{ contextData.statistics.chatHistoryTokenCount.toLocaleString() }} tokens
                <span class="stats-percent">
                  ({{ getTokenPercentage(contextData.statistics.chatHistoryTokenCount) }}%)
                </span>
                <span class="char-info">
                  {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
                </span>
              </template>
              <template v-else>
                {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
                <span class="stats-percent">
                  ({{ getPercentage(contextData.statistics.chatHistoryCharCount) }}%)
                </span>
              </template>
            </span>
          </div>
          <div class="stats-row total">
            <span class="stats-label">总计</span>
            <span class="stats-value">
              <template v-if="contextData.statistics.totalTokenCount !== undefined">
                {{ contextData.statistics.totalTokenCount.toLocaleString() }} tokens
                <span class="char-total">
                  {{ contextData.statistics.totalCharCount.toLocaleString() }} 字符
                </span>
              </template>
              <template v-else>
                {{ contextData.statistics.totalCharCount.toLocaleString() }} 字符
              </template>
            </span>
          </div>
        </div>
      </InfoCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import InfoCard from '@/components/common/InfoCard.vue';
import { useContextChart, type ChartMode } from '../../composables/useContextChart';
import type { ContextPreviewData } from '../../composables/useChatHandler';

const props = defineProps<{
  contextData: ContextPreviewData;
  isActive: boolean;
}>();

// 图表模式：token 或 char
const chartMode = ref<ChartMode>('token');

const { chartRef, drawChart, resizeChart, setupResizeObserver } = useContextChart(props.contextData, chartMode);

// 图表容器的父元素引用
const chartContainerRef = ref<HTMLDivElement>();

// 标记图表是否已初始化
const isChartInitialized = ref(false);

// 获取主题颜色
const themeColors = computed(() => {
  const root = getComputedStyle(document.documentElement);
  return {
    primary: root.getPropertyValue('--el-color-primary').trim() || '#409eff',
    warning: root.getPropertyValue('--el-color-warning').trim() || '#e6a23c',
    success: root.getPropertyValue('--el-color-success').trim() || '#67c23a',
  };
});

// 计算字符数百分比
const getPercentage = (value: number): string => {
  const total = props.contextData.statistics.totalCharCount;
  if (total === 0) return '0.0';
  return ((value / total) * 100).toFixed(1);
};

// 计算 token 百分比
const getTokenPercentage = (value: number): string => {
  const total = props.contextData.statistics.totalTokenCount;
  if (!total || total === 0) return '0.0';
  return ((value / total) * 100).toFixed(1);
};

// 初始化图表（仅在标签页激活时调用一次）
const initializeChart = () => {
  if (isChartInitialized.value) return;
  
  nextTick(() => {
    // 设置 ResizeObserver 监听容器尺寸变化
    if (chartContainerRef.value) {
      setupResizeObserver(chartContainerRef.value);
    }
    
    // 绘制图表
    drawChart();
    
    // 监听窗口大小变化
    window.addEventListener('resize', resizeChart);
    
    isChartInitialized.value = true;
  });
};

// 组件挂载后，如果已经激活则立即初始化
onMounted(() => {
  if (props.isActive) {
    initializeChart();
  }
});

// 监听标签页激活状态，首次激活时初始化图表
watch(
  () => props.isActive,
  (isActive) => {
    if (isActive && !isChartInitialized.value) {
      initializeChart();
    }
  }
);
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

.mode-switch {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  background-color: var(--el-bg-color-overlay);
  border-radius: 4px;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
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

.char-info {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 8px;
}

.char-total {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin-left: 8px;
}
</style>