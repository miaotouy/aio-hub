<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="model-metadata-settings">
    <div class="settings-header">
      <div class="settings-stats">
        <span>总配置: {{ configs.length }}</span>
        <span>已启用: {{ enabledCount }}</span>
        <span v-if="searchText || filterEnabled !== 'all'">
          当前显示: {{ filteredConfigs.length }}
        </span>
      </div>
      <div class="header-actions">
        <el-button @click="showPresets = true">查看预设</el-button>
        <el-button @click="coverageDialogVisible = true">覆盖分析</el-button>
        <el-button @click="handleImport">导入配置</el-button>
        <el-button @click="handleExport">导出配置</el-button>
        <el-badge
          :value="pendingUpdatesCount"
          :hidden="!pendingUpdatesCount"
          class="merge-badge"
        >
          <el-button
            @click="openCatalogUpdatePreview"
            :type="pendingUpdatesCount ? 'success' : ''"
            >查看目录更新</el-button
          >
        </el-badge>
        <el-button @click="openModelRefreshPreview">刷新模型配置</el-button>
        <el-button @click="handleReset" type="warning">重置为默认</el-button>
        <el-button @click="handleAdd" type="primary">添加配置</el-button>
      </div>
    </div>

    <!-- 更新提示横幅 -->
    <div v-if="pendingUpdatesCount && !bannerDismissed" class="update-banner">
      <div class="update-banner-content">
        <el-icon class="update-banner-icon"><RefreshCw /></el-icon>
        <span class="update-banner-text">
          有
          <strong>{{ pendingUpdatesCount }}</strong>
          条新的内置模型规则可用（随应用版本更新）
        </span>
        <el-button type="primary" size="small" @click="openCatalogUpdatePreview"
          >查看更新</el-button
        >
        <el-button size="small" text @click="dismissBanner">忽略</el-button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="search-box">
        <!-- 普通模式：搜索框 -->
        <el-input
          v-if="!testMode"
          v-model="searchText"
          @input="resetPage"
          placeholder="搜索配置（匹配值、类型、分组、描述）..."
          clearable
        />
        <!-- 测试模式：模型ID和Provider输入 -->
        <div v-else class="test-mode-inputs">
          <el-input
            v-model="testModelId"
            placeholder="输入模型 ID（如 gpt-4o, claude-3-opus）"
            clearable
            class="test-model-input"
          />
          <el-input
            v-model="testProvider"
            placeholder="Provider（可选，如 openai）"
            clearable
            class="test-provider-input"
          />
        </div>
      </div>

      <div class="toolbar-controls">
        <!-- 测试模式开关 -->
        <el-tooltip content="测试模式：输入模型ID查看匹配结果" placement="top">
          <el-switch
            v-model="testMode"
            active-text="测试"
            inactive-text=""
            class="test-mode-switch"
          />
        </el-tooltip>
        <el-select v-model="sortBy" placeholder="排序方式">
          <el-option label="按优先级排序" value="priority" />
          <el-option label="按类型排序" value="type" />
          <el-option label="按名称排序" value="name" />
          <el-option label="按创建时间排序" value="createdAt" />
        </el-select>

        <el-select
          v-model="filterEnabled"
          @change="resetPage"
          placeholder="筛选状态"
        >
          <el-option label="全部状态" value="all" />
          <el-option label="仅启用" value="enabled" />
          <el-option label="仅禁用" value="disabled" />
        </el-select>

        <el-radio-group v-model="viewMode" class="view-toggle">
          <el-radio-button value="grid" title="网格视图">
            <el-icon><Grid /></el-icon>
          </el-radio-button>
          <el-radio-button value="list" title="列表视图">
            <el-icon><List /></el-icon>
          </el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 测试模式结果面板 -->
    <div v-if="testMode" class="test-result-panel">
      <div class="test-result-header">
        <span class="test-result-title">🔍 匹配测试结果</span>
        <span v-if="testModelId" class="test-input-summary">
          模型: <code>{{ testModelId }}</code>
          <template v-if="testProvider">
            | Provider: <code>{{ testProvider }}</code></template
          >
        </span>
      </div>

      <div v-if="!testModelId" class="test-result-empty">
        请输入模型 ID 进行测试
      </div>

      <div v-else class="test-result-content">
        <!-- 匹配结果 -->
        <div class="result-section">
          <div class="result-label">匹配状态</div>
          <div class="result-value">
            <el-tag v-if="testMatchedRule" type="success" size="large">
              ✓ 已匹配
            </el-tag>
            <el-tag v-else type="danger" size="large"> ✗ 未匹配 </el-tag>
          </div>
        </div>

        <!-- 匹配到的规则 -->
        <template v-if="testMatchedRule">
          <div class="result-section">
            <div class="result-label">匹配规则</div>
            <div class="result-value matched-rule">
              <div class="rule-info">
                <el-tag
                  :type="getMatchTypeTagType(testMatchedRule.matchType)"
                  >{{ getMatchTypeLabel(testMatchedRule.matchType) }}</el-tag
                >
                <el-tag
                  v-if="testMatchedRule.matchType === 'modelRegex'"
                  type="success"
                  effect="light"
                  >RegEx</el-tag
                >
                <code class="rule-match-value">{{
                  testMatchedRule.matchValue
                }}</code>
              </div>
              <div class="rule-meta">
                <span>优先级: {{ testMatchedRule.priority || 0 }}</span>
                <span>ID: {{ testMatchedRule.id }}</span>
              </div>
            </div>
          </div>

          <div class="result-section">
            <div class="result-label">图标路径</div>
            <div class="result-value">
              <code class="icon-path">{{
                testMatchedRule.properties?.icon || "无"
              }}</code>
            </div>
          </div>

          <div class="result-section">
            <div class="result-label">图标预览</div>
            <div class="result-value">
              <DynamicIcon
                v-if="testMatchedRule.properties?.icon"
                class="test-icon-preview"
                :src="getDisplayIconPath(testMatchedRule.properties.icon)"
                :alt="testModelId"
              />
              <span v-else class="no-icon">无图标</span>
            </div>
          </div>

          <div v-if="testMatchedRule.properties?.group" class="result-section">
            <div class="result-label">分组名称</div>
            <div class="result-value">
              <el-tag>{{ testMatchedRule.properties.group }}</el-tag>
            </div>
          </div>

          <div v-if="testMatchedRule.description" class="result-section">
            <div class="result-label">规则描述</div>
            <div class="result-value">{{ testMatchedRule.description }}</div>
          </div>
        </template>

        <!-- 未匹配时的调试信息 -->
        <template v-else>
          <div class="result-section">
            <div class="result-label">可能的原因</div>
            <div class="result-value debug-hints">
              <ul>
                <li>没有匹配此模型 ID 的规则</li>
                <li>匹配规则可能被禁用了</li>
                <li>检查规则的 matchType 和 matchValue 是否正确</li>
                <li v-if="testProvider">
                  如果是 provider 匹配，确认 provider 值正确
                </li>
              </ul>
            </div>
          </div>

          <div class="result-section">
            <div class="result-label">候选规则（按优先级）</div>
            <div class="result-value candidate-rules">
              <div
                v-for="rule in candidateRules"
                :key="rule.id"
                class="candidate-rule"
              >
                <div class="candidate-main">
                  <el-tag
                    :type="getMatchTypeTagType(rule.matchType)"
                    size="small"
                    >{{ getMatchTypeLabel(rule.matchType) }}</el-tag
                  >
                  <code>{{ rule.matchValue }}</code>
                  <el-tag v-if="rule.enabled === false" type="info" size="small"
                    >禁用</el-tag
                  >
                </div>
                <div class="candidate-meta">
                  优先级: {{ rule.priority || 0 }}
                </div>
              </div>
              <div v-if="candidateRules.length === 0" class="no-candidates">
                没有相关的候选规则
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 配置列表 -->
    <div v-if="paginatedConfigs.length > 0" class="configs-container">
      <div class="configs-scroll-area">
        <div
          class="configs-list"
          :class="{
            'grid-view': viewMode === 'grid',
            'list-view': viewMode === 'list',
          }"
        >
          <ModelMetadataConfigCard
            v-for="config in paginatedConfigs"
            :key="config.id"
            :config="config"
            :view-mode="viewMode"
            @toggle="toggleConfig"
            @edit="handleEdit"
            @delete="handleDelete"
            @restore="handleRestoreBuiltin"
          />
        </div>
      </div>

      <!-- 固定分页 -->
      <div v-if="sortedConfigs.length > pageSize" class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[12, 24, 48, 96]"
          :total="sortedConfigs.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
          hide-on-single-page
          @size-change="resetPage"
        />
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-text">
        {{ searchText ? "未找到匹配的配置" : "暂无配置" }}
      </div>
      <el-button v-if="!searchText" @click="handleAdd" type="primary"
        >添加第一个配置</el-button
      >
    </div>

    <!-- 预设图标对话框 -->
    <BaseDialog v-model="showPresets" title="预设图标" width="80%">
      <template #content>
        <IconPresetSelector
          :icons="presetIcons"
          :get-icon-path="(path) => path"
          show-search
          show-categories
          @select="selectPreset"
        />
      </template>
    </BaseDialog>

    <!-- 覆盖分析对话框 -->
    <CoverageAnalysisDialog
      v-model="coverageDialogVisible"
      :profiles="profiles"
      :rules="configs"
      :get-display-icon-path="getDisplayIconPath"
      @edit-rule="(rule: ModelMetadataRule) => handleEdit(rule)"
      @create-rule="handleCoverageCreateRule"
    />

    <ModelMetadataCatalogUpdateDialog
      v-model="catalogUpdateDialogVisible"
      :diffs="catalogUpdateDiffs"
      @apply="handleApplyCatalogUpdate"
    />

    <ModelMetadataRefreshPreviewDialog
      v-model="modelRefreshDialogVisible"
      :items="modelRefreshPreviewItems"
      @apply="handleApplyModelRefresh"
    />

    <BaseDialog
      :model-value="Boolean(importPreview)"
      title="导入配置预览"
      width="min(680px, 92vw)"
      @update:model-value="closeImportPreview"
    >
      <template #content>
        <div v-if="importPreview" class="import-preview">
          <p>
            检测到 {{ importPreview.sourceRuleCount }} 条内置基线规则和
            {{ importPreview.customRuleCount }}
            条自定义规则。确认后才会写入当前配置。
          </p>
          <div
            v-if="importPreview.diagnostics.length"
            class="import-diagnostics"
          >
            <p
              v-for="diagnostic in importPreview.diagnostics"
              :key="`${diagnostic.code}:${diagnostic.ruleId || ''}:${diagnostic.path || ''}`"
              :class="{ blocking: diagnostic.blocking }"
            >
              {{ diagnostic.blocking ? "阻塞：" : "提示："
              }}{{ diagnostic.message }}
            </p>
          </div>
          <p v-else class="import-ok">配置校验通过，可以导入。</p>
        </div>
      </template>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="closeImportPreview">取消</el-button>
          <el-button
            type="primary"
            :disabled="hasBlockingImportDiagnostics"
            @click="confirmImport"
          >
            确认导入
          </el-button>
        </div>
      </template>
    </BaseDialog>

    <!-- 编辑对话框 -->
    <ModelMetadataConfigEditor
      v-model="editingConfig"
      :is-new="isNewConfig"
      @save="handleSave"
      @close="closeEditor"
      @open-presets="showPresets = true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useModelMetadata } from "@composables/useModelMetadata";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type {
  ModelMetadataRule,
  MetadataMatchType,
} from "../../../types/model-metadata";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import type {
  CatalogUpdateSelection,
  ModelMetadataDiagnostic,
} from "@aiohub/model-metadata-core";
import ModelMetadataConfigEditor from "./components/ModelMetadataConfigEditor.vue";
import ModelMetadataConfigCard from "./components/ModelMetadataConfigCard.vue";
import CoverageAnalysisDialog from "./components/CoverageAnalysisDialog.vue";
import ModelMetadataCatalogUpdateDialog from "./components/ModelMetadataCatalogUpdateDialog.vue";
import ModelMetadataRefreshPreviewDialog, {
  type ModelMetadataRefreshPreviewItem,
} from "./components/ModelMetadataRefreshPreviewDialog.vue";
import IconPresetSelector from "@components/common/IconPresetSelector.vue";
import { Grid, List } from "@element-plus/icons-vue";
import { RefreshCw } from "lucide-vue-next";

