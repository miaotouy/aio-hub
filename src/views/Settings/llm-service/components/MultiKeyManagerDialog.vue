<script setup lang="ts">
import { ref, computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import {
  CircleCheck,
  Warning,
  RefreshRight,
  VideoPause,
  Operation,
  Search,
  Delete,
  Check,
  Close,
  Download,
  Upload,
} from "@element-plus/icons-vue";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import type { LlmProfile } from "@/types/llm-profiles";
import { format } from "date-fns";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  modelValue: boolean;
  profile: LlmProfile;
}>();

const emit = defineEmits(["update:modelValue", "update:profile"]);

const {
  getKeyStatuses,
  updateKeyStatus,
  removeKeyStatus,
  resetAllBroken,
  batchSetEnabled,
  syncKeyStates,
  getAutoRecoveryTime,
  setAutoRecoveryTime,
  getEnableAutoDisable,
  setEnableAutoDisable,
} = useLlmKeyManager();

const searchQuery = ref("");
const statusFilter = ref("all");
const selectedKeys = ref<any[]>([]);
const isImporting = ref(false);
const importText = ref("");

// 自动恢复时长设置
const recoveryTimeOptions = [
  { label: "不自动恢复", value: 0 },
  { label: "30 秒", value: 30000 },
  { label: "1 分钟", value: 60000 },
  { label: "2 分钟", value: 120000 },
  { label: "5 分钟", value: 300000 },
  { label: "10 分钟", value: 600000 },
];

const currentRecoveryTime = computed({
  get: () => getAutoRecoveryTime(),
  set: (val) => setAutoRecoveryTime(val),
});

const enableAutoDisable = computed({
  get: () => getEnableAutoDisable(),
  set: (val) => setEnableAutoDisable(val),
});

// 同步并获取状态
const keyStatuses = computed(() => {
  // 注意：syncKeyStates 内部会修改 ref，在 computed 中调用是安全的，因为它是为了确保数据存在
  syncKeyStates(props.profile);
  return getKeyStatuses(props.profile.id);
});

// 统计数据
const stats = computed(() => {
  const allKeys = props.profile.apiKeys || [];
  const statuses = Object.values(keyStatuses.value);

  const enabled = statuses.filter((s) => s.isEnabled && !s.isBroken).length;
  const manuallyDisabled = statuses.filter((s) => !s.isEnabled).length;
  const automaticallyDisabled = statuses.filter((s) => s.isEnabled && s.isBroken).length;

  return {
    total: allKeys.length,
    enabled,
    manuallyDisabled,
    automaticallyDisabled,
    enabledPercent: allKeys.length ? (enabled / allKeys.length) * 100 : 0,
    manualPercent: allKeys.length ? (manuallyDisabled / allKeys.length) * 100 : 0,
    autoPercent: allKeys.length ? (automaticallyDisabled / allKeys.length) * 100 : 0,
  };
});

// 过滤后的列表
const filteredTableData = computed(() => {
  return props.profile.apiKeys
    .map((key, index) => {
      const status = keyStatuses.value[key] || {
        key,
        isEnabled: true,
        isBroken: false,
        errorCount: 0,
      };
      return {
        index,
        ...status,
      };
    })
    .filter((item) => {
      // 搜索过滤
      if (searchQuery.value && !item.key.toLowerCase().includes(searchQuery.value.toLowerCase())) {
        return false;
      }
      // 状态过滤
      if (statusFilter.value === "enabled") return item.isEnabled && !item.isBroken;
      if (statusFilter.value === "manual_disabled") return !item.isEnabled;
      if (statusFilter.value === "auto_disabled") return item.isEnabled && item.isBroken;
      return true;
    });
});

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSelectionChange = (val: any[]) => {
  selectedKeys.value = val;
};

const handleExport = () => {
  const keys = props.profile.apiKeys.join("\n");
  navigator.clipboard
    .writeText(keys)
    .then(() => {
      customMessage.success("已将所有密钥复制到剪贴板");
    })
    .catch(() => {
      customMessage.error("导出失败，请手动复制");
    });
};

const handleImport = () => {
  // 支持换行符和逗号分隔
  const newKeys = importText.value
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter((k) => k && !props.profile.apiKeys.includes(k));

  if (newKeys.length === 0) {
    customMessage.warning("没有发现新的有效密钥");
    return;
  }

  // 去重
  const uniqueNewKeys = Array.from(new Set(newKeys));
  const updatedKeys = [...props.profile.apiKeys, ...uniqueNewKeys];

  emit("update:profile", { ...props.profile, apiKeys: updatedKeys });
  customMessage.success(`成功导入 ${uniqueNewKeys.length} 个新密钥`);
  isImporting.value = false;
  importText.value = "";
};

