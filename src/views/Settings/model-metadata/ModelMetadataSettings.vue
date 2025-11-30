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
        <el-button @click="handleImport">导入配置</el-button>
        <el-button @click="handleExport">导出配置</el-button>
        <el-button @click="handleMerge">合并最新配置</el-button>
        <el-button @click="handleReset" type="warning">重置为默认</el-button>
        <el-button @click="handleAdd" type="primary">添加配置</el-button>
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

        <el-select v-model="filterEnabled" @change="resetPage" placeholder="筛选状态">
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

      <div v-if="!testModelId" class="test-result-empty">请输入模型 ID 进行测试</div>

      <div v-else class="test-result-content">
        <!-- 匹配结果 -->
        <div class="result-section">
          <div class="result-label">匹配状态</div>
          <div class="result-value">
            <el-tag v-if="testMatchedRule" type="success" size="large"> ✓ 已匹配 </el-tag>
            <el-tag v-else type="danger" size="large"> ✗ 未匹配 </el-tag>
          </div>
        </div>

        <!-- 匹配到的规则 -->
        <template v-if="testMatchedRule">
          <div class="result-section">
            <div class="result-label">匹配规则</div>
            <div class="result-value matched-rule">
              <div class="rule-info">
                <el-tag :type="getMatchTypeTagType(testMatchedRule.matchType)">{{
                  getMatchTypeLabel(testMatchedRule.matchType)
                }}</el-tag>
                <el-tag v-if="testMatchedRule.useRegex" type="success" effect="light">RegEx</el-tag>
                <code class="rule-match-value">{{ testMatchedRule.matchValue }}</code>
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
              <code class="icon-path">{{ testMatchedRule.properties?.icon || "无" }}</code>
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
                <li v-if="testProvider">如果是 provider 匹配，确认 provider 值正确</li>
              </ul>
            </div>
          </div>

          <div class="result-section">
            <div class="result-label">候选规则（按优先级）</div>
            <div class="result-value candidate-rules">
              <div v-for="rule in candidateRules" :key="rule.id" class="candidate-rule">
                <div class="candidate-main">
                  <el-tag :type="getMatchTypeTagType(rule.matchType)" size="small">{{
                    getMatchTypeLabel(rule.matchType)
                  }}</el-tag>
                  <code>{{ rule.matchValue }}</code>
                  <el-tag v-if="rule.enabled === false" type="info" size="small">禁用</el-tag>
                </div>
                <div class="candidate-meta">优先级: {{ rule.priority || 0 }}</div>
              </div>
              <div v-if="candidateRules.length === 0" class="no-candidates">没有相关的候选规则</div>
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
          :class="{ 'grid-view': viewMode === 'grid', 'list-view': viewMode === 'list' }"
        >
          <div
            v-for="config in paginatedConfigs"
            :key="config.id"
            class="config-item"
            :class="{ disabled: config.enabled === false }"
          >
            <DynamicIcon
              class="config-icon"
              :src="getDisplayIconPath(config.properties?.icon || '')"
              :alt="config.matchValue"
            />

            <div class="config-info">
              <div class="config-header">
                <el-tag :type="getMatchTypeTagType(config.matchType)" effect="plain">{{
                  getMatchTypeLabel(config.matchType)
                }}</el-tag>
                <el-tag v-if="config.useRegex" type="success" effect="plain" title="使用正则表达式"
                  >RegEx</el-tag
                >
                <span class="config-value">{{ config.matchValue }}</span>
              </div>
              <div v-if="config.properties?.group" class="config-group">
                分组: {{ config.properties.group }}
              </div>
              <div v-if="config.priority" class="config-priority">
                优先级: {{ config.priority }}
              </div>
              <div v-if="config.description" class="config-description">
                {{ config.description }}
              </div>
              <div class="config-path">{{ config.properties?.icon }}</div>
            </div>

            <div
              v-if="config.createdAt"
              class="config-created-date"
              :title="`创建于 ${formatDateTime(config.createdAt)}`"
            >
              {{ formatDate(config.createdAt) }}
            </div>

            <div class="config-actions">
              <el-button
                text
                circle
                @click="toggleConfig(config.id)"
                :title="config.enabled === false ? '启用' : '禁用'"
              >
                <el-icon
                  ><Select v-if="config.enabled !== false" />
                  <Close v-else />
                </el-icon>
              </el-button>
              <el-button text circle @click="handleEdit(config)" title="编辑">
                <el-icon>
                  <Edit />
                </el-icon>
              </el-button>
              <el-button text circle type="danger" @click="handleDelete(config.id)" title="删除">
                <el-icon>
                  <Delete />
                </el-icon>
              </el-button>
            </div>
          </div>
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
      <el-button v-if="!searchText" @click="handleAdd" type="primary">添加第一个配置</el-button>
    </div>

    <!-- 预设图标对话框 -->
    <BaseDialog v-model="showPresets" title="预设图标" width="80%">
      <template #content>
        <IconPresetSelector
          :icons="presetIcons"
          :get-icon-path="(path) => `${PRESET_ICONS_DIR}/${path}`"
          show-search
          show-categories
          @select="selectPreset"
        />
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
import { formatDateTime } from "@/utils/time";
import { useModelMetadata } from "@composables/useModelMetadata";
import type { ModelMetadataRule, MetadataMatchType } from "../../../types/model-metadata";
import ModelMetadataConfigEditor from "./components/ModelMetadataConfigEditor.vue";
import IconPresetSelector from "@components/common/IconPresetSelector.vue";
import { PRESET_ICONS_DIR } from "../../../config/preset-icons";
import { Edit, Delete, Select, Close, Grid, List } from "@element-plus/icons-vue";
import DynamicIcon from "@components/common/DynamicIcon.vue";