const {
  rules: configs,
  presetIcons,
  enabledCount,
  catalogDiffs,
  pendingUpdatesCount,
  addRule: addConfig,
  updateRule: updateConfig,
  deleteRule: deleteConfig,
  restoreBuiltinRule,
  toggleRule: toggleConfig,
  resetToDefaults,
  applyCatalogUpdate,
  exportRules: exportConfigs,
  importStore,
  inspectImport,
  getMatchedRule,
  getDisplayIconPath,
  materializeModel,
} = useModelMetadata();

const { profiles, saveProfile } = useLlmProfiles();

const catalogUpdateDiffs = computed(() =>
  catalogDiffs.value.filter(
    (diff) => diff.status !== "unchanged" && diff.status !== "local"
  )
);

const showPresets = ref(false);
const editingConfig = ref<Partial<ModelMetadataRule> | null>(null);
const isNewConfig = ref(false);
const errorHandler = createModuleErrorHandler("Settings/ModelMetadataSettings");

// 搜索和过滤
const searchText = ref("");
const sortBy = ref<"priority" | "type" | "name" | "createdAt">("priority");
const filterEnabled = ref<"all" | "enabled" | "disabled">("all");
const currentPage = ref(1);
const pageSize = ref(12);
const viewMode = ref<"grid" | "list">("grid");