const handleBatchDelete = () => {
  if (selectedKeys.value.length === 0) return;

  const keysToRemove = selectedKeys.value.map((item) => item.key);
  const newKeys = props.profile.apiKeys.filter((k) => !keysToRemove.includes(k));

  keysToRemove.forEach((k) => removeKeyStatus(props.profile.id, k));
  emit("update:profile", { ...props.profile, apiKeys: newKeys });
  customMessage.success(`已成功移除 ${keysToRemove.length} 个选中密钥`);
  selectedKeys.value = [];
};

const toggleKeyStatus = (item: any) => {
  const newStatus = !item.isEnabled;
  updateKeyStatus(props.profile.id, item.key, { isEnabled: newStatus });
  customMessage.success(newStatus ? "已启用密钥" : "已禁用密钥");
};

const resetKey = (item: any) => {
  updateKeyStatus(props.profile.id, item.key, {
    isBroken: false,
    errorCount: 0,
    disabledTime: undefined,
    lastErrorMessage: undefined,
  });
  customMessage.success("密钥状态已重置");
};

const deleteKey = (item: any) => {
  const newKeys = props.profile.apiKeys.filter((k) => k !== item.key);
  removeKeyStatus(props.profile.id, item.key);
  emit("update:profile", { ...props.profile, apiKeys: newKeys });
  customMessage.success("密钥已从配置中移除");
};

const handleResetAllBroken = () => {
  resetAllBroken(props.profile.id);
  customMessage.success("已重置所有自动禁用的密钥状态");
};

const handleEnableAll = () => {
  batchSetEnabled(props.profile.id, true);
  customMessage.success("已手动启用所有密钥");
};

const handleDisableAll = () => {
  batchSetEnabled(props.profile.id, false);
  customMessage.success("已手动禁用所有密钥");
};

const handleDeleteAllBroken = () => {
  const brokenKeys = props.profile.apiKeys.filter((key) => keyStatuses.value[key]?.isBroken);
  if (brokenKeys.length === 0) {
    customMessage.info("没有需要清理的损坏密钥");
    return;
  }

  const newKeys = props.profile.apiKeys.filter((key) => !keyStatuses.value[key]?.isBroken);
  emit("update:profile", { ...props.profile, apiKeys: newKeys });
  customMessage.success(`已清理 ${brokenKeys.length} 个自动禁用的密钥`);
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return "-";
  return format(timestamp, "yyyy-MM-dd HH:mm:ss");
};

