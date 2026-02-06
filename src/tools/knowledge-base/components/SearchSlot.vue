<template>
  <div class="search-slot">
    <div class="slot-header">
      <div class="engine-select-wrapper">
        <el-select v-model="engineId" placeholder="选择检索引擎" style="width: 100%">
          <template #prefix>
            <Icon :icon="activeEngine?.icon || 'lucide:cpu'" :width="16" :height="16" />
          </template>
          <el-option
            v-for="engine in kbStore.engines"
            :key="engine.id"
            :label="engine.name"
            :value="engine.id"
          >
            <div class="engine-option">
              <Icon :icon="engine.icon || 'lucide:cpu'" :width="16" :height="16" />
              <div class="engine-option-info">
                <div class="name">{{ engine.name }}</div>
                <div class="desc">{{ engine.description }}</div>
              </div>
            </div>
          </el-option>
        </el-select>
      </div>
      <el-button v-if="canRemove" type="danger" plain circle @click="$emit('remove')">
        <X :size="14" />
      </el-button>
    </div>

    <div class="slot-body custom-scrollbar">
      <VectorCoverageDialog ref="coverageDialog" />
      <VectorGenerationProgress ref="generationProgress" />

      <!-- 参数配置区 (可折叠) -->
      <div v-if="hasEngineParams" class="config-section">
        <div class="config-header" @click="configExpanded = !configExpanded">
          <Icon
            :icon="configExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            :width="14"
          />
          <span class="config-title">引擎参数</span>
          <div class="spacer"></div>
          <span class="config-hint">{{ configExpanded ? "收起" : "展开" }}</span>
        </div>

        <el-collapse-transition>
          <div v-show="configExpanded">
            <div class="config-body">
              <el-form label-position="top">
                <!-- 如果引擎需要嵌入模型，显式渲染模型选择器 -->
                <el-form-item v-if="activeEngine?.requiresEmbedding" label="EMBEDDING MODEL">
                  <LlmModelSelector
                    v-model="config.embeddingModel"
                    :capabilities="{ embedding: true }"
                    placeholder="选择 Embedding 模型"
                  />
                </el-form-item>

                <SettingListRenderer
                  v-model:settings="config"
                  :settings-context="displaySettings"
                  :items="activeEngine?.parameters || []"
                />
              </el-form>
            </div>
          </div>
        </el-collapse-transition>
      </div>

      <!-- 结果列表 -->
      <div v-loading="loading" element-loading-background="rgba(0, 0, 0, 0)" class="results-list">
        <template v-if="results.length > 0">
          <div
            v-for="(result, index) in results"
            :key="result.caiu.id"
            class="result-card"
            :class="{ 'is-shared': sharedResultIds.has(result.caiu.id) }"
            @click="$emit('select', result)"
          >
            <div class="result-header">
              <span class="rank">#{{ index + 1 }}</span>
              <span class="score">{{ result.score.toFixed(3) }}</span>
              <span v-if="sharedResultIds.has(result.caiu.id)" class="shared-tag">共同命中</span>
              <div class="spacer"></div>
              <el-tooltip content="查看完整详情" placement="top" :show-after="500">
                <ExternalLink :size="12" class="detail-icon" />
              </el-tooltip>
            </div>
            <div class="result-key">{{ result.caiu.key }}</div>
            <div class="result-content">{{ result.caiu.content.substring(0, 100) }}...</div>
          </div>
        </template>
        <el-empty v-else :description="loading ? '正在检索...' : '暂无结果'" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { X, ExternalLink } from "lucide-vue-next";
import { Icon } from "@iconify/vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeSearchManager } from "../composables/useKnowledgeSearchManager";
import { getPureModelId } from "../utils/kbUtils";
import { SearchResult } from "../types/search";
import VectorCoverageDialog from "./VectorCoverageDialog.vue";
import VectorGenerationProgress from "./VectorGenerationProgress.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";

const props = defineProps<{
  selectedKbIds: string[];
  canRemove: boolean;
  sharedResultIds: Set<string>;
  queryText: string;
  initialEngineId?: string;
  initialConfig?: any;
  initialResults?: SearchResult[];
}>();

const emit = defineEmits<{
  (e: "remove"): void;
  (e: "select", result: SearchResult): void;
  (e: "results-updated", results: SearchResult[]): void;
  (e: "update:engineId", val: string): void;
  (e: "update:config", val: any): void;
}>();

const kbStore = useKnowledgeBaseStore();
const { results, loading, search: _search } = useKnowledgeSearchManager();

// 初始化结果
if (props.initialResults && props.initialResults.length > 0) {
  results.value = [...props.initialResults];
}

const engineId = ref(props.initialEngineId || "keyword");
const coverageDialog = ref<any>(null);
const generationProgress = ref<any>(null);
const configExpanded = ref(true);

const config = ref<any>({
  embeddingModel:
    props.initialConfig?.embeddingModel ?? (kbStore.config.defaultEmbeddingModel || ""),
  ...(props.initialConfig || {}),
});