// 横幅忽略状态（本次会话内有效）
const bannerDismissed = ref(false);

// 测试模式
const testMode = ref(false);
const testModelId = ref("");
const testProvider = ref("");

// 覆盖分析
const coverageDialogVisible = ref(false);
const catalogUpdateDialogVisible = ref(false);
const modelRefreshDialogVisible = ref(false);
type RefreshPreviewItem = ModelMetadataRefreshPreviewItem & {
  updatedModel: LlmModelInfo;
};
const modelRefreshPreviewItems = ref<RefreshPreviewItem[]>([]);
const importPreview = ref<{
  candidate: unknown;
  sourceRuleCount: number;
  customRuleCount: number;
  diagnostics: ModelMetadataDiagnostic[];
} | null>(null);
const hasBlockingImportDiagnostics = computed(
  () =>
    importPreview.value?.diagnostics.some(
      (diagnostic) => diagnostic.blocking
    ) ?? false
);

// 测试匹配结果
const testMatchedRule = computed(() => {
  if (!testMode.value || !testModelId.value.trim()) return null;
  return getMatchedRule(
    testModelId.value.trim(),
    testProvider.value.trim() || undefined
  );
});

// 候选规则（用于调试未匹配情况）
const candidateRules = computed(() => {
  if (!testMode.value || !testModelId.value.trim()) return [];

  const searchLower = testModelId.value.toLowerCase();
  const providerLower = testProvider.value.toLowerCase();

  // 找出可能相关的规则（按优先级排序）
  return configs.value
    .filter((rule) => {
      // 包含搜索词的规则
      const matchValueLower = rule.matchValue.toLowerCase();
      return (
        matchValueLower.includes(searchLower) ||
        searchLower.includes(matchValueLower) ||
        (rule.matchType === "provider" &&
          providerLower.includes(matchValueLower))
      );
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 10); // 最多显示10条
});

// 过滤后的配置列表
const filteredConfigs = computed(() => {
  let result = [...configs.value];

  // 搜索过滤
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    result = result.filter(
      (config) =>
        config.matchValue.toLowerCase().includes(search) ||
        config.matchType.toLowerCase().includes(search) ||
        config.description?.toLowerCase().includes(search) ||
        config.properties?.group?.toLowerCase().includes(search)
    );
  }

  // 启用状态过滤
  if (filterEnabled.value === "enabled") {
    result = result.filter((config) => config.enabled !== false);
  } else if (filterEnabled.value === "disabled") {
    result = result.filter((config) => config.enabled === false);
  }

  return result;
});
// 排序后的配置列表
const sortedConfigs = computed(() => {
  const result = [...filteredConfigs.value];

  switch (sortBy.value) {
    case "priority":
      return result.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    case "type":
      return result.sort((a, b) => a.matchType.localeCompare(b.matchType));
    case "name":
      return result.sort((a, b) => a.matchValue.localeCompare(b.matchValue));
    case "createdAt":
      return result.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA; // 降序：新的在前
      });
    default:
      return result;
  }
});

