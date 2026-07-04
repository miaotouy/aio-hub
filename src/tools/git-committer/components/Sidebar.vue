<template>
  <div class="git-committer-sidebar">
    <!-- 顶部：当前仓库信息与操作 -->
    <div class="sidebar-header">
      <div class="repo-meta">
        <div
          class="repo-title"
          :title="currentRepo?.alias || currentRepo?.name"
        >
          {{ currentRepo?.alias || currentRepo?.name }}
        </div>
        <div class="repo-branch" :title="currentStatus?.branch">
          <GitBranch :size="14" class="branch-icon" />
          {{ currentStatus?.branch || "HEAD" }}
        </div>
      </div>

      <div class="repo-actions">
        <el-tooltip content="拉取远程更改" placement="bottom">
          <el-button
            circle
            size="small"
            :loading="isPulling"
            @click="handlePull"
          >
            <ArrowDown v-if="!isPulling" :size="14" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="推送本地提交" placement="bottom">
          <el-button
            circle
            size="small"
            :loading="isPushing"
            @click="handlePush"
          >
            <ArrowUp v-if="!isPushing" :size="14" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="刷新状态" placement="bottom">
          <el-button
            circle
            size="small"
            :loading="isRefreshing"
            @click="refreshCurrentStatus"
          >
            <RefreshCw v-if="!isRefreshing" :size="14" />
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 中部：AI 提交面板 -->
    <div class="commit-panel">
      <div class="ai-model-row">
        <LlmModelSelector v-model="defaultModel" class="model-selector" />
        <el-button
          type="primary"
          size="small"
          class="ai-btn"
          :loading="isGenerating"
          @click="handleGenerateCommitMessage"
        >
          <Sparkles :size="14" class="ai-icon" />
          AI 生成
        </el-button>
      </div>

      <div class="commit-input-wrapper">
        <el-input
          v-model="commitMessage"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 12 }"
          placeholder="输入提交信息... (Ctrl+Enter 提交)"
          class="commit-input"
          @keydown.ctrl.enter="handleCommit"
        />
      </div>

      <div class="commit-btn-row">
        <el-button-group class="commit-btn-group">
          <el-button
            type="primary"
            class="commit-main-btn"
            :loading="isCommitting"
            @click="handleCommit"
          >
            {{ commitActionText }}
          </el-button>
          <el-dropdown trigger="click" @command="handleCommitCommand">
            <el-button type="primary" class="commit-dropdown-btn">
              <ChevronDown :size="16" />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="commit"
                  >仅提交 (Commit)</el-dropdown-item
                >
                <el-dropdown-item command="commit-push"
                  >提交并推送 (Commit & Push)</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-button-group>
      </div>
    </div>

    <!-- 下部：更改列表 -->
    <div class="changes-list-wrapper">
      <el-collapse v-model="activeCollapseNames" class="changes-collapse">
        <!-- 暂存的更改 -->
        <el-collapse-item name="staged" class="collapse-item">
          <template #title>
            <div class="collapse-title">
              <span>暂存的更改</span>
              <el-badge
                :value="currentStatus?.staged.length || 0"
                :max="99"
                type="info"
                class="badge-margin"
              />
              <el-button
                v-if="currentStatus?.staged.length"
                link
                type="primary"
                size="small"
                class="action-all-btn"
                @click.stop="unstageAll"
              >
                全部取消
              </el-button>
            </div>
          </template>
          <div class="file-list">
            <div
              v-for="file in currentStatus?.staged"
              :key="file.path"
              class="file-item"
              @click="openDiffTab(file.path, true)"
            >
              <span class="file-status" :class="file.status.toLowerCase()">{{
                file.status
              }}</span>
              <span class="file-path" :title="file.path">{{
                getFileName(file.path)
              }}</span>
              <span class="file-dir">{{ getFileDir(file.path) }}</span>
              <el-button
                link
                type="danger"
                size="small"
                class="action-btn"
                @click.stop="handleUnstageFile(file.path)"
              >
                <Minus :size="12" />
              </el-button>
            </div>
            <div v-if="!currentStatus?.staged.length" class="empty-tip">
              无暂存文件
            </div>
          </div>
        </el-collapse-item>

        <!-- 未暂存的更改 -->
        <el-collapse-item name="unstaged" class="collapse-item">
          <template #title>
            <div class="collapse-title">
              <span>工作区更改</span>
              <el-badge
                :value="currentStatus?.unstaged.length || 0"
                :max="99"
                type="warning"
                class="badge-margin"
              />
              <el-button
                v-if="currentStatus?.unstaged.length"
                link
                type="primary"
                size="small"
                class="action-all-btn"
                @click.stop="stageAll"
              >
                全部暂存
              </el-button>
            </div>
          </template>
          <div class="file-list">
            <div
              v-for="file in currentStatus?.unstaged"
              :key="file.path"
              class="file-item"
              @click="openDiffTab(file.path, false)"
            >
              <span class="file-status" :class="file.status.toLowerCase()">{{
                file.status
              }}</span>
              <span class="file-path" :title="file.path">{{
                getFileName(file.path)
              }}</span>
              <span class="file-dir">{{ getFileDir(file.path) }}</span>
              <el-button
                link
                type="primary"
                size="small"
                class="action-btn"
                @click.stop="handleStageFile(file.path)"
              >
                <Plus :size="12" />
              </el-button>
            </div>
            <div v-if="!currentStatus?.unstaged.length" class="empty-tip">
              工作区干净
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- 底部：设置入口 -->
    <div class="sidebar-footer">
      <el-button link class="settings-btn" @click="$emit('open-settings')">
        <Settings :size="16" class="settings-icon" />
        设置与仓库管理
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  GitBranch,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Plus,
  Minus,
  Settings,
} from "lucide-vue-next";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  currentRepo,
  currentRepoPath,
  currentStatus,
  defaultModel,
  isRefreshing,
} from "../composables/useGitCommitterState";
import {
  refreshCurrentStatus,
  stageFile,
  unstageFile,
  stageFiles,
  unstageFiles,
  openDiffTab,
} from "../composables/useGitCommitterRunner";
import { useGitRepoWorkflow } from "../composables/useGitRepoWorkflow";
import { getFileName, getFileDir } from "../utils";