const {
  rules: configs,
  presetIcons,
  enabledCount,
  addRule: addConfig,
  updateRule: updateConfig,
  deleteRule: deleteConfig,
  toggleRule: toggleConfig,
  resetToDefaults,
  mergeWithDefaults,
  exportRules: exportConfigs,
  importRules: importConfigs,
  getMatchedRule,
  getDisplayIconPath,
} = useModelMetadata();

const showPresets = ref(false);
const editingConfig = ref<Partial<ModelMetadataRule> | null>(null);
const isNewConfig = ref(false);

// 搜索和过滤
const searchText = ref("");
const sortBy = ref<"priority" | "type" | "name" | "createdAt">("priority");
const filterEnabled = ref<"all" | "enabled" | "disabled">("all");
const currentPage = ref(1);
const pageSize = ref(12);
const viewMode = ref<"grid" | "list">("grid");

// 测试模式
const testMode = ref(false);
const testModelId = ref("");
const testProvider = ref("");

// 测试匹配结果
const testMatchedRule = computed(() => {
  if (!testMode.value || !testModelId.value.trim()) return null;
  return getMatchedRule(testModelId.value.trim(), testProvider.value.trim() || undefined);
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
        (rule.matchType === "provider" && providerLower.includes(matchValueLower))
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
    model: "Model",
    modelPrefix: "Prefix",
    modelGroup: "Group",
  };
  return labels[type] || type;
}

// 获取匹配类型的标签类型
function getMatchTypeTagType(
  type: MetadataMatchType
): "" | "success" | "info" | "warning" | "danger" {
  const types: Record<MetadataMatchType, "" | "success" | "info" | "warning" | "danger"> = {
    provider: "",
    model: "info",
    modelPrefix: "warning",
    modelGroup: "success",
  };
  return types[type] || "";
}