// 分页
const paginatedConfigs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return sortedConfigs.value.slice(start, end);
});

// 重置到第一页（当搜索或过滤改变时）
function resetPage() {
  currentPage.value = 1;
}

// 获取匹配类型标签
function getMatchTypeLabel(type: MetadataMatchType): string {
  const labels: Record<MetadataMatchType, string> = {
    provider: "Provider",
    modelExact: "Model exact",
    modelPrefix: "Model prefix",
    modelContains: "Model contains",
    modelRegex: "Model RegEx",
  };
  return labels[type] || type;
}

// 获取匹配类型的标签类型
function getMatchTypeTagType(
  type: MetadataMatchType
): "" | "success" | "info" | "warning" | "danger" {
  const types: Record<
    MetadataMatchType,
    "" | "success" | "info" | "warning" | "danger"
  > = {
    provider: "",
    modelExact: "info",
    modelPrefix: "warning",
    modelContains: "success",
    modelRegex: "danger",
  };
  return types[type] || "";
}

// 选择预设图标
function selectPreset(preset: any) {
  if (editingConfig.value) {
    if (!editingConfig.value.properties) {
      editingConfig.value.properties = {};
    }
    editingConfig.value.properties.icon = preset.path;
  }
  showPresets.value = false; // Close dialog on selection
}

