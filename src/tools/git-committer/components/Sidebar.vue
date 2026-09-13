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
        <el-tooltip content="编辑仓库 AI 提示词" placement="top">
          <el-button
            circle
            size="small"
            class="prompt-tab-btn"
            @click="openRepoPromptTab"
          >
            <MessageSquareText :size="14" />
          </el-button>
        </el-tooltip>
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
              <span class="collapse-title-text">暂存的更改</span>
              <span
                class="section-badge info"
                :class="{ active: !!currentStatus?.staged.length }"
              >
                {{ currentStatus?.staged.length || 0 }}
              </span>
              <div v-if="currentStatus?.staged.length" class="title-actions">
                <el-tooltip content="打开暂存更改差异" placement="bottom">
                  <button
                    type="button"
                    class="header-action-btn"
                    @click.stop="handleOpenChanges(true)"
                  >
                    <FileDiff :size="14" />
                  </button>
                </el-tooltip>
                <el-tooltip content="全部取消暂存" placement="bottom">
                  <button
                    type="button"
                    class="header-action-btn"
                    @click.stop="unstageAll"
                  >
                    <Minus :size="14" />
                  </button>
                </el-tooltip>
              </div>
            </div>
          </template>
          <div class="file-list">
            <div
              v-for="file in currentStatus?.staged"
              :key="file.path"
              class="file-item"
              :class="{ active: isActiveFile(file.path, true) }"
              @click="openDiffTab(file.path, true)"
            >
              <FileIcon :file-name="file.path" :size="14" class="file-icon" />
              <span class="file-path" :title="file.path">{{
                getFileName(file.path)
              }}</span>
              <span class="file-dir">{{ getFileDir(file.path) }}</span>
              <span class="file-actions">
                <el-tooltip content="取消暂存" placement="top">
                  <button
                    type="button"
                    class="action-btn"
                    @click.stop="handleUnstageFile(file.path)"
                  >
                    <Minus :size="14" />
                  </button>
                </el-tooltip>
              </span>
              <span class="file-status" :class="file.status.toLowerCase()">{{
                file.status
              }}</span>
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
              <span class="collapse-title-text">工作区更改</span>
              <span
                class="section-badge warning"
                :class="{ active: !!currentStatus?.unstaged.length }"
              >
                {{ currentStatus?.unstaged.length || 0 }}
              </span>
              <div v-if="currentStatus?.unstaged.length" class="title-actions">
                <el-tooltip content="打开所有更改差异" placement="bottom">
                  <button
                    type="button"
                    class="header-action-btn"
                    @click.stop="handleOpenChanges(false)"
                  >
                    <FileDiff :size="14" />
                  </button>
                </el-tooltip>
                <el-tooltip content="全部放弃更改" placement="bottom">
                  <button
                    type="button"
                    class="header-action-btn"
                    @click.stop="discardAll"
                  >
                    <Undo2 :size="14" />
                  </button>
                </el-tooltip>
                <el-tooltip content="全部暂存" placement="bottom">
                  <button
                    type="button"
                    class="header-action-btn"
                    @click.stop="stageAll"
                  >
                    <Plus :size="14" />
                  </button>
                </el-tooltip>
              </div>
            </div>
          </template>
          <div class="file-list">
            <div
              v-for="file in currentStatus?.unstaged"
              :key="file.path"
              class="file-item"
              :class="{ active: isActiveFile(file.path, false) }"
              @click="openDiffTab(file.path, false)"
            >
              <FileIcon :file-name="file.path" :size="14" class="file-icon" />
              <span class="file-path" :title="file.path">{{
                getFileName(file.path)
              }}</span>
              <span class="file-dir">{{ getFileDir(file.path) }}</span>
              <span class="file-actions">
                <el-tooltip content="放弃更改" placement="top">
                  <button
                    type="button"
                    class="action-btn"
                    @click.stop="handleDiscardFile(file.path)"
                  >
                    <Undo2 :size="14" />
                  </button>
                </el-tooltip>
                <el-tooltip content="暂存更改" placement="top">
                  <button
                    type="button"
                    class="action-btn"
                    @click.stop="handleStageFile(file.path)"
                  >
                    <Plus :size="14" />
                  </button>
                </el-tooltip>
              </span>
              <span class="file-status" :class="file.status.toLowerCase()">{{
                file.status
              }}</span>
            </div>
            <div v-if="!currentStatus?.unstaged.length" class="empty-tip">
              工作区干净
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
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
  Undo2,
  FileDiff,
  MessageSquareText,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import {
  currentRepo,
  currentRepoPath,
  currentStatus,
  currentSession,
  defaultModel,
  isRefreshing,
} from "../composables/useGitCommitterState";
import {
  refreshCurrentStatus,
  stageFile,
  unstageFile,
  stageFiles,
  unstageFiles,
  discardFile,
  discardFiles,
  openDiffTab,
  openChangesTab,
  openRepoPromptTab,
} from "../composables/useGitCommitterRunner";
import { useGitRepoWorkflow } from "../composables/useGitRepoWorkflow";
import { getFileName, getFileDir, buildTabKey } from "../utils";

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

