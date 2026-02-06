<script setup lang="ts">
import { ref, computed, watch, onActivated } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { getPureModelId } from "../utils/kbUtils";
import {
  Database,
  Tag,
  RefreshCw,
  HardDrive,
  Trash2,
  Zap,
  AlertCircle,
  Filter,
  ArrowDownWideNarrow,
  SortAsc,
  Search,
  Eraser,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const props = defineProps<{
  modelId: string;
}>();

const store = useKnowledgeBaseStore();
const { batchVectorizeTags } = useKnowledgeBase();
const loading = ref(false);
const clearing = ref(false);
const vectorizing = ref(false);
const clearingOthers = ref(false);

// 筛选状态：'all' | 'vectorized' | 'missing'
const filterStatus = ref<"all" | "vectorized" | "missing">("all");
// 排序状态：'usage' | 'name'
const sortType = ref<"usage" | "name">("usage");
// 搜索关键词
const searchKeyword = ref("");

// 监听选中模型变化，自动刷新统计
watch(
  () => props.modelId,
  (newModelId, oldModelId) => {
    // 只有当模型真正改变时才触发带 loading 的加载
    // 如果是 keep-alive 激活导致的 watch 触发，且 ID 没变，则跳过
    if (newModelId && newModelId !== oldModelId) {
      loadStats();
    }
  },
  { immediate: true }
);

// 当组件被 keep-alive 激活时，静默刷新数据
onActivated(() => {
  if (props.modelId) {
    loadStatsSilently();
  }
});

// 获取已向量化的标签集合 (用于快速判断状态)
const vectorizedTagsSet = ref(new Set<string>());

// 合并所有标签并计算显示列表
const allTagsWithStatus = computed(() => {
  const result: Array<{ tag: string; isVectorized: boolean; count: number }> = [];
  const allDiscovered = store.globalStats.allDiscoveredTags || [];
  const usageStats = store.globalStats.tagUsageStats || {};

  allDiscovered.forEach((tag) => {
    result.push({
      tag,
      isVectorized: vectorizedTagsSet.value.has(tag),
      count: usageStats[tag] || 0,
    });
  });

  // 根据排序类型进行排序
  return result.sort((a, b) => {
    if (sortType.value === "usage") {
      // 按使用量降序排列，使用量相同时按名称排序
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.tag.localeCompare(b.tag);
    } else {
      // 按名称升序排列
      return a.tag.localeCompare(b.tag);
    }
  });
});

// 根据筛选条件和搜索关键词过滤标签
const filteredTags = computed(() => {
  let result = allTagsWithStatus.value;

  // 按状态筛选
  if (filterStatus.value === "vectorized") {
    result = result.filter((item) => item.isVectorized);
  } else if (filterStatus.value === "missing") {
    result = result.filter((item) => !item.isVectorized);
  }

  // 按搜索关键词筛选
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase().trim();
    result = result.filter((item) => item.tag.toLowerCase().includes(keyword));
  }

  return result;
});

// 统计数量 (从全局 store 获取，保持单一真相来源)
const vectorizedCount = computed(() => store.globalStats.vectorizedTags);
// 注意：对于标签池展示，总数应该是所有库发现的标签总数
const totalCount = computed(() => store.globalStats.allDiscoveredTags.length);
const missingCount = computed(() => Math.max(0, totalCount.value - vectorizedCount.value));

// 暴露图标给模板
const Icons = {
  Zap,
  AlertCircle,
  Trash2,
  RefreshCw,
  Tag,
  HardDrive,
  Database,
  Filter,
  ArrowDownWideNarrow,
  SortAsc,
  Search,
  Eraser,
};

async function handleCopyTag(tag: string) {
  try {
    await writeText(tag);
    customMessage.success(`已复制: ${tag}`);
  } catch (e) {
    console.error("复制失败", e);
    customMessage.error("复制失败");
  }
}

async function loadStats() {
  if (!props.modelId || loading.value) return;
  loading.value = true;
  try {
    // 1. 触发 Store 更新全局统计数据，内部会自动提取 pureId
    await store.updateGlobalStats(false, props.modelId);

    // 2. 获取当前已向量化的标签列表
    const pureId = getPureModelId(props.modelId);
    const vectorizedTags = await invoke<string[]>("kb_list_all_tags", { modelId: pureId });
    vectorizedTagsSet.value = new Set(vectorizedTags);
  } catch (e) {
    console.error("加载标签池数据失败", e);
  } finally {
    loading.value = false;
  }
}

// 静默刷新：不显示 loading 状态，后台更新数据
async function loadStatsSilently() {
  if (!props.modelId || loading.value) return;
  try {
    // 1. 触发 Store 更新全局统计数据
    await store.updateGlobalStats(false, props.modelId);

    // 2. 获取当前已向量化的标签列表
    const pureId = getPureModelId(props.modelId);
    const vectorizedTags = await invoke<string[]>("kb_list_all_tags", { modelId: pureId });
    vectorizedTagsSet.value = new Set(vectorizedTags);
  } catch (e) {
    console.error("静默刷新标签池数据失败", e);
  }
}