// 处理添加
function handleAdd() {
  isNewConfig.value = true;
  editingConfig.value = {
    matchType: "provider",
    matchValue: "",
    properties: {
      icon: "",
    },
    priority: 10,
    enabled: true,
    description: "",
  };
}

// 处理编辑
function handleEdit(config: ModelMetadataRule) {
  isNewConfig.value = false;
  editingConfig.value = { ...config };
}

function handleCoverageCreateRule(config: Partial<ModelMetadataRule>) {
  isNewConfig.value = true;
  editingConfig.value = config;
}

// 处理保存
async function handleSave() {
  if (!editingConfig.value) return;

  const config = editingConfig.value;

  // 验证必填字段
  if (!config.matchValue) {
    customMessage.warning("请填写匹配值");
    return;
  }

  let success = false;
  if (isNewConfig.value) {
    success = await addConfig(config as Omit<ModelMetadataRule, "id">);
  } else if (config.id) {
    success = await updateConfig(config.id, config);
  }

  if (success) {
    customMessage.success(isNewConfig.value ? "添加成功" : "保存成功");
    closeEditor();
  } else {
    customMessage.error("保存失败，请检查配置");
  }
}

// 处理删除
async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm("确定要删除这个配置吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });
    deleteConfig(id);
    customMessage.success("已删除配置");
  } catch (error) {
    // 取消删除
  }
}

