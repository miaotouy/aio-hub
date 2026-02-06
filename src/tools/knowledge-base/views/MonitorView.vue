<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from "vue";
import { useVirtualList } from "@vueuse/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  Trash2,
  Download,
  FileText,
  Search,
  Pause,
  Play,
  BarChart3,
  Filter,
  Code,
  Activity,
  Zap,
  Layers,
} from "lucide-vue-next";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKbMonitor } from "../composables/useKbMonitor";
import KbLogCard from "../components/monitor/KbLogCard.vue";
import RagTraceContent from "../components/monitor/RagTraceContent.vue";
import IndexTraceContent from "../components/monitor/IndexTraceContent.vue";
import type { RagPayload, IndexPayload } from "../types/monitor";

const store = useKnowledgeBaseStore();
const monitor = useKbMonitor();
const errorHandler = createModuleErrorHandler("kb-monitor-view");

// 过滤状态
const levelFilter = ref<string | null>(null);
const typeFilter = ref<string | null>(null);
const showStatsDrawer = ref(false);

const filteredLogs = computed(() => {
  let result = store.monitor.logs;

  if (store.monitor.filter.keyword) {
    const kw = store.monitor.filter.keyword.toLowerCase();
    result = result.filter(
      (log) =>
        log.title.toLowerCase().includes(kw) ||
        log.summary.toLowerCase().includes(kw) ||
        log.module.toLowerCase().includes(kw)
    );
  }

  if (levelFilter.value) {
    result = result.filter((log) => log.level === levelFilter.value);
  }

  if (typeFilter.value) {
    result = result.filter((log) => log.type === typeFilter.value);
  }

  return result;
});

const stats = computed(() => store.monitor.stats);

const activeFiltersCount = computed(() => {
  let count = 0;
  if (store.monitor.filter.keyword) count++;
  if (levelFilter.value) count++;
  if (typeFilter.value) count++;
  return count;
});

// 虚拟滚动 (使用 VueUse，更轻量且易于控制)
const {
  list: virtualList,
  containerProps,
  wrapperProps,
  scrollTo,
} = useVirtualList(filteredLogs, {
  itemHeight: 80,
  overscan: 10,
});

// 自动滚动到底部逻辑
watch(
  () => store.monitor.logs.length,
  () => {
    if (!store.monitor.isPaused && containerProps.ref.value) {
      const el = containerProps.ref.value;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
      if (isAtBottom) {
        nextTick(() => {
          scrollTo(filteredLogs.value.length - 1);
        });
      }
    }
  }
);

onMounted(() => {
  monitor.startListening();
});

onUnmounted(() => {
  monitor.stopListening();
});

function clearLogs() {
  monitor.clearLogs();
}

function togglePause() {
  store.monitor.isPaused = !store.monitor.isPaused;
}

function clearAllFilters() {
  store.monitor.filter.keyword = "";
  levelFilter.value = null;
  typeFilter.value = null;
}

function exportLogs(format: "json" | "md" = "json") {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    let blob: Blob;
    let fileName: string;

    if (format === "json") {
      const exportData = {
        version: "1.0.0",
        exportTime: new Date().toISOString(),
        filterCriteria: {
          keyword: store.monitor.filter.keyword,
          level: levelFilter.value,
          type: typeFilter.value,
        },
        logs: filteredLogs.value,
      };
      blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      fileName = `kb-monitor-export-${timestamp}.json`;
    } else {
      let md = `# 知识库监控日志导出\n\n`;
      md += `- 导出时间: ${new Date().toLocaleString()}\n`;
      md += `- 日志总数: ${filteredLogs.value.length}\n`;
      md += `- 过滤条件: 关键词="${store.monitor.filter.keyword || "无"}", 级别="${levelFilter.value || "全部"}", 类型="${typeFilter.value || "全部"}"\n\n`;
      md += `---\n\n`;

      filteredLogs.value.forEach((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        md += `### [${time}] [${log.level.toUpperCase()}] ${log.title}\n`;
        md += `- **类型**: ${log.type}\n`;
        md += `- **模块**: ${log.module}\n`;
        md += `- **摘要**: ${log.summary}\n\n`;

        if (log.payload) {
          md += `#### 详细数据\n\`\`\`json\n${JSON.stringify(log.payload, null, 2)}\n\`\`\`\n\n`;
        }
        md += `---\n\n`;
      });

      blob = new Blob([md], { type: "text/markdown" });
      fileName = `kb-monitor-export-${timestamp}.md`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    errorHandler.error(error, "导出日志失败");
  }
}
</script>