async function handleBatchVectorize() {
  if (!props.modelId || missingCount.value === 0) return;

  vectorizing.value = true;
  try {
    const allKbIds = store.bases.map((b) => b.id);
    await batchVectorizeTags(allKbIds);
    customMessage.success("批量向量化完成");
    await loadStats();
  } catch (e) {
    console.error("批量向量化失败", e);
  } finally {
    vectorizing.value = false;
  }
}

async function handleClearPool() {
  if (!props.modelId) return;

  try {
    await ElMessageBox.confirm(
      "确定要清空当前选中模型的标签向量池吗？清空后需要重新向量化条目才能恢复标签语义能力。",
      "警告",
      {
        confirmButtonText: "确定清空",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    clearing.value = true;
    await invoke("kb_clear_tag_pool", { modelId: props.modelId });
    customMessage.success("标签池已清空");
    await loadStats();
  } catch (e) {
    if (e !== "cancel") {
      console.error("清空标签池失败", e);
      customMessage.error("操作失败");
    }
  } finally {
    clearing.value = false;
  }
}

async function handleClearOtherModels() {
  if (!props.modelId) return;

  try {
    await ElMessageBox.confirm(
      `确定要清除所有非当前选中模型（${getPureModelId(props.modelId)}）的标签向量池吗？此操作不可恢复。`,
      "警告",
      {
        confirmButtonText: "确定清除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    clearingOthers.value = true;

    // 调用后端命令一次性清除
    const clearedCount = await invoke<number>("kb_clear_other_tag_pools", {
      keepModelId: props.modelId,
    });

    customMessage.success(`已清除 ${clearedCount} 个非当前模型的标签池`);
    await loadStats();
  } catch (e) {
    if (e !== "cancel") {
      console.error("清除其他模型标签池失败", e);
      customMessage.error("操作失败");
    }
  } finally {
    clearingOthers.value = false;
  }
}
</script>

<template>
  <div class="tag-pool-manager">
    <div class="tag-pool-section">
      <div class="section-header">
        <div class="header-top">
          <h3>标签池</h3>
          <div class="header-actions">
            <el-button
              v-if="missingCount > 0"
              type="primary"
              size="small"
              :icon="Icons.Zap"
              @click="handleBatchVectorize"
              :loading="vectorizing || store.indexingProgress.isIndexing"
            >
              批量向量化
            </el-button>
            <el-tooltip content="清除非当前模型向量" placement="top">
              <el-button
                :icon="Icons.Eraser"
                circle
                size="small"
                type="warning"
                plain
                @click="handleClearOtherModels"
                :loading="clearingOthers"
              />
            </el-tooltip>
            <el-tooltip content="清空当前模型标签池" placement="top">
              <el-button
                :icon="Icons.Trash2"
                circle
                size="small"
                type="danger"
                plain
                @click="handleClearPool"
                :loading="clearing"
              />
            </el-tooltip>
            <el-tooltip content="刷新统计数据" placement="top">
              <el-button
                :icon="Icons.RefreshCw"
                circle
                size="small"
                @click="loadStats"
                :loading="loading"
              />
            </el-tooltip>
          </div>
        </div>

        <div class="header-controls">
          <div class="search-wrapper">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索标签..."
              :prefix-icon="Icons.Search"
              clearable
              size="small"
              class="search-input"
            />
          </div>

          <div class="filter-tabs">
            <el-button
              :type="filterStatus === 'all' ? 'primary' : ''"
              size="small"
              @click="filterStatus = 'all'"
              :plain="filterStatus !== 'all'"
            >
              全部 ({{ totalCount }})
            </el-button>
            <el-button
              :type="filterStatus === 'vectorized' ? 'primary' : ''"
              size="small"
              @click="filterStatus = 'vectorized'"
              :plain="filterStatus !== 'vectorized'"
            >
              已向量化 ({{ vectorizedCount }})
            </el-button>
            <el-button
              :type="filterStatus === 'missing' ? 'primary' : ''"
              size="small"
              @click="filterStatus = 'missing'"
              :plain="filterStatus !== 'missing'"
            >
              <component :is="Icons.AlertCircle" :size="14" style="margin-right: 4px" />
              未向量化 ({{ missingCount }})
            </el-button>
          </div>

          <div class="sort-options">
            <el-dropdown trigger="click" @command="(cmd: any) => (sortType = cmd)">
              <el-button size="small" text bg>
                <component
                  :is="sortType === 'usage' ? Icons.ArrowDownWideNarrow : Icons.SortAsc"
                  :size="14"
                  style="margin-right: 4px"
                />
                {{ sortType === "usage" ? "按使用量" : "按名称" }}
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="usage" :disabled="sortType === 'usage'">
                    <component :is="Icons.ArrowDownWideNarrow" :size="14" />
                    <span style="margin-left: 8px">按使用量排序</span>
                  </el-dropdown-item>
                  <el-dropdown-item command="name" :disabled="sortType === 'name'">
                    <component :is="Icons.SortAsc" :size="14" />
                    <span style="margin-left: 8px">按名称排序</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>

      <!-- 轻量级进度条：仅在索引时显示在头部下方 -->
      <div v-if="store.indexingProgress.isIndexing" class="header-progress">
        <el-progress
          :percentage="
            Math.round((store.indexingProgress.current / store.indexingProgress.total) * 100)
          "
          :stroke-width="4"
          :show-text="false"
          :status="store.indexingProgress.shouldStop ? 'exception' : 'warning'"
        />
        <div class="progress-info">
          <div class="info-left">
            正在处理: {{ store.indexingProgress.current }} / {{ store.indexingProgress.total }}
          </div>
          <div class="info-right">
            <el-button
              v-if="!store.indexingProgress.shouldStop"
              size="small"
              type="danger"
              link
              @click="store.stopIndexing()"
            >
              停止
            </el-button>
            <span v-else class="stopping-text">停止中...</span>
          </div>
        </div>
      </div>

      <div class="tag-cloud" v-if="filteredTags.length > 0">
        <div
          v-for="item in filteredTags"
          :key="item.tag"
          class="custom-tag"
          :class="{ 'is-vectorized': item.isVectorized, 'is-missing': !item.isVectorized }"
          @click="handleCopyTag(item.tag)"
          :title="`使用量: ${item.count} | 点击复制: ${item.tag}`"
        >
          <span class="tag-name">{{ item.tag }}</span>
          <span class="tag-count" v-if="item.count > 0">{{ item.count }}</span>
        </div>
      </div>
      <el-empty v-else description="暂无标签" :image-size="60" />
    </div>
  </div>
</template>

<style scoped>
.tag-pool-manager {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.search-wrapper {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.search-input {
  width: 100%;
  max-width: 280px;
  flex-shrink: 1;
}

@media (max-width: 768px) {
  .search-input {
    max-width: 200px;
  }
}

.tag-pool-section {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  position: relative;
  display: flex;
  flex-direction: column;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-tabs .el-button {
  font-size: 13px;
}

.sort-options {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .header-top {
    flex-wrap: wrap;
  }

  .header-controls {
    width: 100%;
  }

  .search-wrapper {
    order: -1;
    width: 100%;
    margin-bottom: 8px;
  }

  .search-input {
    max-width: 100%;
  }

  .filter-tabs {
    flex: 1;
  }

  .filter-tabs .el-button {
    font-size: 12px;
    padding: 5px 10px;
  }
}

.header-progress {
  margin-bottom: 12px;
  padding: 0 4px;
}

.progress-info {
  font-size: 11px;
  color: var(--el-color-warning);
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--el-font-family-mono);

  .info-right {
    display: flex;
    align-items: center;
    gap: 8px;

    .stopping-text {
      color: var(--el-color-info);
      font-style: italic;
    }
  }
}

.section-header {
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.model-selector-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  border: 1px solid rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  border-radius: 6px;
}

.selector-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.model-selector {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .section-header h3 {
    font-size: 13px;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .model-selector-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .selector-label {
    font-size: 12px;
  }
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  padding: 8px;
  /* 优化滚动性能 */
  will-change: transform;
  contain: layout style;
}
.custom-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  white-space: nowrap;
  user-select: none;
  /* CSS 优化：跳过视口外渲染 */
  content-visibility: auto;
  contain-intrinsic-size: 60px 26px;
}

.custom-tag.is-vectorized {
  background: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.08));
  color: var(--el-color-success);
  border-color: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.15));
}

.custom-tag.is-missing {
  background: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.08));
  color: var(--el-color-warning);
  border-color: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.15));
}

.custom-tag:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.custom-tag:active {
  transform: translateY(0) scale(0.95);
  filter: brightness(0.95);
}

.custom-tag.is-vectorized:hover {
  background: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.12));
  border-color: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.3));
}

.custom-tag.is-missing:hover {
  background: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.12));
  border-color: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.3));
}

.tag-count {
  font-size: 10px;
  opacity: 0.6;
  background: rgba(0, 0, 0, 0.1);
  padding: 0 4px;
  border-radius: 4px;
  min-width: 16px;
  text-align: center;
  font-family: var(--el-font-family-mono);
}

.is-vectorized .tag-count {
  background: rgba(var(--el-color-success-rgb), 0.15);
}

.is-missing .tag-count {
  background: rgba(var(--el-color-warning-rgb), 0.15);
}
</style>