/**
 * 适配层：将平铺的 config 包装成符合设置项插值预期的结构
 * 许多引擎参数的 label 使用了 {{ localSettings.vectorIndex.xxx }}
 */
const displaySettings = computed(() => {
  return {
    ...kbStore.config, // 包含全局配置作为回退
    ...config.value,
    vectorIndex: {
      ...kbStore.config.vectorIndex,
      ...config.value, // 将平铺的参数映射到 vectorIndex 下供插值使用
    },
  };
});

const activeEngine = computed(() => kbStore.engines.find((e) => e.id === engineId.value));
const isVectorEngine = computed(() => activeEngine.value?.requiresEmbedding);
const hasEngineParams = computed(
  () => (activeEngine.value?.parameters?.length || 0) > 0 || activeEngine.value?.requiresEmbedding
);

// 监听模型变化，重置结果并同步到父组件
watch(
  () => config.value.embeddingModel,
  () => {
    results.value = [];
  }
);

watch(
  () => engineId.value,
  (val) => emit("update:engineId", val)
);

watch(config, (val) => emit("update:config", { ...val }), { deep: true });

async function search(query: string, options: { skipCoverageCheck?: boolean } = {}) {
  try {
    // 将 config 中的所有参数（除 embeddingModel 外）作为 extraFilters 传递
    // 注意：SettingListRenderer 可能会根据 modelPath 写入嵌套的 vectorIndex 对象
    const { embeddingModel, vectorIndex, ...otherParams } = config.value;
    const extraFilters = {
      ...otherParams,
      ...(vectorIndex || {}), // 拍平 vectorIndex
    };

    const searchResults = await _search({
      query,
      engineId: engineId.value,
      kbIds: props.selectedKbIds,
      embeddingModel,
      extraFilters,
      skipCoverageCheck: options.skipCoverageCheck,
      onCoverageRequired: async (data: any) => {
        const action = await coverageDialog.value.show([
          {
            modelName: getPureModelId(data.modelId),
            kbNames: props.selectedKbIds,
            missingEntries: data.missingEntries,
            missingMap: data.missingMap,
          },
        ]);
        if (action === "fill") {
          generationProgress.value.show(data.missingEntries);
        }
        return action;
      },
      onProgress: (current: number) => {
        generationProgress.value.update(current);
      },
    });

    if (searchResults) {
      emit("results-updated", searchResults);
    }
  } catch (error: any) {
    console.error(`[SearchSlot] 检索失败:`, error);
  }
}

defineExpose({
  search,
  config,
  isVectorEngine,
  selectedKbIds: props.selectedKbIds,
});
</script>

<style scoped>
.search-slot {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background-color: var(--card-bg);
  overflow: hidden;
  min-width: 320px;
  flex: 1;
}

.slot-header {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
}

.engine-select-wrapper {
  flex: 1;
}

.engine-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.engine-option-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.engine-option-info .name {
  font-weight: 600;
  font-size: 13px;
}

.engine-option-info .desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.slot-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-section {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  /* 移除 overflow: hidden 以免干扰 collapse 动画 */
  background-color: rgba(var(--el-text-color-placeholder-rgb), 0.02);
}

.config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  background-color: rgba(var(--el-color-primary-rgb), 0.03);
  border-radius: 8px;
  transition: background-color 0.2s;
}

.config-header:hover {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
}

.config-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.config-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.config-body {
  padding: 12px;
}

.config-body :deep(.el-form-item) {
  margin-bottom: 12px;
  padding-left: 0; /* 侧边栏内不需要额外的左缩进 */
}

.config-body :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.config-body :deep(.el-form-item__label) {
  padding-bottom: 4px !important;
  line-height: 1.2 !important;
  font-size: 11px !important;
  font-weight: bold !important;
  color: var(--el-text-color-secondary) !important;
  text-transform: uppercase;
}

.config-group-title {
  font-size: 11px;
  font-weight: bold;
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  opacity: 0.8;
}

.spacer {
  flex: 1;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.config-item .label {
  font-size: 11px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.info-icon {
  color: var(--el-text-color-placeholder);
  cursor: help;
}

.query-preview {
  padding: 10px;
  background-color: rgba(var(--el-color-primary-rgb), 0.02);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.query-preview .label {
  font-size: 11px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.query-preview .query-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
  word-break: break-word;
}

.query-placeholder {
  padding: 20px 0;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100px;
  position: relative;
}

:deep(.el-loading-mask) {
  border-radius: 8px;
  transition: all 0.3s;
}

.result-card {
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: rgba(var(--el-color-primary-rgb), 0.01);
}

.result-card:hover {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.03);
}

.result-card.is-shared {
  border-left: 3px solid var(--el-color-warning);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 11px;
}

.result-header .rank {
  font-weight: bold;
  color: var(--el-text-color-placeholder);
}

.result-header .score {
  color: var(--el-color-success);
  font-weight: bold;
}

.detail-icon {
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: opacity 0.2s;
}

.result-card:hover .detail-icon {
  opacity: 1;
}

.shared-tag {
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 10px;
}

.result-key {
  font-weight: bold;
  font-size: 13px;
  margin-bottom: 4px;
}

.result-content {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