defineEmits<{
  (e: "open-settings"): void;
}>();

const activeCollapseNames = ref(["staged", "unstaged"]);
const commitAction = ref<"commit" | "commit-push">("commit");

// 使用统一的工作流 Composable
const {
  isPulling,
  isPushing,
  isGenerating,
  isCommitting,
  draft: commitMessage,
  pull: handlePull,
  push: handlePush,
  generateMsg: handleGenerateCommitMessage,
  commit,
} = useGitRepoWorkflow(currentRepoPath);

const commitActionText = computed(() => {
  return commitAction.value === "commit"
    ? "提交 (Commit)"
    : "提交并推送 (Commit & Push)";
});

const handleCommitCommand = (command: "commit" | "commit-push") => {
  commitAction.value = command;
};

const handleCommit = async () => {
  const pushAfter = commitAction.value === "commit-push";
  await commit(pushAfter);
};

const handleStageFile = async (path: string) => {
  await stageFile(currentRepoPath.value, path);
};

const handleUnstageFile = async (path: string) => {
  await unstageFile(currentRepoPath.value, path);
};

const stageAll = async () => {
  if (!currentStatus.value) return;
  const files = currentStatus.value.unstaged.map((f) => f.path);
  await stageFiles(currentRepoPath.value, files);
};

const unstageAll = async () => {
  if (!currentStatus.value) return;
  const files = currentStatus.value.staged.map((f) => f.path);
  await unstageFiles(currentRepoPath.value, files);
};
</script>

<style scoped>
.git-committer-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* 顶部仓库信息 */
.sidebar-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.repo-meta {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  margin-right: 8px;
}

.repo-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repo-branch {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
}

.branch-icon {
  margin-right: 4px;
}

.ai-icon {
  margin-right: 4px;
}

.commit-btn-group {
  width: 100%;
  display: flex;
}

.commit-main-btn {
  flex: 1;
}

.commit-dropdown-btn {
  padding-left: 8px;
  padding-right: 8px;
}

.badge-margin {
  margin-left: 8px;
}

.action-all-btn {
  margin-left: auto;
  margin-right: 8px;
}

.settings-icon {
  margin-right: 6px;
}

.repo-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* AI 提交面板 */
.commit-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.ai-model-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.model-selector {
  flex: 1;
  min-width: 0;
}

.ai-btn {
  flex-shrink: 0;
}

.commit-input-wrapper {
  position: relative;
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

/* 更改列表 */
.changes-list-wrapper {
  flex: 1;
  overflow-y: auto;
}

.changes-collapse {
  border: none;
}

.changes-collapse :deep(.el-collapse-item__header) {
  height: 36px;
  line-height: 36px;
  background-color: transparent;
  border-bottom: var(--border-width) solid var(--border-color);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
}

.changes-collapse :deep(.el-collapse-item__wrap) {
  background-color: transparent;
  border-bottom: var(--border-width) solid var(--border-color);
}

.changes-collapse :deep(.el-collapse-item__content) {
  padding: 4px 0;
}

.collapse-title {
  display: flex;
  align-items: center;
  width: 100%;
}

.file-list {
  display: flex;
  flex-direction: column;
}

.file-item {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  gap: 8px;
  font-size: 12px;
}

.file-item:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.file-item:hover .action-btn {
  opacity: 1;
}

.file-status {
  font-family: monospace;
  font-weight: bold;
  font-size: 11px;
  width: 14px;
  text-align: center;
}

.file-status.m {
  color: var(--el-color-warning);
}
.file-status.a {
  color: var(--el-color-success);
}
.file-status.d {
  color: var(--el-color-danger);
}
.file-status.r {
  color: var(--el-color-info);
}
.file-status.t {
  color: var(--el-color-info);
}

.file-path {
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.file-dir {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.action-btn {
  opacity: 0;
  transition: opacity 0.2s ease;
  padding: 0;
  height: auto;
}

.empty-tip {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* 底部设置入口 */
.sidebar-footer {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.settings-btn {
  width: 100%;
  justify-content: flex-start;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.settings-btn:hover {
  color: var(--el-color-primary);
}
</style>