async function handleRestoreBuiltin(id: string) {
  try {
    await ElMessageBox.confirm(
      "恢复后会移除该规则的本地覆盖，并重新使用当前内置目录值。",
      "恢复内置规则",
      {
        confirmButtonText: "恢复",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    if (await restoreBuiltinRule(id)) {
      customMessage.success("已恢复内置规则");
    }
  } catch {
    // 用户取消无需提示。
  }
}

// 关闭编辑器
function closeEditor() {
  editingConfig.value = null;
  isNewConfig.value = false;
}

// 处理重置
async function handleReset() {
  try {
    await ElMessageBox.confirm(
      "确定要重置为默认配置吗？这将清除所有自定义配置。",
      "警告",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    if (await resetToDefaults()) {
      customMessage.success("已重置为默认配置");
    } else {
      errorHandler.error(new Error("resetToDefaults 返回 false"), "重置失败");
    }
  } catch (error) {
    customMessage.info("操作已取消");
  }
}

// 查看并显式应用内置目录更新。目录更新不会自动刷新已保存模型。
function openCatalogUpdatePreview() {
  catalogUpdateDialogVisible.value = true;
}

async function handleApplyCatalogUpdate(selections: CatalogUpdateSelection[]) {
  const result = await applyCatalogUpdate(selections);
  if (!result) return;
  catalogUpdateDialogVisible.value = false;
  const retained = result.retainedAsCustomRuleIds.length;
  customMessage.success(
    retained
      ? `已应用目录更新，并保留 ${retained} 条规则为自定义规则`
      : `已应用 ${result.appliedRuleIds.length} 条目录更新`
  );
}

function openModelRefreshPreview() {
  const items: RefreshPreviewItem[] = [];
  for (const profile of profiles.value) {
    profile.models.forEach((model, modelIndex) => {
      if (model.metadataBinding?.mode !== "followSource") return;
      const materialized = materializeModel(model);
      if (materialized.changes.length === 0) return;
      items.push({
        key: `${profile.id}:${modelIndex}`,
        profileId: profile.id,
        profileName: profile.name,
        modelIndex,
        modelId: model.id,
        modelName: model.name,
        changes: materialized.changes,
        updatedModel: materialized.model,
      });
    });
  }
  modelRefreshPreviewItems.value = items;
  modelRefreshDialogVisible.value = true;
}

async function handleApplyModelRefresh(keys: string[]) {
  const selected = modelRefreshPreviewItems.value.filter((item) =>
    keys.includes(item.key)
  );
  const selectedByProfile = new Map<string, RefreshPreviewItem[]>();
  for (const item of selected) {
    const current = selectedByProfile.get(item.profileId) ?? [];
    current.push(item);
    selectedByProfile.set(item.profileId, current);
  }

  const savedProfileNames: string[] = [];
  const failedProfileNames: string[] = [];
  let savedModelCount = 0;
  for (const [profileId, items] of selectedByProfile) {
    const profile = profiles.value.find((item) => item.id === profileId);
    if (!profile) continue;
    const models = [...profile.models];
    for (const item of items) models[item.modelIndex] = item.updatedModel;
    const nextProfile: LlmProfile = { ...profile, models };
    try {
      await saveProfile(nextProfile);
      savedProfileNames.push(profile.name);
      savedModelCount += items.length;
    } catch {
      const profileIndex = profiles.value.findIndex(
        (item) => item.id === profile.id
      );
      if (profileIndex !== -1) profiles.value[profileIndex] = profile;
      failedProfileNames.push(profile.name);
    }
  }

  modelRefreshDialogVisible.value = false;
  if (savedProfileNames.length > 0) {
    customMessage.success(
      `成功刷新 ${savedModelCount} 个模型（${savedProfileNames.join("、")}）`
    );
  }
  if (failedProfileNames.length > 0) {
    customMessage.warning(
      `以下渠道未保存：${failedProfileNames.join("、")}。请检查配置后重试。`
    );
  }
}

// 处理导出
function handleExport() {
  const json = exportConfigs();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `model-icons-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 处理导入：先解析、校验和预览，确认后才持久化。
function handleImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const candidate = JSON.parse(await file.text()) as unknown;
      const inspected = inspectImport(candidate);
      importPreview.value = {
        candidate,
        sourceRuleCount: inspected.store?.sourceSnapshot.rules.length ?? 0,
        customRuleCount: inspected.store?.customRules.length ?? 0,
        diagnostics: inspected.diagnostics,
      };
    } catch {
      customMessage.error("导入文件不是有效的 JSON 配置");
    }
  };
  input.click();
}

function closeImportPreview() {
  importPreview.value = null;
}

async function confirmImport() {
  const preview = importPreview.value;
  if (!preview || hasBlockingImportDiagnostics.value) return;
  if (await importStore(preview.candidate)) {
    customMessage.success("配置已导入");
    closeImportPreview();
  } else {
    customMessage.error("导入失败，请检查配置诊断");
  }
}

// 忽略更新横幅（本次会话）
function dismissBanner() {
  bannerDismissed.value = true;
}
</script>

<style scoped>
.model-metadata-settings {
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  height: 100%;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
  padding: 8px 16px;
  background: var(--container-bg);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.settings-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.settings-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
}

/* 工具栏 */
.toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
  padding: 0.75rem;
  background: var(--container-bg);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.search-box {
  flex: 1;
  min-width: 200px;
}

.toolbar-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.el-select {
  width: 150px;
}

/* 测试模式输入框 */
.test-mode-inputs {
  display: flex;
  gap: 0.5rem;
  flex: 1;
}

.test-model-input {
  flex: 2;
}

.test-provider-input {
  flex: 1;
  max-width: 200px;
}

.test-mode-switch {
  margin-right: 0.5rem;
}

/* 测试结果面板 */
.test-result-panel {
  background: var(--container-bg);
  border: 2px solid var(--primary-color);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
  backdrop-filter: blur(var(--ui-blur));
}

.test-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: var(--border-width) solid var(--border-color);
}

.test-result-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--primary-color);
}

.test-input-summary {
  font-size: 0.9rem;
  color: var(--text-color-light);
}

.test-input-summary code {
  background: rgba(0, 0, 0, 0.2);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-family: "Consolas", "Monaco", monospace;
  color: var(--primary-color);
}

.test-result-empty {
  text-align: center;
  padding: 2rem;
  color: var(--text-color-light);
  font-size: 0.95rem;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.test-result-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.result-section {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.result-label {
  flex-shrink: 0;
  width: 100px;
  font-weight: 500;
  color: var(--text-color-light);
  padding-top: 0.25rem;
}

.result-value {
  flex: 1;
  min-width: 0;
}

.matched-rule {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.rule-match-value {
  font-family: "Consolas", "Monaco", monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.rule-meta {
  font-size: 0.85rem;
  color: var(--text-color-light);
  display: flex;
  gap: 1rem;
}

.icon-path {
  font-family: "Consolas", "Monaco", monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  word-break: break-all;
  display: block;
}

.test-icon-preview {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.no-icon {
  color: var(--text-color-light);
  font-style: italic;
}

.debug-hints {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.debug-hints ul {
  margin: 0;
  padding-left: 1.25rem;
}

.debug-hints li {
  margin: 0.25rem 0;
  color: var(--text-color);
  font-size: 0.9rem;
}

.candidate-rules {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.candidate-rule {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  font-size: 0.9rem;
}

.candidate-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.candidate-main code {
  font-family: "Consolas", "Monaco", monospace;
}

.candidate-meta {
  color: var(--text-color-light);
  font-size: 0.85rem;
}

.no-candidates {
  color: var(--text-color-light);
  font-style: italic;
  padding: 0.5rem;
}

/* 配置列表容器 */
.configs-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 可滚动区域 */
.configs-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 1rem;
}

/* 网格视图 */
.configs-list.grid-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.5rem;
  align-items: start;
}

/* 列表视图 */
.configs-list.list-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 分页样式 */
.pagination-container {
  display: flex;
  justify-content: center;
  padding: 1rem 0;
  margin-top: 0.5rem;
  flex-shrink: 0;
  border-top: var(--border-width) solid var(--border-color);
  background: var(--container-bg);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.el-button {
  margin-left: 0px;
}

/* 更新提示横幅 */
.update-banner {
  margin-bottom: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border: 1px solid rgba(var(--el-color-success-rgb), 0.3);
  border-radius: 8px;
  flex-shrink: 0;
  backdrop-filter: blur(var(--ui-blur));
}

.update-banner-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.update-banner-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
  color: var(--el-color-success);
}

.update-banner-text {
  flex: 1;
  font-size: 0.9rem;
  min-width: 200px;
}

/* 合并按钮徽章 */
.merge-badge {
  display: inline-flex;
}
</style>
