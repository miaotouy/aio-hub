<template>
  <div class="skill-manager-page">
    <!-- 头部 -->
    <div class="page-header">
      <h2>技能管理</h2>
      <div class="header-actions">
        <el-button size="small" @click="handleRefresh" :loading="loading">刷新</el-button>
        <el-button size="small" type="primary" @click="showInstallDialog = true">安装技能</el-button>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="status-bar" v-if="loading">
      <LoaderCircle class="spinner-icon" :size="16" />
      <span>正在扫描技能目录...</span>
    </div>

    <!-- 提示：技能未启用 -->
    <div v-if="!store.config.enabled" class="disabled-banner">
      <AlertTriangle :size="16" class="banner-icon" />
      <div class="banner-content">
        <span class="banner-title">技能功能已禁用</span>
        <span class="banner-desc">您可以在设置中启用技能功能</span>
      </div>
    </div>

    <!-- 主内容区：左右分栏 -->
    <div class="page-content" v-if="store.config.enabled">
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

    <!-- 安装对话框 -->
    <SkillInstallDialog v-if="showInstallDialog" @close="showInstallDialog = false" @installed="handleInstalled" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { LoaderCircle, AlertTriangle } from "lucide-vue-next";
import { useSkillManager } from "../composables/useSkillManager";
import type { SkillManifest } from "../types";
import SkillListPanel from "./SkillListPanel.vue";
import SkillDetailPanel from "./SkillDetailPanel.vue";
import SkillInstallDialog from "./SkillInstallDialog.vue";

const { store, initialize, refresh, toggleSkill } = useSkillManager();
const loading = ref(false);
const selectedManifest = ref<SkillManifest | null>(null);
const showInstallDialog = ref(false);

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

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
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

/* 禁用提示 */
.disabled-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  flex-shrink: 0;
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
