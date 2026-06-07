<template>
  <BaseDialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="模型元数据覆盖分析"
    width="90%"
    height="85vh"
    content-class="coverage-dialog-content"
    close-on-backdrop-click
    show-close-button
  >
    <template #content>
      <div v-if="isLoading" class="coverage-loading">
        <div class="loading-card">
          <el-progress
            type="dashboard"
            :percentage="progressPercent"
            :color="progressColors"
          />
          <div class="loading-text">{{ progressText }}</div>
        </div>
      </div>
      <div v-else class="coverage-analysis">
        <div class="coverage-stats-banner">
          <div class="coverage-stat">
            <span class="coverage-stat__label">总模型数</span>
            <strong>{{ coverageStats.total }}</strong>
          </div>
          <div class="coverage-stat">
            <span class="coverage-stat__label">已覆盖</span>
            <strong class="coverage-stat__matched">{{
              coverageStats.matched
            }}</strong>
          </div>
          <div class="coverage-stat">
            <span class="coverage-stat__label">未覆盖</span>
            <strong class="coverage-stat__unmatched">{{
              coverageStats.unmatched
            }}</strong>
          </div>
          <div class="coverage-progress">
            <div class="coverage-progress__label">
              覆盖率 {{ coverageStats.rate }}%
            </div>
            <el-progress
              :percentage="coverageStats.rate"
              :show-text="false"
              color="var(--el-color-success)"
            />
          </div>
        </div>

        <div class="coverage-toolbar">
          <el-input
            v-model="coverageSearchText"
            placeholder="搜索模型 ID、模型名称或渠道名称..."
            clearable
            class="coverage-search"
          />
          <el-select
            v-model="coverageStatusFilter"
            placeholder="匹配状态"
            class="coverage-filter"
          >
            <el-option label="全部状态" value="all" />
            <el-option label="仅已匹配" value="matched" />
            <el-option label="仅未匹配" value="unmatched" />
          </el-select>
          <el-select
            v-model="coverageProfileFilter"
            placeholder="渠道筛选"
            class="coverage-profile-filter"
          >
            <el-option label="全部渠道" value="all" />
            <el-option
              v-for="profile in coverageProfileOptions"
              :key="profile.id"
              :label="profile.name"
              :value="profile.id"
            />
          </el-select>
          <el-select
            v-model="coverageMatchTypeFilter"
            placeholder="属性覆盖"
            class="coverage-filter"
          >
            <el-option label="全部属性" value="all" />
            <el-option label="有图标" value="has-icon" />
            <el-option label="无图标（已匹配）" value="no-icon" />
            <el-option label="有能力标签" value="has-capabilities" />
            <el-option label="无能力（已匹配）" value="no-capabilities" />
          </el-select>
        </div>

        <div class="coverage-table-wrapper">
          <el-table
            :data="paginatedCoverageItems"
            height="calc(85vh - 260px)"
            class="coverage-table"
            :row-key="getCoverageRowKey"
            header-cell-class-name="table-header"
            :row-class-name="getCoverageRowClassName"
            @sort-change="handleSortChange"
          >
            <el-table-column
              label="渠道信息"
              min-width="120"
              prop="profileName"
              sortable="custom"
            >
              <template #default="{ row }">
                <div class="coverage-main-text">{{ row.profileName }}</div>
                <div class="coverage-sub-text">{{ row.profileType }}</div>
              </template>
            </el-table-column>

            <el-table-column
              label="模型信息"
              min-width="220"
              prop="modelName"
              sortable="custom"
            >
              <template #default="{ row }">
                <div class="coverage-main-text">{{ row.modelName }}</div>
                <div class="model-id-line">
                  <code>{{ row.modelId }}</code>
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="copyModelId(row.modelId)"
                  >
                    复制
                  </el-button>
                </div>
              </template>
            </el-table-column>

            <el-table-column
              label="规则合并链"
              min-width="300"
              prop="ruleChain"
              sortable="custom"
            >
              <template #default="{ row }">
                <RuleMergeChain
                  v-if="row.isMatched"
                  :contributions="row.ruleChain"
                  @edit="(rule: ModelMetadataRule) => $emit('edit-rule', rule)"
                />
                <el-tag v-else type="danger" effect="light">未匹配</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="最终图标" width="120" align="center">
              <template #default="{ row }">
                <DynamicIcon
                  v-if="row.finalProperties?.icon"
                  class="coverage-icon-preview"
                  :src="getDisplayIconPath(row.finalProperties.icon)"
                  :alt="row.modelName"
                />
                <span v-else class="no-icon">无图标</span>
              </template>
            </el-table-column>

            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button
                  type="primary"
                  size="small"
                  plain
                  @click="createCoverageRule(row)"
                >
                  新建规则
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="coverage-pagination">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[20, 50, 100]"
            :total="filteredCoverageItems.length"
            layout="total, sizes, prev, pager, next"
            background
          />
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { merge } from "lodash-es";
import { customMessage } from "@/utils/customMessage";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  ModelMetadataRule,
  ModelMetadataProperties,
} from "@/types/model-metadata";
import type { CoverageItem } from "../utils/coverageAnalysis";
import {
  getMatchedRuleChainWithSortedRules,
  buildRuleContributions,
  recommendGroupForProfile,
} from "../utils/coverageAnalysis";
import RuleMergeChain from "./RuleMergeChain.vue";
import DynamicIcon from "@components/common/DynamicIcon.vue";