const maskKey = (key: string) => {
  if (!key) return "-";
  if (key.length <= 12) return "******";
  return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
};
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="多密钥管理"
    width="90%"
    style="max-width: 1000px"
    class="multi-key-dialog"
    @close="handleClose"
  >
    <template #header>
      <div class="dialog-header">
        <span class="title">多密钥状态管理</span>
        <el-tag size="small" effect="plain" class="header-tag">
          {{ profile.name }}
        </el-tag>
        <el-tag size="small" type="info" effect="plain" class="header-tag">
          总数: {{ stats.total }}
        </el-tag>
        <el-tooltip content="当配置了多个密钥时，系统将采用轮询策略并在出错时自动熔断">
          <el-icon class="info-icon"><Warning /></el-icon>
        </el-tooltip>
      </div>
    </template>

    <div class="key-manager-container">
      <!-- 顶部统计卡片 -->
      <div class="stats-cards">
        <div class="stats-card enabled">
          <div class="card-header">
            <el-icon><CircleCheck /></el-icon>
            <span>健康可用</span>
          </div>
          <div class="card-value">
            <span class="current">{{ stats.enabled }}</span>
            <span class="total">/ {{ stats.total }}</span>
          </div>
          <el-progress
            :percentage="stats.enabledPercent"
            :show-text="false"
            color="var(--el-color-success)"
          />
        </div>

        <div class="stats-card manually-disabled">
          <div class="card-header">
            <el-icon><VideoPause /></el-icon>
            <span>手动禁用</span>
          </div>
          <div class="card-value">
            <span class="current">{{ stats.manuallyDisabled }}</span>
            <span class="total">/ {{ stats.total }}</span>
          </div>
          <el-progress
            :percentage="stats.manualPercent"
            :show-text="false"
            color="var(--el-color-info)"
          />
        </div>

        <div class="stats-card automatically-disabled">
          <div class="card-header">
            <el-icon><Warning /></el-icon>
            <span>熔断禁用</span>
          </div>
          <div class="card-value">
            <span class="current">{{ stats.automaticallyDisabled }}</span>
            <span class="total">/ {{ stats.total }}</span>
          </div>
          <el-progress
            :percentage="stats.autoPercent"
            :show-text="false"
            color="var(--el-color-warning)"
          />
        </div>
      </div>
      <!-- 设置栏 -->
      <div class="settings-bar">
        <div class="setting-item">
          <span class="label">自动熔断禁用</span>
          <el-switch v-model="enableAutoDisable" size="small" />
          <el-tooltip
            content="开启后，系统在检测到密钥报错（如 429 频率限制）时将自动暂时禁用该密钥"
          >
            <el-icon class="info-icon"><Warning /></el-icon>
          </el-tooltip>
        </div>

        <el-divider direction="vertical" class="hide-sm" style="height: 20px; margin: 0 16px" />

        <div class="setting-item" :style="{ opacity: enableAutoDisable ? 1 : 0.6 }">
          <span class="label">自动恢复时长</span>
          <el-select
            v-model="currentRecoveryTime"
            size="small"
            style="width: 120px"
            :disabled="!enableAutoDisable"
          >
            <el-option
              v-for="opt in recoveryTimeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-tooltip content="针对 429 频率限制或临时错误，系统将在指定时间后尝试重新启用该密钥">
            <el-icon class="info-icon"><Warning /></el-icon>
          </el-tooltip>
        </div>
      </div>

      <!-- 操作栏 -->
      <div class="toolbar">
        <div class="left">
          <el-select v-model="statusFilter" size="default" class="filter-select">
            <el-option label="全部状态" value="all" />
            <el-option label="健康可用" value="enabled" />
            <el-option label="手动禁用" value="manual_disabled" />
            <el-option label="熔断禁用" value="auto_disabled" />
          </el-select>
          <el-input
            v-model="searchQuery"
            placeholder="搜索密钥内容..."
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
        </div>
        <div class="right">
          <div class="btn-group">
            <el-button :icon="Upload" @click="isImporting = true">导入</el-button>
            <el-button :icon="Download" @click="handleExport">导出</el-button>
            <el-button :icon="RefreshRight" @click="handleResetAllBroken">重置熔断</el-button>
          </div>
          <el-dropdown trigger="click">
            <el-button type="primary" plain class="batch-btn">
              批量操作<el-icon class="el-icon--right"><Operation /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="Check" @click="handleEnableAll">启用全部</el-dropdown-item>
                <el-dropdown-item :icon="Close" @click="handleDisableAll"
                  >禁用全部</el-dropdown-item
                >
                <el-dropdown-item
                  :icon="Delete"
                  :disabled="selectedKeys.length === 0"
                  @click="handleBatchDelete"
                >
                  删除选中 ({{ selectedKeys.length }})
                </el-dropdown-item>
                <el-dropdown-item
                  :icon="Delete"
                  divided
                  type="danger"
                  @click="handleDeleteAllBroken"
                >
                  移除所有损坏密钥
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 表格 -->
      <el-table
        :data="filteredTableData"
        height="450px"
        style="width: 100%"
        class="key-table"
        header-cell-class-name="table-header"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column label="索引" width="70" align="center">
          <template #default="{ row }">
            <span class="index-text">#{{ row.index + 1 }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag v-if="!row.isEnabled" type="info" size="small" effect="light">手动禁用</el-tag>
            <el-tag v-else-if="row.isBroken" type="danger" size="small" effect="light"
              >已熔断</el-tag
            >
            <el-tag v-else type="success" size="small" effect="light">可用</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="密钥" min-width="160">
          <template #default="{ row }">
            <el-tooltip :content="row.key" placement="top" :show-after="500">
              <code class="key-code">{{ maskKey(row.key) }}</code>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column label="健康度" width="100">
          <template #default="{ row }">
            <span :class="['error-count', { 'has-error': row.errorCount > 0 }]">
              错误: {{ row.errorCount }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="最后报错/备注" min-width="220">
          <template #default="{ row }">
            <div v-if="row.isBroken" class="error-info">
              <span class="error-text" :title="row.lastErrorMessage">
                {{ row.lastErrorMessage || "连续失败触发熔断" }}
              </span>
              <span class="time-hint">{{ formatTime(row.disabledTime) }}</span>
            </div>
            <span v-else-if="!row.isEnabled" class="info-text">手动暂停使用</span>
            <span v-else-if="row.lastUsedTime" class="success-text">
              上次使用: {{ formatTime(row.lastUsedTime) }}
            </span>
            <span v-else class="placeholder-text">从未调用</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button v-if="row.isBroken" link type="primary" @click="resetKey(row)"
                >重置</el-button
              >
              <el-button
                v-else
                link
                :type="row.isEnabled ? 'info' : 'primary'"
                @click="toggleKeyStatus(row)"
              >
                {{ row.isEnabled ? "禁用" : "启用" }}
              </el-button>
              <el-divider direction="vertical" />
              <el-button link type="danger" @click="deleteKey(row)">移除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 导入对话框 -->
    <el-dialog
      v-model="isImporting"
      title="批量导入密钥"
      width="600px"
      append-to-body
      class="import-dialog"
    >
      <div class="import-container">
        <p class="import-tip">请输入 API 密钥，支持换行或逗号分隔。重复的密钥将被自动过滤。</p>
        <el-input v-model="importText" type="textarea" :rows="10" placeholder="sk-..., sk-..." />
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="isImporting = false">取消</el-button>
          <el-button type="primary" @click="handleImport" :disabled="!importText.trim()">
            确认导入
          </el-button>
        </div>
      </template>
    </el-dialog>
  </BaseDialog>
</template>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-header .title {
  font-weight: bold;
  font-size: 16px;
  margin-right: 8px;
}

.header-tag {
  border-radius: 12px;
}

.info-icon {
  font-size: 14px;
  color: var(--text-color-secondary);
  cursor: help;
  margin-left: 4px;
}

.key-manager-container {
  padding: 8px 4px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

@media (max-width: 850px) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .stats-cards {
    grid-template-columns: 1fr;
  }
}

.stats-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(var(--ui-blur));
  transition: all 0.3s ease;
}