// 选择预设图标
function selectPreset(preset: any) {
  if (editingConfig.value) {
    if (!editingConfig.value.properties) {
      editingConfig.value.properties = {};
    }
    editingConfig.value.properties.icon = `${PRESET_ICONS_DIR}/${preset.path}`;
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

// 处理保存
async function handleSave() {
  if (!editingConfig.value) return;

  const config = editingConfig.value;

  // 验证必填字段
  if (!config.matchValue || !config.properties?.icon) {
    alert("请填写匹配值和图标路径");
    return;
  }

  let success = false;
  if (isNewConfig.value) {
    success = await addConfig(config as Omit<ModelMetadataRule, "id">);
  } else if (config.id) {
    success = await updateConfig(config.id, config);
  }

  if (success) {
    closeEditor();
  } else {
    alert("保存失败，请检查配置");
  }
}

// 处理删除
function handleDelete(id: string) {
  if (confirm("确定要删除这个配置吗？")) {
    deleteConfig(id);
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
    await ElMessageBox.confirm("确定要重置为默认配置吗？这将清除所有自定义配置。", "警告", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    if (await resetToDefaults()) {
      customMessage.success("已重置为默认配置");
    } else {
      customMessage.error("重置失败");
    }
  } catch {
    customMessage.info("操作已取消");
  }
}

// 处理合并最新内置配置
async function handleMerge() {
  try {
    await ElMessageBox.confirm(
      "此操作将保留您的所有自定义配置，同时添加最新内置配置中的新规则。是否继续？",
      "合并配置",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "info",
      }
    );
    const result = await mergeWithDefaults();
    if (result.added > 0) {
      customMessage.success(`成功合并！新增了 ${result.added} 个内置规则`);
    } else {
      customMessage.info("没有发现新的内置规则需要添加");
    }
  } catch (error) {
    if (error !== "cancel") {
      customMessage.error("合并配置失败");
    }
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

// 处理导入
function handleImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (await importConfigs(text)) {
        alert("导入成功");
      } else {
        alert("导入失败，请检查文件格式");
      }
    } catch (error) {
      alert("导入失败: " + error);
    }
  };
  input.click();
}

// 格式化日期（简短格式）
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return "今天";
  } else if (diffInDays === 1) {
    return "昨天";
  } else if (diffInDays < 7) {
    return `${diffInDays}天前`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks}周前`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return `${months}月前`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return `${years}年前`;
  }
}

</script>

<style scoped>
.model-metadata-settings {
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
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
  border-bottom: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.test-result-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
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

.configs-list.grid-view .config-item {
  display: grid;
  grid-template-columns: auto 1fr; /* Icon and content */
  grid-template-rows: 1fr auto; /* Info and actions */
  grid-template-areas:
    "icon info"
    "icon actions";
  gap: 0.5rem 1rem; /* row-gap column-gap */
  padding: 1rem;
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: all 0.2s;
  align-items: center;
  backdrop-filter: blur(var(--ui-blur));
}

.configs-list.grid-view .config-icon {
  grid-area: icon;
  width: 64px;
  height: 64px;
  margin: 0;
  flex-shrink: 0;
}

.configs-list.grid-view .config-info {
  grid-area: info;
  min-width: 0;
  text-align: left;
}

.configs-list.grid-view .config-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.configs-list.grid-view .config-value {
  word-break: break-all;
}

.configs-list.grid-view .config-created-date {
  grid-area: actions;
  justify-self: start;
  align-self: center;
  margin-right: auto;
}

.configs-list.grid-view .config-actions {
  grid-area: actions;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  flex-shrink: 0;
  margin-top: 0;
}

/* 列表视图 */
.configs-list.list-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.configs-list.list-view .config-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  transition: all 0.2s;
}

.configs-list.list-view .config-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.configs-list.list-view .config-info {
  flex: 1;
  min-width: 0;
}

.configs-list.list-view .config-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}

.configs-list.list-view .config-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* 通用配置项样式 */
.config-item.disabled {
  opacity: 0.5;
}

.config-item:hover {
  border-color: var(--primary-color);
}

.configs-list.grid-view .config-icon {
  border-radius: 4px;
}
.configs-list.list-view .config-icon {
  border-radius: 4px;
}

.config-info {
  flex: 1;
  min-width: 0;
}

.config-header {
  margin-bottom: 0.25rem;
}

.config-value {
  font-weight: 500;
  font-family: "Consolas", "Monaco", monospace;
}

.config-group {
  font-size: 0.85rem;
  color: var(--primary-color);
  font-weight: 500;
}

.config-priority {
  font-size: 0.85rem;
  color: var(--text-color-light);
}

.config-description {
  font-size: 0.85rem;
  color: var(--text-color-light);
  margin-bottom: 0.25rem;
}

.config-path {
  font-size: 0.75rem;
  color: var(--text-color-light);
  font-family: "Consolas", "Monaco", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-created-date {
  font-size: 0.75rem;
  color: var(--text-color-light);
  white-space: nowrap;
  opacity: 0.7;
}

.config-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.config-actions .el-button {
  margin: 0;
}

/* 分页样式 */
.pagination-container {
  display: flex;
  justify-content: center;
  padding: 1rem 0;
  margin-top: 0.5rem;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--container-bg);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.el-button {
  margin-left: 0px;
}
</style>
