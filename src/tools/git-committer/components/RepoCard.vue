<template>
  <div class="repo-card" :class="{ 'has-changes': hasChanges }">
    <!-- 卡片头部 -->
    <div class="card-header">
      <div class="repo-info">
        <div class="repo-name-row">
          <span class="repo-name" :title="repo.alias || repo.name">
            {{ repo.alias || repo.name }}
          </span>
          <span class="repo-branch" :title="branchName">
            <GitBranch :size="12" class="branch-icon" />
            {{ branchName }}
          </span>
        </div>
        <div class="repo-path" :title="repo.path">{{ repo.path }}</div>
      </div>

      <div class="card-actions">
        <el-tooltip content="拉取" placement="top">
          <el-button circle size="small" :loading="isPulling" @click="pull">
            <ArrowDown :size="12" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="推送" placement="top">
          <el-button
            circle
            size="small"
            :loading="isPushing"
            @click="push"
            :disabled="aheadCount === 0"
          >
            <ArrowUp :size="12" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="刷新" placement="top">
          <el-button circle size="small" @click="refresh">
            <RefreshCw :size="12" />
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 变更统计与快捷操作 -->
    <div class="changes-summary">
      <div class="summary-item">
        <span class="label">暂存的更改:</span>
        <el-tag :type="stagedCount > 0 ? 'success' : 'info'" size="small" round>
          {{ stagedCount }}
        </el-tag>
        <el-button
          v-if="stagedCount > 0"
          link
          type="primary"
          size="small"
          class="action-btn"
          @click="handleUnstageAllFiles"
        >
          全部取消
        </el-button>
      </div>
      <div class="summary-item">
        <span class="label">工作区更改:</span>
        <el-tag
          :type="unstagedCount > 0 ? 'warning' : 'info'"
          size="small"
          round
        >
          {{ unstagedCount }}
        </el-tag>
        <el-button
          v-if="unstagedCount > 0"
          link
          type="primary"
          size="small"
          class="action-btn"
          @click="handleStageAllFiles"
        >
          全部暂存
        </el-button>
      </div>
      <div class="summary-item" v-if="aheadCount > 0">
        <span class="label">未推送提交:</span>
        <el-tag type="primary" size="small" round>
          {{ aheadCount }}
        </el-tag>
      </div>
    </div>

    <!-- 提交消息输入框 -->
    <div class="commit-section">
      <div class="input-header">
        <span class="section-title">提交信息</span>
        <el-button
          link
          type="primary"
          size="small"
          :loading="isGenerating"
          @click="generateMsg"
          :disabled="!canGenerateMessage"
        >
          <Sparkles :size="12" class="ai-icon" />
          AI 生成
        </el-button>
      </div>
      <el-input
        v-model="draft"
        type="textarea"
        :rows="3"
        placeholder="输入提交信息... (Ctrl+Enter 提交)"
        class="commit-input"
        @keydown.ctrl.enter="handleCommit"
      />
      <div class="commit-btn-row">
        <el-button
          type="primary"
          size="small"
          class="w-full"
          :loading="isCommitting"
          @click="handleCommit"
          :disabled="!canCommit"
        >
          提交更改
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Sparkles,
} from "lucide-vue-next";
import type { RepositoryConfig } from "../types";
import {
  repoStatuses,
  aiIncludeUnstaged,
} from "../composables/useGitCommitterState";
import {
  refreshStatus,
  stageFiles,
  unstageFiles,
} from "../composables/useGitCommitterRunner";
import { useGitRepoWorkflow } from "../composables/useGitRepoWorkflow";

const props = defineProps<{
  repo: RepositoryConfig;
}>();

const repoPath = toRef(props.repo, "path");

// 使用统一的工作流 Composable
const {
  isPulling,
  isPushing,
  isGenerating,
  isCommitting,
  draft,
  pull,
  push,
  generateMsg,
  commit,
} = useGitRepoWorkflow(repoPath);

// ===== 状态获取 =====
const status = computed(() => repoStatuses.value[props.repo.path]);

const stagedCount = computed(() => status.value?.staged.length || 0);
const unstagedCount = computed(() => status.value?.unstaged.length || 0);
const aheadCount = computed(() => status.value?.ahead || 0);
const branchName = computed(() => status.value?.branch || "HEAD");

const hasChanges = computed(
  () => stagedCount.value > 0 || unstagedCount.value > 0
);

const canGenerateMessage = computed(() => {
  return (
    stagedCount.value > 0 ||
    (aiIncludeUnstaged.value && unstagedCount.value > 0)
  );
});

const canCommit = computed(() => {
  return stagedCount.value > 0 && draft.value?.trim();
});

// ===== 快捷操作 =====
const refresh = async () => {
  await refreshStatus(props.repo.path);
};

const handleStageAllFiles = async () => {
  if (!status.value) return;
  const files = status.value.unstaged.map((f) => f.path);
  await stageFiles(props.repo.path, files);
};

const handleUnstageAllFiles = async () => {
  if (!status.value) return;
  const files = status.value.staged.map((f) => f.path);
  await unstageFiles(props.repo.path, files);
};

const handleCommit = async () => {
  await commit();
};
</script>

<style scoped>
/* 仓库卡片 */
.repo-card {
  background-color: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: all 0.2s ease;
  backdrop-filter: blur(var(--ui-blur));
}

.repo-card:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.repo-card.has-changes {
  border-color: rgba(var(--el-color-primary-rgb), 0.15);
}

/* 卡片头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.repo-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.repo-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.repo-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repo-branch {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background-color: rgba(var(--el-color-info-rgb), 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.branch-icon {
  margin-right: 4px;
}

.repo-path {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 变更统计 */
.changes-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  background-color: rgba(var(--el-color-info-rgb), 0.03);
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.summary-item {
  display: flex;
  align-items: center;
  font-size: 12px;
}

.label {
  color: var(--el-text-color-regular);
  margin-right: 6px;
}

.action-btn {
  margin-left: 8px;
}

/* 提交区域 */
.commit-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.ai-icon {
  margin-right: 4px;
}

.commit-input :deep(.el-textarea__inner) {
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--el-text-color-primary);
  font-family: monospace;
  font-size: 12px;
  resize: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.commit-input :deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--el-color-primary-rgb), 0.2);
}

.commit-btn-row {
  display: flex;
}

.w-full {
  width: 100%;
}
</style>