.stats-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
}

.stats-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color-secondary);
  margin-bottom: 12px;
}

.stats-card .card-value {
  margin-bottom: 12px;
}

.stats-card .card-value .current {
  font-size: 28px;
  font-weight: bold;
  color: var(--text-color-primary);
}

.stats-card.enabled .card-value .current {
  color: var(--el-color-success);
}
.stats-card.manually-disabled .card-value .current {
  color: var(--el-color-info);
}
.stats-card.automatically-disabled .card-value .current {
  color: var(--el-color-danger);
}

.settings-bar {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

@media (max-width: 600px) {
  .settings-bar {
    padding: 12px;
  }
  .hide-sm {
    display: none;
  }
}

.settings-bar .setting-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.settings-bar .label {
  color: var(--text-color-secondary);
}

.stats-card .card-value .total {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin-left: 6px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar .left,
.toolbar .right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 140px;
}

.search-input {
  width: 220px;
}

.btn-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar .left,
  .toolbar .right {
    width: 100%;
  }
  .filter-select,
  .search-input {
    flex: 1;
  }
  .btn-group {
    flex: 1;
  }
  .batch-btn {
    width: auto;
  }
}

.index-text {
  font-family: var(--el-font-family-mono);
  color: var(--text-color-secondary);
  font-size: 12px;
}

.key-code {
  font-family: var(--el-font-family-mono);
  background: var(--input-bg);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  border: 1px solid var(--border-color);
}

.error-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-text {
  color: var(--el-color-danger);
  font-size: 12px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.success-text {
  font-size: 12px;
  color: var(--el-color-success);
}

.info-text {
  font-size: 12px;
  color: var(--text-color-info);
}

.placeholder-text {
  font-size: 12px;
  color: var(--text-color-placeholder);
}

.error-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.error-count.has-error {
  color: var(--el-color-warning);
  font-weight: 500;
}

.key-table {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background-color: transparent !important;
}

:deep(.table-header) {
  background-color: var(--sidebar-bg) !important;
  color: var(--text-color-primary);
  font-weight: 600;
}

.action-btns {
  display: flex;
  align-items: center;
}

.import-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-tip {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.6;
}

:deep(.import-dialog) {
  border-radius: 12px;
  overflow: hidden;
}
</style>
