<template>
  <div class="skill-manager-page">
    <!-- 头部 -->
    <div class="page-header">
      <div class="header-left">
        <h2>技能管理</h2>
        <div class="master-toggle">
          <el-switch
            v-model="skillEnabled"
            @change="handleMasterToggle"
            size="small"
          />
          <span class="toggle-label">启用技能</span>
        </div>
      </div>
      <div class="header-actions">
        <!-- 加载状态提示 -->
        <transition name="fade">
          <div class="header-status" v-if="loading">
            <LoaderCircle class="spinner-icon" :size="14" />
            <span>正在扫描...</span>
          </div>
        </transition>
        <el-button size="small" @click="handleRefresh" :disabled="loading"
          >刷新</el-button
        >
        <el-button size="small" type="primary" @click="showInstallDialog = true"
          >安装技能</el-button
        >
      </div>
    </div>

    <!-- 标签页切换 -->
    <el-tabs v-model="activeTab" class="skill-tabs">
      <el-tab-pane name="skills">
        <template #label>
          <div class="tab-label">
            <span>已安装</span>
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
        <div class="page-content" :key="'skills-content'">
          <SkillListPanel
            :manifests="store.manifests"
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
            @uninstall="handleUninstallSkill"
            @rename="handleRenameSkill"
            @refresh="handleRefresh"
          />
          <div v-else class="empty-detail">
            <el-empty description="请选择一个技能查看详情" />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="discover">
        <template #label>
          <div class="tab-label">
            <span>获取技能</span>
          </div>
        </template>
        <SkillDiscoveryPanel @installed="handleRefresh" />
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
    <SkillInstallDialog
      v-if="showInstallDialog"
      @close="showInstallDialog = false"
      @installed="handleInstalled"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { LoaderCircle, AlertTriangle } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useSkillManager } from "../composables/useSkillManager";
import type { SkillManifest } from "../types";
import SkillListPanel from "./SkillListPanel.vue";
import SkillDetailPanel from "./SkillDetailPanel.vue";
import SkillInstallDialog from "./SkillInstallDialog.vue";
import SkillScanSettings from "./SkillScanSettings.vue";
import SkillDiscoveryPanel from "./SkillDiscoveryPanel.vue";

const { store, initialize, refresh, toggleSkill, uninstallSkill, renameSkill } =
  useSkillManager();
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

async function handleUninstallSkill(name: string) {
  loading.value = true;
  try {
    const success = await uninstallSkill(name);
    if (success) {
      if (selectedManifest.value?.name === name) {
        selectedManifest.value = null;
      }
    }
  } finally {
    loading.value = false;
  }
}

async function handleRenameSkill(oldName: string, newName: string) {
  loading.value = true;
  try {
    const success = await renameSkill(oldName, newName);
    if (success) {
      customMessage.success(`技能已重命名为 "${newName}"`);
      // 更新当前选中的 manifest
      const newManifest = store.manifests.find((m) => m.name === newName);
      if (newManifest) {
        selectedManifest.value = newManifest;
      }
    }
  } finally {
    loading.value = false;
  }
}

async function handleRefresh() {
  loading.value = true;
  try {
    const currentName = selectedManifest.value?.name;
    await refresh();
    const count = store.manifests.length;

    // 同步内置安装记录：清理已被卸载的 skill 的记录
    store.syncInstallRecords();

    // 刷新后重新同步选中的 manifest 对象，确保详情面板更新
    if (currentName) {
      const newManifest = store.manifests.find((m) => m.name === currentName);
      if (newManifest) {
        selectedManifest.value = newManifest;
      } else {
        selectedManifest.value = null;
      }
    }

    customMessage.success(`技能列表已刷新，共扫描到 ${count} 个技能`);
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
  align-items: center;
  gap: 8px;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-primary);
  font-size: 12px;
  padding-right: 8px;
  border-right: 1px solid var(--border-color);
  margin-right: 4px;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border: var(--border-width) solid
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.25));
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
