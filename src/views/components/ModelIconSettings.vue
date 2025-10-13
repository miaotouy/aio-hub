<template>
  <div class="model-icon-settings">
    <div class="settings-header">
      <h2>模型图标配置</h2>
      <div class="header-actions">
        <button @click="showPresets = true" class="btn-secondary">查看预设</button>
        <button @click="handleImport" class="btn-secondary">导入配置</button>
        <button @click="handleExport" class="btn-secondary">导出配置</button>
        <button @click="handleReset" class="btn-warning">重置为默认</button>
        <button @click="handleAdd" class="btn-primary">添加配置</button>
      </div>
    </div>

    <div class="settings-stats">
      <span>总配置: {{ configs.length }}</span>
      <span>已启用: {{ enabledCount }}</span>
      <span v-if="searchText || filterEnabled !== 'all'">
        当前显示: {{ filteredConfigs.length }}
      </span>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="search-box">
        <input
          v-model="searchText"
          @input="resetPage"
          type="text"
          placeholder="搜索配置（匹配值、类型、分组、描述）..."
          class="search-input"
        />
      </div>

      <div class="toolbar-controls">
        <select v-model="sortBy" class="sort-select">
          <option value="priority">按优先级排序</option>
          <option value="type">按类型排序</option>
          <option value="name">按名称排序</option>
        </select>

        <select v-model="filterEnabled" @change="resetPage" class="filter-select">
          <option value="all">全部状态</option>
          <option value="enabled">仅启用</option>
          <option value="disabled">仅禁用</option>
        </select>

        <select v-model.number="pageSize" @change="resetPage" class="pagesize-select">
          <option :value="12">12 项/页</option>
          <option :value="24">24 项/页</option>
          <option :value="48">48 项/页</option>
          <option :value="96">96 项/页</option>
        </select>

        <el-button-group class="view-toggle">
          <el-button
            @click="viewMode = 'grid'"
            :type="viewMode === 'grid' ? 'primary' : ''"
            title="网格视图"
          >
            <el-icon>
              <Grid />
            </el-icon>
          </el-button>
          <el-button
            @click="viewMode = 'list'"
            :type="viewMode === 'list' ? 'primary' : ''"
            title="列表视图"
          >
            <el-icon>
              <List />
            </el-icon>
          </el-button>
        </el-button-group>
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
            <div class="config-icon">
              <DynamicIcon
                v-if="config.iconPath"
                :src="getDisplayIconPath(config.iconPath)"
                :alt="config.matchValue"
              />
              <div v-else class="icon-placeholder">?</div>
            </div>

            <div class="config-info">
              <div class="config-header">
                <span class="config-type-badge">{{ getMatchTypeLabel(config.matchType) }}</span>
                <span v-if="config.useRegex" class="regex-badge" title="使用正则表达式">RegEx</span>
                <span class="config-value">{{ config.matchValue }}</span>
              </div>
              <div v-if="config.groupName" class="config-group">分组: {{ config.groupName }}</div>
              <div v-if="config.priority" class="config-priority">
                优先级: {{ config.priority }}
              </div>
              <div v-if="config.description" class="config-description">
                {{ config.description }}
              </div>
              <div class="config-path">{{ config.iconPath }}</div>
            </div>

            <div class="config-actions">
              <button
                @click="toggleConfig(config.id)"
                class="btn-icon"
                :title="config.enabled === false ? '启用' : '禁用'"
              >
                <el-icon
                  ><Select v-if="config.enabled !== false" />
                  <Close v-else />
                </el-icon>
              </button>
              <button @click="handleEdit(config)" class="btn-icon" title="编辑">
                <el-icon>
                  <Edit />
                </el-icon>
              </button>
              <button @click="handleDelete(config.id)" class="btn-icon btn-danger" title="删除">
                <el-icon>
                  <Delete />
                </el-icon>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 固定分页 -->
      <div v-if="totalPages > 1" class="pagination">
        <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1" class="page-btn">
          ← 上一页
        </button>

        <div class="page-numbers">
          <button
            v-for="page in getPageNumbers()"
            :key="page"
            @click="page > 0 && goToPage(page)"
            :class="{ active: page === currentPage, ellipsis: page < 0 }"
            :disabled="page < 0"
            class="page-number"
          >
            {{ page > 0 ? page : "..." }}
          </button>
        </div>

        <button
          @click="goToPage(currentPage + 1)"
          :disabled="currentPage === totalPages"
          class="page-btn"
        >
          下一页 →
        </button>

        <div class="page-info">{{ currentPage }} / {{ totalPages }}</div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-text">
        {{ searchText ? "未找到匹配的配置" : "暂无配置" }}
      </div>
      <button v-if="!searchText" @click="handleAdd" class="btn-primary">添加第一个配置</button>
    </div>

    <!-- 预设图标对话框 -->
    <el-dialog v-model="showPresets" title="预设图标" width="80%" top="5vh">
      <IconPresetSelector
        :icons="presetIcons"
        :get-icon-path="(path) => `${PRESET_ICONS_DIR}/${path}`"
        show-search
        show-categories
        @select="selectPreset"
      />
    </el-dialog>

    <!-- 编辑对话框 -->
    <ModelIconConfigEditor
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
import { ElMessage, ElMessageBox } from "element-plus";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useModelIcons } from "../../composables/useModelIcons";
import type { ModelIconConfig, IconMatchType } from "../../types/model-icons";
import ModelIconConfigEditor from "./ModelIconConfigEditor.vue";
import IconPresetSelector from "../../components/common/IconPresetSelector.vue";
import { PRESET_ICONS_DIR } from "../../config/model-icons";
import { Edit, Delete, Select, Close, Grid, List } from "@element-plus/icons-vue";
import DynamicIcon from "../../components/common/DynamicIcon.vue";