<template>
  <div class="monitor-view">
    <!-- 主面板 -->
    <div class="monitor-panel">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="status-badge" :class="{ paused: store.monitor.isPaused }">
            <div class="pulse-dot"></div>
            <span>{{ store.monitor.isPaused ? "已暂停" : "实时监控中" }}</span>
          </div>
          <div class="quick-stats">
            <span class="stat-item">{{ filteredLogs.length }} 条记录</span>
            <span class="stat-divider">·</span>
            <span class="stat-item">{{ stats.logsPerMinute }} LPM</span>
            <span class="stat-divider">·</span>
            <span class="stat-item" :class="{ 'has-error': stats.errorRate > 0 }">
              错误率 {{ (stats.errorRate * 100).toFixed(1) }}%
            </span>
          </div>
        </div>

        <div class="toolbar-right">
          <el-button size="small" :icon="BarChart3" @click="showStatsDrawer = true" text>
            统计
          </el-button>
          <el-button
            size="small"
            :icon="store.monitor.isPaused ? Play : Pause"
            @click="togglePause"
            :type="store.monitor.isPaused ? 'primary' : ''"
          >
            {{ store.monitor.isPaused ? "继续" : "暂停" }}
          </el-button>
          <el-button size="small" :icon="Trash2" @click="clearLogs">清空</el-button>
          <el-dropdown trigger="click" @command="exportLogs">
            <el-button size="small" :icon="Download">导出</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="json">
                  <Code :size="14" style="margin-right: 8px" />
                  JSON 格式
                </el-dropdown-item>
                <el-dropdown-item command="md">
                  <FileText :size="14" style="margin-right: 8px" />
                  Markdown 格式
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 过滤栏 -->
      <div class="filter-bar">
        <el-input
          v-model="store.monitor.filter.keyword"
          placeholder="搜索日志标题、摘要或模块..."
          size="small"
          clearable
          class="search-input"
        >
          <template #prefix>
            <Search :size="14" />
          </template>
        </el-input>

        <el-select
          v-model="levelFilter"
          placeholder="级别"
          size="small"
          clearable
          style="width: 100px"
        >
          <el-option label="信息" value="info" />
          <el-option label="成功" value="success" />
          <el-option label="警告" value="warn" />
          <el-option label="错误" value="error" />
        </el-select>

        <el-select
          v-model="typeFilter"
          placeholder="类型"
          size="small"
          clearable
          style="width: 100px"
        >
          <el-option label="RAG" value="RAG" />
          <el-option label="索引" value="Index" />
          <el-option label="系统" value="System" />
        </el-select>

        <div class="filter-actions">
          <el-badge :value="activeFiltersCount" :hidden="activeFiltersCount === 0" type="primary">
            <el-button
              size="small"
              :icon="Filter"
              :disabled="activeFiltersCount === 0"
              @click="clearAllFilters"
              text
            >
              清除过滤
            </el-button>
          </el-badge>
        </div>
      </div>

      <!-- 日志列表 -->
      <div class="log-list" v-bind="containerProps">
        <div v-bind="wrapperProps">
          <div v-for="item in virtualList" :key="item.data.id" class="log-item-wrapper">
            <KbLogCard :message="item.data">
              <template #content>
                <RagTraceContent
                  v-if="item.data.type === 'RAG'"
                  :payload="item.data.payload as RagPayload"
                />
                <IndexTraceContent
                  v-else-if="item.data.type === 'Index'"
                  :payload="item.data.payload as IndexPayload"
                />
              </template>
            </KbLogCard>
          </div>
        </div>

        <el-empty
          v-if="filteredLogs.length === 0"
          description="暂无符合条件的日志"
          :image-size="100"
          class="empty-state"
        />
      </div>
    </div>

    <!-- 统计抽屉 -->
    <el-drawer
      v-model="showStatsDrawer"
      title="监控数据概览"
      direction="rtl"
      size="400px"
      destroy-on-close
    >
      <div class="stats-drawer-content">
        <!-- 消息分布 -->
        <div class="stats-section">
          <div class="section-header">
            <Layers :size="16" />
            <span>消息类型分布</span>
          </div>
          <div class="distribution-list">
            <div v-for="(count, type) in stats.typeDistribution" :key="type" class="dist-item">
              <div class="dist-header">
                <span class="type-name">{{ type }}</span>
                <span class="type-count">{{ count }}</span>
              </div>
              <el-progress
                :percentage="
                  store.monitor.logs.length > 0 ? (count / store.monitor.logs.length) * 100 : 0
                "
                :stroke-width="6"
                :color="type === 'RAG' ? '#409eff' : type === 'Index' ? '#67c23a' : '#909399'"
              />
            </div>
          </div>
        </div>

        <!-- 性能指标 -->
        <div class="stats-section">
          <div class="section-header">
            <Zap :size="16" />
            <span>检索性能趋势</span>
          </div>
          <div class="perf-card">
            <div class="perf-main">
              <div class="perf-value">
                <span class="num">{{ Math.round(stats.avgRagDuration) }}</span>
                <span class="unit">ms</span>
              </div>
              <div class="perf-label">平均 RAG 耗时</div>
            </div>
            <div class="perf-chart">
              <div
                v-for="(dur, idx) in stats.ragDurationHistory"
                :key="idx"
                class="chart-bar"
                :style="{
                  height: `${Math.min(100, Math.max(15, (dur / (stats.avgRagDuration * 2 || 1000)) * 80))}%`,
                }"
                :title="`${dur}ms`"
              ></div>
            </div>
          </div>
        </div>

        <!-- 健康度 -->
        <div class="stats-section">
          <div class="section-header">
            <Activity :size="16" />
            <span>系统健康状态</span>
          </div>
          <div class="health-card">
            <el-progress
              type="dashboard"
              :percentage="Math.max(0, 100 - stats.errorRate * 100)"
              :width="120"
              :stroke-width="8"
              :color="
                stats.errorRate > 0.2 ? '#f56c6c' : stats.errorRate > 0.05 ? '#e6a23c' : '#67c23a'
              "
            >
              <template #default="{ percentage }">
                <div class="health-status">
                  <div
                    class="status-text"
                    :class="{
                      danger: stats.errorRate > 0.2,
                      warning: stats.errorRate > 0.05 && stats.errorRate <= 0.2,
                      success: stats.errorRate <= 0.05,
                    }"
                  >
                    {{
                      stats.errorRate > 0.2
                        ? "严重异常"
                        : stats.errorRate > 0.05
                          ? "亚健康"
                          : "运行良好"
                    }}
                  </div>
                  <div class="status-value">{{ percentage.toFixed(0) }}% 健康</div>
                </div>
              </template>
            </el-progress>
            <div class="health-info">
              <div class="info-item">
                <span class="label">当前错误率:</span>
                <span class="value">{{ (stats.errorRate * 100).toFixed(2) }}%</span>
              </div>
              <div class="info-item">
                <span class="label">日志吞吐量:</span>
                <span class="value">{{ stats.logsPerMinute }} LPM</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 系统信息 -->
        <div class="stats-section">
          <div class="section-header">
            <BarChart3 :size="16" />
            <span>运行配置信息</span>
          </div>
          <div class="info-list">
            <div class="info-row">
              <span class="info-label">最大日志容量:</span>
              <span class="info-value">{{ store.monitor.maxCapacity }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">已缓存日志:</span>
              <span class="info-value">{{ store.monitor.logs.length }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">最后心跳时间:</span>
              <span class="info-value">
                {{
                  stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleTimeString() : "尚未更新"
                }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.monitor-view {
  /* 彻底移除外层间距，融入上游 KnowledgeBase.vue 的容器 */
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.monitor-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow: hidden;
  box-sizing: border-box;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  /* 使用透明背景，利用上游容器的背景 */
  background: transparent;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 12px;
  background: rgba(var(--el-color-success-rgb), 0.1);
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-success);
  transition: all 0.3s ease;
}

.status-badge.paused {
  background: rgba(var(--el-text-color-secondary-rgb), 0.1);
  color: var(--el-text-color-secondary);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s ease-in-out infinite;
}

.status-badge.paused .pulse-dot {
  animation: none;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

.quick-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.stat-item {
  font-family: var(--el-font-family-mono);
}

.stat-item.has-error {
  color: var(--el-color-danger);
  font-weight: 600;
}

.stat-divider {
  color: var(--el-text-color-placeholder);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 过滤栏 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(var(--el-fill-color-light-rgb), 0.3);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

.filter-actions {
  margin-left: auto;
}

/* 日志列表 */
.log-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 16px;
}

.log-item-wrapper {
  margin-bottom: 8px;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 统计抽屉内容 */
.stats-drawer-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 16px;
}

.stats-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color-lighter);
}

.distribution-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dist-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dist-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.type-name {
  color: var(--el-text-color-regular);
}

.type-count {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.perf-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  background: rgba(var(--el-color-primary-rgb), 0.05);
  border-radius: 12px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.1);
}

.perf-main {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.perf-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.perf-value .num {
  font-size: 28px;
  font-weight: bold;
  font-family: var(--el-font-family-mono);
  color: var(--el-color-primary);
}

.perf-value .unit {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.perf-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.perf-chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 50px;
  width: 140px;
}

.chart-bar {
  flex: 1;
  background: var(--el-color-primary-light-7);
  border-radius: 2px;
  min-height: 4px;
  transition: height 0.3s ease;
}

.chart-bar:hover {
  background: var(--el-color-primary);
}

.health-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 20px;
  background: rgba(var(--el-bg-color-rgb), 0.5);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.health-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.status-text {
  font-size: 18px;
  font-weight: 600;
}

.status-text.success {
  color: var(--el-color-success);
}

.status-text.warning {
  color: var(--el-color-warning);
}

.status-text.danger {
  color: var(--el-color-danger);
}

.status-value {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.health-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.info-item .label {
  color: var(--el-text-color-secondary);
}

.info-item .value {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(var(--el-bg-color-rgb), 0.3);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.info-label {
  color: var(--el-text-color-secondary);
}

.info-value {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}
</style>
