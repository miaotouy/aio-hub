<script setup lang="ts">
import { computed, onMounted, ref, watch, onActivated } from "vue";
import {
  Activity,
  Zap,
  HardDrive,
  Cpu,
  Info,
  Tags,
  Eraser,
  RefreshCw,
  Database,
  ChevronRight,
  Coins,
} from "lucide-vue-next";
import { useBreakpoints, breakpointsTailwind } from "@vueuse/core";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { getPureModelId } from "../utils/kbUtils";
import TagPoolManager from "../components/TagPoolManager.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";

const store = useKnowledgeBaseStore();
const breakpoints = useBreakpoints(breakpointsTailwind);
const isMobile = breakpoints.smaller("lg");
const refreshing = ref(false);
const clearing = ref(false);

// 当前选中的模型 ComboID（格式：profileId:modelId）
const selectedComboId = ref("");
// 提取纯模型 ID（去掉渠道前缀）
const pureModelId = computed(() => getPureModelId(selectedComboId.value));

// 监听配置变化，同步默认模型
watch(
  () => store.config.defaultEmbeddingModel,
  (newModel) => {
    if (newModel) {
      selectedComboId.value = newModel;
    }
  },
  { immediate: true }
);

// 监听选中模型变化，自动刷新统计
watch(selectedComboId, async (newComboId) => {
  if (newComboId) {
    await refreshStats();
  }
});

async function refreshStats(force = false, silent = false) {
  if (!selectedComboId.value || refreshing.value) return;
  if (!silent) refreshing.value = true;
  try {
    // 统一调用 updateGlobalStats，内部会自动提取 pureId 并并行更新库和标签统计
    await store.updateGlobalStats(force, selectedComboId.value);
  } finally {
    if (!silent) refreshing.value = false;
  }
}

async function handleGlobalClear() {
  if (!selectedComboId.value) return;
  clearing.value = true;
  try {
    await store.clearAllOtherVectors();
    await refreshStats(true);
  } finally {
    clearing.value = false;
  }
}

onMounted(async () => {
  // 1. 如果 store 还没加载，先等待初始化（防止直接刷新页面导致配置为空）
  if (store.bases.length === 0) {
    await store.init();
  }

  // 2. 确保初始化时有值
  if (!selectedComboId.value && store.config.defaultEmbeddingModel) {
    selectedComboId.value = store.config.defaultEmbeddingModel;
  }

  // 3. 强制刷新一次统计数据
  await refreshStats(true);
});

// 当组件被 keep-alive 激活时，静默刷新数据
onActivated(async () => {
  if (selectedComboId.value) {
    await refreshStats(false, true);
  }
});

const totalEntries = computed(() => {
  return store.globalStats.totalEntries;
});

const vectorizedEntries = computed(() => {
  return store.globalStats.vectorizedEntries;
});

const totalTokens = computed(() => {
  return store.globalStats.totalTokens;
});

const progress = computed(() => {
  if (totalEntries.value === 0) return 0;
  const rate = Math.round((vectorizedEntries.value / totalEntries.value) * 100);
  return Math.min(rate, 100);
});

const tagProgress = computed(() => {
  if (store.globalStats.totalTags === 0) return 0;
  const rate = Math.round((store.globalStats.vectorizedTags / store.globalStats.totalTags) * 100);
  return Math.min(rate, 100);
});

function formatTokens(tokens: number) {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return (tokens / 1000).toFixed(1) + "k";
  return (tokens / 1000000).toFixed(2) + "m";
}

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getBaseProgress(baseId: string): number {
  const stats = store.globalStats.basesStats[baseId];
  if (!stats || stats.total === 0) return 0;
  return Math.round((stats.vectorized / stats.total) * 100);
}
</script>