const {
  configs,
  presetIcons,
  enabledCount,
  addConfig,
  updateConfig,
  deleteConfig,
  toggleConfig,
  resetToDefaults,
  exportConfigs,
  importConfigs,
} = useModelIcons();

const showPresets = ref(false);
const editingConfig = ref<Partial<ModelIconConfig> | null>(null);
const isNewConfig = ref(false);

// 搜索和过滤
const searchText = ref("");
const sortBy = ref<"priority" | "type" | "name">("priority");
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
        config.groupName?.toLowerCase().includes(search)
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
    default:
      return result;
  }
});

// 分页
const totalPages = computed(() => Math.ceil(sortedConfigs.value.length / pageSize.value));

const paginatedConfigs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return sortedConfigs.value.slice(start, end);
});

// 重置到第一页（当搜索或过滤改变时）
function resetPage() {
  currentPage.value = 1;
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}

// 获取匹配类型标签
function getMatchTypeLabel(type: IconMatchType): string {
  const labels: Record<IconMatchType, string> = {
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
    editingConfig.value.iconPath = `${PRESET_ICONS_DIR}/${preset.path}`;
  }
  showPresets.value = false; // Close dialog on selection
}

// 处理添加
function handleAdd() {
  isNewConfig.value = true;
  editingConfig.value = {
    matchType: "provider",
    matchValue: "",
    iconPath: "",
    priority: 10,
    enabled: true,
    description: "",
  };
}

// 处理编辑
function handleEdit(config: ModelIconConfig) {
  isNewConfig.value = false;
  editingConfig.value = { ...config };
}

// 处理保存
async function handleSave() {
  if (!editingConfig.value) return;

  const config = editingConfig.value;

  // 验证必填字段
  if (!config.matchValue || !config.iconPath) {
    alert("请填写匹配值和图标路径");
    return;
  }

  let success = false;
  if (isNewConfig.value) {
    success = await addConfig(config as Omit<ModelIconConfig, "id">);
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
      ElMessage.success("已重置为默认配置");
    } else {
      ElMessage.error("重置失败");
    }
  } catch {
    ElMessage.info("操作已取消");
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

// 获取页码数组（用于分页显示）
function getPageNumbers(): number[] {
  const pages: number[] = [];
  const total = totalPages.value;
  const current = currentPage.value;

  if (total <= 7) {
    // 总页数<=7，显示所有页码
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // 总页数>7，智能显示页码
    if (current <= 4) {
      // 当前页靠前
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push(-1); // -1 表示省略号
      pages.push(total);
    } else if (current >= total - 3) {
      // 当前页靠后
      pages.push(1);
      pages.push(-1);
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      // 当前页在中间
      pages.push(1);
      pages.push(-1);
      for (let i = current - 1; i <= current + 1; i++) pages.push(i);
      pages.push(-1);
      pages.push(total);
    }
  }

  return pages;
}
</script>

<style scoped>
.model-icon-settings {
  max-height: 1200px;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  overflow: hidden;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.settings-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.settings-stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--container-bg);
  border-radius: 4px;
  font-size: 0.9rem;
  flex-shrink: 0;
}

/* 工具栏 */
.toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.search-box {
  flex: 1;
  min-width: 200px;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.toolbar-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.sort-select,
.filter-select,
.pagesize-select {
  padding: 0.5rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}

.sort-select:focus,
.filter-select:focus,
.pagesize-select:focus {
  outline: none;
  border-color: var(--primary-color);
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

.config-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--input-bg);
  border-radius: 4px;
  font-size: 1.5rem;
  color: var(--text-color-light);
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

.config-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* 分页样式 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem 0;
  border-radius: 4px;
  margin-top: 0.5rem;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--container-bg);
}

.page-btn {
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.page-btn:hover:not(:disabled) {
  background: var(--border-color);
  border-color: var(--primary-color);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-numbers {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.page-number {
  min-width: 2.5rem;
  height: 2.5rem;
  padding: 0.5rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-number:hover:not(:disabled):not(.ellipsis) {
  background: var(--card-bg);
  border-color: var(--primary-color);
}

.page-number.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
  font-weight: 600;
}

.page-number.ellipsis {
  background: transparent;
  border: none;
  cursor: default;
  color: var(--text-color-light);
}

.page-number:disabled {
  cursor: not-allowed;
}

.page-info {
  padding: 0.5rem 1rem;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-color-light);
  white-space: nowrap;
}

/* 按钮样式 */
.btn-icon {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-icon {
  padding: 0;
  width: 2.25rem;
  height: 2.25rem;
  font-size: 1.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  line-height: 1;
  color: var(--text-color-light);
  border-radius: 4px;
}

.btn-icon:hover {
  background: var(--input-bg);
  color: var(--text-color);
  border-color: var(--primary-color);
}

.btn-icon.btn-danger:hover {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}
</style>