const props = defineProps<{
  modelValue: boolean;
  profiles: LlmProfile[];
  rules: ModelMetadataRule[];
  getDisplayIconPath: (path: string) => string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "edit-rule", rule: ModelMetadataRule): void;
  (e: "create-rule", config: Partial<ModelMetadataRule>): void;
}>();

const coverageSearchText = ref("");
const coverageStatusFilter = ref<"all" | "matched" | "unmatched">("all");
const coverageProfileFilter = ref("all");
const coverageMatchTypeFilter = ref<
  "all" | "has-icon" | "no-icon" | "has-capabilities" | "no-capabilities"
>("all");
const sortField = ref<string | null>(null);
const sortOrder = ref<"ascending" | "descending" | null>(null);
const isLoading = ref(false);
const progressPercent = ref(0);
const progressText = ref("");

const progressColors = [
  { color: "#f56c6c", percentage: 20 },
  { color: "#e6a23c", percentage: 40 },
  { color: "#5cb87a", percentage: 60 },
  { color: "#1989fa", percentage: 80 },
  { color: "#6f7ad3", percentage: 100 },
];

const coverageItems = ref<CoverageItem[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);

interface FlatModelItem {
  profile: LlmProfile;
  model: LlmProfile["models"][number];
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      isLoading.value = true;
      progressPercent.value = 0;
      progressText.value = "正在初始化分析...";
      coverageItems.value = [];
      currentPage.value = 1;

      // 收集所有需要计算的模型
      const flatModels: FlatModelItem[] = [];
      props.profiles.forEach((profile) => {
        profile.models.forEach((model) => {
          flatModels.push({ profile, model });
        });
      });

      if (flatModels.length === 0) {
        isLoading.value = false;
        return;
      }

      // 预先对规则进行过滤和排序，避免在循环中重复计算
      const sortedEnabledRules = props.rules
        .filter((r) => r.enabled !== false)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

      const chainCache = new Map<string, ModelMetadataRule[]>();
      const propertyCache = new Map<
        string,
        ModelMetadataProperties | undefined
      >();
      const results: CoverageItem[] = [];

      const batchSize = 30; // 每批处理 30 个模型
      let index = 0;