<template>
  <div class="monitor-view">
    <div class="monitor-container" :class="{ 'is-mobile': isMobile }">
      <!-- 桌面端侧边栏 -->
      <aside v-if="!isMobile" class="stats-sidebar">
        <div class="sidebar-section model-selector-section">
          <div class="section-title">
            <span>向量模型</span>
            <div class="title-actions">
              <el-tooltip content="刷新统计" placement="top">
                <el-button
                  link
                  :icon="RefreshCw"
                  @click="refreshStats(true)"
                  :loading="refreshing"
                />
              </el-tooltip>
              <el-tooltip content="一键清理其它模型向量" placement="top">
                <el-button
                  link
                  type="warning"
                  :icon="Eraser"
                  @click="handleGlobalClear"
                  :loading="clearing"
                />
              </el-tooltip>
            </div>
          </div>
          <LlmModelSelector
            v-model="selectedComboId"
            :capabilities="{ embedding: true }"
            placeholder="选择 Embedding 模型"
            :clearable="false"
            class="model-selector"
          />
        </div>

        <div class="sidebar-section">
          <div class="section-title">系统概览</div>
          <div class="stats-list">
            <div class="stat-item">
              <div class="stat-icon"><Info :size="16" /></div>
              <div class="stat-content">
                <div class="stat-label">知识库总数</div>
                <div class="stat-value">{{ store.bases.length }}</div>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-icon"><Cpu :size="16" /></div>
              <div class="stat-content">
                <div class="stat-label">总条目数</div>
                <div class="stat-value">{{ totalEntries }}</div>
              </div>
            </div>
            <div class="stat-item has-progress">
              <div class="stat-main">
                <div class="stat-icon"><Zap :size="16" /></div>
                <div class="stat-content">
                  <div class="stat-label">条目向量化率</div>
                  <div class="stat-value">{{ progress }}%</div>
                </div>
              </div>
              <el-progress
                :percentage="progress"
                :stroke-width="3"
                :show-text="false"
                status="warning"
                class="stat-progress"
              />
            </div>
            <div class="stat-item">
              <div class="stat-icon"><Coins :size="16" /></div>
              <div class="stat-content">
                <div class="stat-label">累计消耗 Tokens</div>
                <div class="stat-value">{{ formatTokens(totalTokens) }}</div>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-icon"><HardDrive :size="16" /></div>
              <div class="stat-content">
                <div class="stat-label">查询模型</div>
                <div class="stat-value model-name">
                  {{ pureModelId || "-" }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="section-title">标签池统计</div>
          <div class="stats-list">
            <div class="stat-item">
              <div class="stat-icon"><Tags :size="16" /></div>
              <div class="stat-content">
                <div class="stat-label">标签总数</div>
                <div class="stat-value">{{ store.globalStats.totalTags || 0 }}</div>
              </div>
            </div>
            <div class="stat-item has-progress">
              <div class="stat-main">
                <div class="stat-icon"><Zap :size="16" /></div>
                <div class="stat-content">
                  <div class="stat-label">标签向量化率</div>
                  <div class="stat-value">{{ tagProgress }}%</div>
                </div>
              </div>
              <el-progress
                :percentage="tagProgress"
                :stroke-width="3"
                :show-text="false"
                status="success"
                class="stat-progress"
              />
            </div>
            <div class="stat-item">
              <div class="stat-icon"><HardDrive :size="16" /></div>
              <div class="stat-content">
                <div class="stat-label">存储占用</div>
                <div class="stat-value">{{ formatSize(store.globalStats.tagPoolSize || 0) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="store.indexingProgress.isIndexing" class="sidebar-section">
          <div class="section-title">活跃任务</div>
          <div class="active-task-card">
            <div class="task-info">
              <span>向量同步中</span>
              <span>{{ store.indexingProgress.current }} / {{ store.indexingProgress.total }}</span>
            </div>
            <el-progress
              :percentage="
                Math.round((store.indexingProgress.current / store.indexingProgress.total) * 100)
              "
              :stroke-width="6"
              :status="store.indexingProgress.shouldStop ? 'exception' : 'warning'"
            />
            <div class="task-footer">
              <el-button
                v-if="!store.indexingProgress.shouldStop"
                size="small"
                type="danger"
                link
                @click="store.stopIndexing()"
              >
                停止任务
              </el-button>
              <span v-else class="stopping-text">正在停止...</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="main-content">
        <!-- 移动端顶部网格统计 -->
        <div v-if="isMobile" class="mobile-stats-grid">
          <div class="sidebar-section">
            <div class="section-title">系统概览</div>
            <div class="stats-grid-inner">
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><Activity :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">知识库</div>
                  <div class="stat-value">{{ store.bases.length }}</div>
                </div>
              </div>
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><Cpu :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">条目</div>
                  <div class="stat-value">{{ totalEntries }}</div>
                </div>
              </div>
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><Zap :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">向量</div>
                  <div class="stat-value">{{ progress }}%</div>
                </div>
              </div>
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><Coins :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">Tokens</div>
                  <div class="stat-value">{{ formatTokens(totalTokens) }}</div>
                </div>
              </div>
            </div>
            <div class="stat-item-full">
              <div class="stat-icon-mini"><HardDrive :size="14" /></div>
              <div class="stat-content">
                <div class="stat-label">查询模型</div>
                <div class="stat-value model-name">
                  {{ pureModelId || "-" }}
                </div>
              </div>
            </div>
          </div>

          <div class="sidebar-section">
            <div class="section-title">标签池</div>
            <div class="stats-grid-inner">
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><Activity :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">总数</div>
                  <div class="stat-value">{{ store.globalStats.totalTags || 0 }}</div>
                </div>
              </div>
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><Zap :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">向量</div>
                  <div class="stat-value">{{ tagProgress }}%</div>
                </div>
              </div>
              <div class="stat-item-mini">
                <div class="stat-icon-mini"><HardDrive :size="14" /></div>
                <div class="stat-content">
                  <div class="stat-label">占用</div>
                  <div class="stat-value">{{ formatSize(store.globalStats.tagPoolSize || 0) }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="store.indexingProgress.isIndexing" class="sidebar-section active-task-mini">
            <div class="section-title">索引中</div>
            <div class="task-info">
              <span>{{ store.indexingProgress.current }} / {{ store.indexingProgress.total }}</span>
            </div>
            <el-progress
              :percentage="
                Math.round((store.indexingProgress.current / store.indexingProgress.total) * 100)
              "
              :stroke-width="4"
              status="warning"
              :show-text="false"
            />
          </div>
        </div>

        <section class="monitor-section">
          <div class="section-title">知识库详情统计</div>
          <div class="kb-stats-list">
            <div v-for="base in store.bases" :key="base.id" class="kb-stat-card">
              <div class="kb-info">
                <div class="kb-name-row">
                  <Database :size="16" class="kb-icon" />
                  <span class="kb-name">{{ base.name }}</span>
                </div>
                <div class="kb-meta">
                  {{ base.entryCount }} 条目 ·
                  <template v-if="store.globalStats.basesStats[base.id]">
                    {{ store.globalStats.basesStats[base.id].vectorized }} 已向量化
                  </template>
                  <template v-else> - 已向量化 </template>
                </div>
              </div>
              <div class="kb-progress-box">
                <div class="progress-label">
                  <span>向量化进度</span>
                  <span>{{ getBaseProgress(base.id) }}%</span>
                </div>
                <el-progress
                  :percentage="getBaseProgress(base.id)"
                  :stroke-width="4"
                  :show-text="false"
                  status="warning"
                />
              </div>
              <ChevronRight :size="16" class="arrow-icon" />
            </div>
          </div>
        </section>

        <section class="monitor-section" style="margin-top: 32px">
          <div class="section-title">全局标签向量池 (Tag Pool)</div>
          <TagPoolManager :model-id="pureModelId" />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.monitor-view {
  height: 100%;
  display: flex;
  overflow: hidden;
}

.monitor-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.monitor-container.is-mobile {
  flex-direction: column;
  overflow-y: auto;
}

/* 侧边栏样式 */
.stats-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 12px 24px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: 1px solid var(--border-color);
  background: var(--el-bg-color);
}

/* 移动端统计网格 */
.mobile-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  width: 100%;
}

.stats-grid-inner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.stat-item-full .model-name {
  font-size: 14px;
  color: var(--el-color-primary);
  word-break: break-all;
  white-space: normal;
}

.sidebar-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.model-selector-section {
  background: var(--card-bg);
  border: 1px solid rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.2));
}

.model-selector {
  width: 100%;
}

.sidebar-section .section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-actions {
  display: flex;
  gap: 4px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-item.has-progress {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.stat-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
  line-height: 1.2;
}

.mobile-stats-grid .stat-value {
  font-size: 14px;
}

.stat-item-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.stat-icon-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.stat-item-full {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.model-name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-progress {
  margin-top: 4px;
}

.active-task-card {
  background: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.1));
  border: 1px solid rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 8px;
  padding: 12px;
}

.task-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-color-warning);
  font-weight: 500;
}

.task-footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;

  .stopping-text {
    font-size: 12px;
    color: var(--el-color-info);
    font-style: italic;
  }
}

/* 主内容区 */
.main-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
}

.is-mobile .main-content {
  overflow-y: visible;
  padding: 16px;
}

.monitor-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.monitor-section .section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 16px;
}

.kb-stats-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.kb-stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;
}

.kb-stat-card:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.kb-icon {
  color: var(--el-color-primary);
  opacity: 0.8;
}

.kb-info {
  flex: 1;
  min-width: 0;
}

.kb-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.kb-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.kb-progress-box {
  width: 100px;
  flex-shrink: 0;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
}

.arrow-icon {
  color: var(--el-text-color-placeholder);
}
</style>
