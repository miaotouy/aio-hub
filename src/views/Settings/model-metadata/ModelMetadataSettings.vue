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
        <el-input
          v-model="searchText"
          @input="resetPage"
          placeholder="搜索配置（匹配值、类型、分组、描述）..."
          clearable
        />
      </div>

      <div class="toolbar-controls">
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
                <span class="config-type-badge">{{ getMatchTypeLabel(config.matchType) }}</span>
                <span v-if="config.useRegex" class="regex-badge" title="使用正则表达式">RegEx</span>
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
      <div class="pagination-container">
        <el-pagination
          v-if="sortedConfigs.length > 0"
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
import { convertFileSrc } from "@tauri-apps/api/core";
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

/**
 * 获取用于显示的图标路径
 * 如果是绝对路径（本地文件），则转换为 Tauri asset URL
 */
function getDisplayIconPath(iconPath: string): string {
  if (!iconPath) return "";

  // 检查是否为绝对路径
  // Windows: C:\, D:\, E:\ 等
  // 但要排除 /model-icons/ 这样的相对路径
  const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(iconPath);
  // Unix/Linux 绝对路径，但排除 /model-icons/ 这种项目内的相对路径
  const isUnixAbsolutePath = iconPath.startsWith("/") && !iconPath.startsWith("/model-icons");

  if (isWindowsAbsolutePath || isUnixAbsolutePath) {
    // 只对真正的本地文件系统绝对路径转换为 Tauri asset URL
    return convertFileSrc(iconPath);
  }

  // 相对路径（包括 /model-icons/ 开头的预设图标）直接返回
  return iconPath;
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

// 格式化日期（完整格式，用于 title）
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

.config-type-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 500;
}

.regex-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: transparent;
  color: #10b981;
  border: 1px solid #10b981;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 500;
  margin-left: 0.25rem;
}

.config-value {
  font-weight: 500;
  font-family: "Consolas", "Monaco", monospace;
  margin-left: 0.5rem;
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