const handleDiscardFile = (path: string) => {
  ElMessageBox.confirm(
    `确定要放弃「${getFileName(path)}」的更改吗？此操作不可撤销。`,
    "放弃更改",
    {
      confirmButtonText: "放弃更改",
      cancelButtonText: "取消",
      type: "warning",
      confirmButtonClass: "el-button--danger",
      lockScroll: false,
    }
  )
    .then(() => discardFile(currentRepoPath.value, path))
    .catch(() => {
      // 用户取消
    });
};

/** 当前文件是否是对应标签页的激活项 */
const isActiveFile = (path: string, isStaged: boolean) =>
  currentSession.value.activeTabPath === buildTabKey({ path, isStaged });

const handleOpenChanges = (isStaged: boolean) => {
  openChangesTab(isStaged);
};

const discardAll = () => {
  if (!currentStatus.value?.unstaged.length) return;
  ElMessageBox.confirm(
    `确定要放弃全部 ${currentStatus.value.unstaged.length} 个文件的更改吗？此操作不可撤销。`,
    "放弃全部更改",
    {
      confirmButtonText: "全部放弃",
      cancelButtonText: "取消",
      type: "warning",
      confirmButtonClass: "el-button--danger",
      lockScroll: false,
    }
  )
    .then(() =>
      discardFiles(
        currentRepoPath.value,
        currentStatus.value?.unstaged.map((f) => f.path) || []
      )
    )
    .catch(() => {
      // 用户取消
    });
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
  /* 文件状态字母：对齐 VS Code Git 装饰色（亮色主题） */
  --git-status-modified: #895503;
  --git-status-added: #587c0c;
  --git-status-deleted: #ad0707;
  --git-status-untracked: #007100;
  --git-status-renamed: #007100;
}

:global(html.dark) .git-committer-sidebar {
  /* 文件状态字母：对齐 VS Code Git 装饰色（暗色主题） */
  --git-status-modified: #e2c08d;
  --git-status-added: #81b88b;
  --git-status-deleted: #c74e39;
  --git-status-untracked: #73c991;
  --git-status-renamed: #73c991;
}

/* 顶部仓库信息 */
.sidebar-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
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

.title-actions {
  margin-left: auto;
  margin-right: 8px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.header-action-btn:hover {
  color: var(--el-text-color-primary);
}

.header-action-btn:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: -1px;
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
  margin-left: 0;
  flex-shrink: 0;
}

.prompt-tab-btn {
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
  border-bottom: 0px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.changes-collapse :deep(.el-collapse-item__wrap) {
  background-color: transparent;
  border-bottom: 0px;
}

.changes-collapse :deep(.el-collapse-item__content) {
  padding: 4px 0;
}

.collapse-title {
  display: flex;
  align-items: center;
  width: 100%;
}

.collapse-title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  margin-left: 10px;
  transform: translateY(1px);
  box-sizing: border-box;
}

.section-badge.info {
  background-color: rgba(
    var(--el-color-info-rgb, 144, 147, 153),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-text-color-secondary);
}

.section-badge.info.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-primary);
}

.section-badge.warning {
  background-color: rgba(
    var(--el-color-info-rgb, 144, 147, 153),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-text-color-secondary);
}

.section-badge.warning.active {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.18)
  );
  color: var(--el-color-warning);
}

.file-list {
  display: flex;
  flex-direction: column;
}

.file-item {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  gap: 6px;
  font-size: 12px;
}

.file-item:hover,
.file-item.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.file-icon {
  flex-shrink: 0;
}

.file-status {
  flex-shrink: 0;
  font-family: inherit;
  font-weight: 600;
  font-size: 11px;
  width: 14px;
  text-align: center;
}

.file-status.m {
  color: var(--git-status-modified);
}
.file-status.a {
  color: var(--git-status-added);
}
.file-status.u {
  color: var(--git-status-untracked);
}
.file-status.d {
  color: var(--git-status-deleted);
}
.file-status.r,
.file-status.c {
  color: var(--git-status-renamed);
}
.file-status.t {
  color: var(--git-status-modified);
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
  min-width: 0;
}

.file-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.file-item:hover .file-actions,
.file-item.active .file-actions {
  display: flex;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.action-btn:hover {
  color: var(--el-text-color-primary);
}

.action-btn:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: -1px;
}

.empty-tip {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
