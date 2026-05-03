<template>
  <div class="skill-manager-page">
    <!-- 头部 -->
    <div class="page-header">
      <div class="header-left">
        <h2>技能管理</h2>
        <div class="master-toggle">
          <el-switch v-model="skillEnabled" @change="handleMasterToggle" size="small" />
          <span class="toggle-label">启用技能</span>
        </div>
      </div>
      <div class="header-actions">
        <el-button size="small" @click="handleRefresh" :loading="loading">刷新</el-button>
        <el-button size="small" type="primary" :disabled="!store.config.enabled" @click="showInstallDialog = true"
          >安装技能</el-button
        >
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="status-bar" v-if="loading">
      <LoaderCircle class="spinner-icon" :size="16" />
      <span>正在扫描技能目录...</span>
    </div>

    <!-- 标签页切换 -->
    <el-tabs v-model="activeTab" class="skill-tabs">
      <el-tab-pane name="skills">
        <template #label>
          <div class="tab-label">
            <span>技能列表</span>
          </div>
        </template>
        <!-- 提示：技能未启用 -->
        <div v-if="!store.config.enabled" class="disabled-banner">
          <AlertTriangle :size="16" class="banner-icon" />
          <div class="banner-content">
            <span class="banner-title">技能功能已禁用</span>
            <span class="banner-desc">您可以在设置中启用技能功能</span>
          </div>
        </div>

        <!-- 主内容区：左右分栏 -->
        <div class="page-content" v-if="store.config.enabled" :key="'skills-content'">
          <SkillListPanel
            :manifests="store.enabledManifests"
            :active-skill-names="store.activeSkillNames"
            :disabled-ids="store.config.disabledSkillIds"
            :selected-name="selectedManifest?.name"
            @select="handleSkillSelect"
            @toggle="handleToggleSkill"
          />

          <SkillDetailPanel
            v-if="selectedManifest"
            :manifest="selectedManifest"
            :is-active="store.isSkillActive(selectedManifest.name)"
            :is-enabled="store.isSkillEnabled(selectedManifest.name)"
            @toggle="handleToggleSkill"
          />
          <div v-else class="empty-detail">
            <el-empty description="请选择一个技能查看详情" />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="scan-settings">
        <template #label>
          <div class="tab-label">
            <span>扫描设置</span>
          </div>
        </template>
        <SkillScanSettings />
      </el-tab-pane>
    </el-tabs>

    <!-- 安装对话框 -->
    <SkillInstallDialog v-if="showInstallDialog" @close="showInstallDialog = false" @installed="handleInstalled" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { LoaderCircle, AlertTriangle } from "lucide-vue-next";
import { useSkillManager } from "../composables/useSkillManager";
import type { SkillManifest } from "../types";
import SkillListPanel from "./SkillListPanel.vue";
import SkillDetailPanel from "./SkillDetailPanel.vue";
import SkillInstallDialog from "./SkillInstallDialog.vue";
import SkillScanSettings from "./SkillScanSettings.vue";

const { store, initialize, refresh, toggleSkill } = useSkillManager();
const loading = ref(false);
const selectedManifest = ref<SkillManifest | null>(null);
const showInstallDialog = ref(false);
const activeTab = ref("skills");

const skillEnabled = computed({
  get: () => store.config.enabled,
  set: (val: boolean) => {
    store.updateConfig({ enabled: val });
  },
});

async function handleMasterToggle(val: boolean) {
  await store.updateConfig({ enabled: val });
}

onMounted(async () => {
  loading.value = true;
  await initialize();
  loading.value = false;
});

function handleSkillSelect(manifest: SkillManifest) {
  selectedManifest.value = manifest;
}

function handleToggleSkill(name: string) {
  toggleSkill(name);
}

async function handleRefresh() {
  loading.value = true;
  try {
    await refresh();
  } finally {
    loading.value = false;
  }
}

function handleInstalled() {
  showInstallDialog.value = false;
  handleRefresh();
}
</script>

<style scoped>
.skill-manager-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
}

.master-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle-label {
  font-size: 13px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 标签页样式 */
.skill-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.skill-tabs :deep(.el-tabs__header) {
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.skill-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.skill-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.skill-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.skill-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

/* 禁用提示 */
.disabled-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  flex-shrink: 0;
  margin-bottom: 12px;
  background-color: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.12));
  border: var(--border-width) solid rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.25));
}

.banner-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.banner-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.banner-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.banner-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.page-content {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
}

.empty-detail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