      const processBatch = () => {
        if (!props.modelValue) return; // 如果中途关闭了弹窗，停止计算

        const end = Math.min(index + batchSize, flatModels.length);
        progressText.value = `正在分析模型元数据 (${index}/${flatModels.length})...`;
        progressPercent.value = Math.round((index / flatModels.length) * 100);

        for (let i = index; i < end; i++) {
          const { profile, model } = flatModels[i];
          const modelProvider = model.provider;
          const cacheKey = `${model.id}|${modelProvider ?? ""}`;

          let ruleChain = chainCache.get(cacheKey);
          let finalProperties = propertyCache.get(cacheKey);

          if (!ruleChain) {
            ruleChain = getMatchedRuleChainWithSortedRules(
              sortedEnabledRules,
              model.id,
              modelProvider
            );
            chainCache.set(cacheKey, ruleChain);
            finalProperties =
              ruleChain.length > 0
                ? ruleChain.reduce(
                    (acc, rule) => merge(acc, rule.properties),
                    {} as ModelMetadataProperties
                  )
                : undefined;
            propertyCache.set(cacheKey, finalProperties);
          }

          results.push({
            profileId: profile.id,
            profileName: profile.name,
            profileType: profile.type,
            modelId: model.id,
            modelName: model.name || model.id,
            modelProvider,
            ruleChain: buildRuleContributions(ruleChain),
            finalProperties,
            isMatched: ruleChain.length > 0,
          });
        }

        index = end;

        if (index < flatModels.length) {
          // 使用 requestAnimationFrame 让出主线程，保持 UI 流畅
          requestAnimationFrame(processBatch);
        } else {
          coverageItems.value = results;
          progressPercent.value = 100;
          progressText.value = "分析完成";
          setTimeout(() => {
            isLoading.value = false;
          }, 200);
        }
      };

      // 延迟一帧开始，确保弹窗打开动画流畅
      requestAnimationFrame(processBatch);
    } else {
      coverageItems.value = [];
    }
  }
);

// 搜索或过滤改变时，重置页码
watch(
  [
    coverageSearchText,
    coverageStatusFilter,
    coverageProfileFilter,
    coverageMatchTypeFilter,
  ],
  () => {
    currentPage.value = 1;
  }
);

const coverageStats = computed(() => {
  const total = coverageItems.value.length;
  const matched = coverageItems.value.filter((item) => item.isMatched).length;
  const unmatched = total - matched;

  return {
    total,
    matched,
    unmatched,
    rate: total ? Math.round((matched / total) * 100) : 0,
  };
});

const coverageProfileOptions = computed(() =>
  props.profiles.filter((profile) => profile.models.length > 0)
);

const filteredCoverageItems = computed(() => {
  let result = coverageItems.value;

  if (coverageStatusFilter.value === "matched") {
    result = result.filter((item) => item.isMatched);
  } else if (coverageStatusFilter.value === "unmatched") {
    result = result.filter((item) => !item.isMatched);
  }

  if (coverageProfileFilter.value !== "all") {
    result = result.filter(
      (item) => item.profileId === coverageProfileFilter.value
    );
  }

  const search = coverageSearchText.value.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (item) =>
        item.modelId.toLowerCase().includes(search) ||
        item.modelName.toLowerCase().includes(search) ||
        item.profileName.toLowerCase().includes(search)
    );
  }

  // 匹配类型（属性覆盖）筛选
  const mtf = coverageMatchTypeFilter.value;
  if (mtf === "has-icon") {
    result = result.filter((item) => !!item.finalProperties?.icon);
  } else if (mtf === "no-icon") {
    result = result.filter(
      (item) => item.isMatched && !item.finalProperties?.icon
    );
  } else if (mtf === "has-capabilities") {
    result = result.filter((item) => {
      const caps = item.finalProperties?.capabilities as
        | Record<string, unknown>
        | undefined;
      return !!caps && Object.values(caps).some(Boolean);
    });
  } else if (mtf === "no-capabilities") {
    result = result.filter((item) => {
      if (!item.isMatched) return false;
      const caps = item.finalProperties?.capabilities as
        | Record<string, unknown>
        | undefined;
      return !caps || !Object.values(caps).some(Boolean);
    });
  }

  // 排序
  if (sortField.value && sortOrder.value) {
    const field = sortField.value;
    const asc = sortOrder.value === "ascending";
    result = [...result].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (field === "profileName") {
        av = a.profileName;
        bv = b.profileName;
      } else if (field === "modelName") {
        av = a.modelName;
        bv = b.modelName;
      } else if (field === "ruleChain") {
        av = a.ruleChain.length;
        bv = b.ruleChain.length;
      } else {
        return 0;
      }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
  }

  return result;
});

const paginatedCoverageItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredCoverageItems.value.slice(start, end);
});

function createCoverageRule(row: CoverageItem) {
  const recommendedGroup = recommendGroupForProfile(
    coverageItems.value,
    row.profileId
  );

  emit("create-rule", {
    matchType: "model",
    matchValue: row.modelId,
    properties: {
      group: recommendedGroup,
    },
    priority: 100,
    enabled: true,
    description: `为模型 ${row.modelName}（${row.profileName}）自动生成的匹配规则`,
  });
}

async function copyModelId(modelId: string) {
  try {
    await navigator.clipboard.writeText(modelId);
    customMessage.success("模型 ID 已复制");
  } catch (error) {
    customMessage.error("复制失败，请手动复制");
  }
}

function handleSortChange({
  prop,
  order,
}: {
  prop: string;
  order: "ascending" | "descending" | null;
}) {
  sortField.value = prop;
  sortOrder.value = order;
  currentPage.value = 1;
}

function getCoverageRowClassName({ row }: { row: CoverageItem }) {
  return row.isMatched ? "" : "coverage-row--unmatched";
}

function getCoverageRowKey(row: CoverageItem) {
  return `${row.profileId}:${row.modelId}`;
}
</script>

<style scoped>
:deep(.coverage-dialog-content) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.coverage-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  backdrop-filter: blur(var(--ui-blur));
  min-width: 280px;
}

.loading-text {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
}

.coverage-pagination {
  display: flex;
  justify-content: center;
  padding: 12px 0;
  margin-top: 10px;
  flex-shrink: 0;
  border-top: var(--border-width) solid var(--border-color);
}

.coverage-analysis {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}

.coverage-stats-banner {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr)) minmax(220px, 2fr);
  gap: 12px;
  padding: 12px;
  background-color: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.coverage-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coverage-stat__label,
.coverage-progress__label {
  font-size: 12px;
  color: var(--text-color-light);
}

.coverage-stat strong {
  font-size: 24px;
  line-height: 1;
}

.coverage-stat__matched {
  color: var(--el-color-success);
}

.coverage-stat__unmatched {
  color: var(--el-color-danger);
}

.coverage-progress {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.coverage-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
  padding: 10px;
  background-color: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.coverage-search {
  flex: 1;
  min-width: 240px;
}

.coverage-filter {
  width: 140px;
}

.coverage-profile-filter {
  width: 180px;
}

.coverage-table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.coverage-table {
  width: 100%;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: transparent;
}

.coverage-main-text {
  font-weight: 500;
  color: var(--text-color);
  line-height: 1.4;
}

.coverage-sub-text {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-color-light);
}

.model-id-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 2px;
}

.model-id-line code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  color: var(--text-color-light);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
}

.coverage-icon-preview {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: var(--border-width) solid var(--border-color);
}

:deep(.coverage-row--unmatched) {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

:deep(.table-header) {
  background-color: var(--sidebar-bg) !important;
  color: var(--text-color);
  font-weight: 600;
}

.no-icon {
  color: var(--text-color-light);
  font-style: italic;
}

@media (max-width: 900px) {
  .coverage-stats-banner {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}

@media (max-width: 640px) {
  .coverage-stats-banner {
    grid-template-columns: 1fr;
  }

  .coverage-search,
  .coverage-filter,
  .coverage-profile-filter {
    width: 100%;
    flex: none;
  }
}
</style>
