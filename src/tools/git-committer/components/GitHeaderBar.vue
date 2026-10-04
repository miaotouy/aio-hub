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
  <div class="git-header-bar">
    <!-- 左区：仓库元信息与快捷操作 -->
    <div class="header-left">
      <div class="repo-meta">
        <div
          class="repo-title"
          :title="currentRepo?.alias || currentRepo?.name"
        >
          {{ currentRepo?.alias || currentRepo?.name }}
        </div>
        <!-- 分支下拉切换 Popover -->
        <el-popover
          placement="bottom-start"
          :width="260"
          trigger="click"
          popper-class="branch-select-popper"
          @show="handleBranchPopoverShow"
        >
          <template #reference>
            <div class="repo-branch clickable" :title="`当前分支: ${currentStatus?.branch || 'HEAD'} (点击快速切换/管理)`">
              <GitBranch :size="13" class="branch-icon" />
              <span>{{ currentStatus?.branch || "HEAD" }}</span>
              <ChevronDown :size="12" class="branch-arrow" />
            </div>
          </template>
          <div class="branch-popover-content">
            <div class="branch-popover-header">
              <span class="title">本地与远程分支</span>
              <el-button type="primary" link size="small" @click="handleOpenRepoOverview">
                分支全景
              </el-button>
            </div>
            <div class="branch-list-scroller">
              <div
                v-for="b in branchList"
                :key="b.name"
                class="branch-select-item"
                :class="{ active: b.isCurrent }"
                @click="handleSelectBranch(b.name)"
              >
                <span class="branch-badge" :class="b.isRemote ? 'remote' : 'local'">
                  {{ b.isRemote ? '远程' : '本地' }}
                </span>
                <span class="branch-name text-ellipsis" :title="b.name">{{ b.name }}</span>
                <Check v-if="b.isCurrent" :size="14" class="check-icon" />
              </div>
            </div>
          </div>
        </el-popover>
      </div>

      <div class="repo-actions">
        <el-tooltip content="仓库概览仪表盘" placement="bottom">
          <el-button
            class="action-btn-overview"
            circle
            size="small"
            @click="handleOpenRepoOverview"
          >
            <Gauge :size="14" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="在系统终端中打开" placement="bottom">
          <el-button
            class="action-btn-terminal"
            circle
            size="small"
            @click="handleOpenTerminal"
          >
            <Terminal :size="14" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="拉取远程更改" placement="bottom">
          <el-button
            class="action-btn-pull"
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
            class="action-btn-push"
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
            class="action-btn-refresh"
            circle
            size="small"
            :loading="isRefreshing"
            @click="refreshCurrentStatus"
          >
            <RefreshCw v-if="!isRefreshing" :size="14" />
          </el-button>
        </el-tooltip>
        <el-tooltip content="打开仓库所在目录" placement="bottom">
          <el-button
            class="action-btn-reveal"
            circle
            size="small"
            @click="handleOpenRepoFolder"
          >
            <FolderOpen :size="14" />
          </el-button>
        </el-tooltip>

        <!-- 更多 Git 操作菜单 (类似 VS Code 源代码管理顶部的 ... 菜单) -->
        <el-dropdown trigger="click" @command="handleMoreCommand">
          <el-button circle size="small" title="更多 Git 操作">
            <MoreHorizontal :size="14" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu class="git-header-more-menu">
              <el-dropdown-item command="overview">
                <Gauge :size="14" class="menu-item-icon" />
                <span>仓库全景概览...</span>
              </el-dropdown-item>
              <el-dropdown-item command="terminal">
                <Terminal :size="14" class="menu-item-icon" />
                <span>在终端中打开</span>
              </el-dropdown-item>
              <el-dropdown-item command="reveal">
                <FolderOpen :size="14" class="menu-item-icon" />
                <span>在资源管理器中显示</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="pull" :disabled="isPulling">
                <ArrowDown :size="14" class="menu-item-icon" />
                <span>拉取远程更改 (Pull)</span>
              </el-dropdown-item>
              <el-dropdown-item command="push" :disabled="isPushing">
                <ArrowUp :size="14" class="menu-item-icon" />
                <span>推送本地提交 (Push)</span>
              </el-dropdown-item>
              <el-dropdown-item command="refresh" :disabled="isRefreshing">
                <RefreshCw :size="14" class="menu-item-icon" />
                <span>刷新状态 (Refresh)</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="new-branch">
                <GitBranch :size="14" class="menu-item-icon" />
                <span>新建分支...</span>
              </el-dropdown-item>
              <el-dropdown-item command="new-tag">
                <Tag :size="14" class="menu-item-icon" />
                <span>新建标签 (Tag)...</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="stash-save">
                <Archive :size="14" class="menu-item-icon" />
                <span>储藏：储藏当前更改 (Stash)</span>
              </el-dropdown-item>
              <el-dropdown-item command="stash-pop">
                <ArchiveRestore :size="14" class="menu-item-icon" />
                <span>储藏：弹出最新储藏 (Pop)</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="undo-last-commit">
                <Undo2 :size="14" class="menu-item-icon" />
                <span>提交：撤销上次提交 (Undo)</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 中区：工作区更改文件与内容搜索 -->
    <div ref="searchContainerRef" class="header-center">
      <el-input
        ref="searchInputRef"
        v-model="fileSearchKeyword"
        class="file-search-input"
        placeholder="搜索更改文件名或内容..."
        clearable
        :prefix-icon="Search"
        spellcheck="false"
        @focus="handleInputFocus"
        @keydown.esc="handleCloseDropdown"
      />

      <!-- 类似目录搜索的结果下拉浮窗 -->
      <GitSearchDropdown
        v-if="isDropdownVisible && fileSearchKeyword.trim()"
        :search-keyword="fileSearchKeyword"
        :is-searching="isSearching"
        :search-results="searchResults"
        :total-matched-files="totalMatchedFiles"
        :total-matched-lines="totalMatchedLines"
        @select-file="handleSelectSearchResult"
        @close="handleCloseDropdown"
      />
    </div>

    <!-- 右区：右侧栏展开/收起 -->
    <div class="header-right">
      <el-tooltip
        :content="isRightSidebarExpanded ? '收起历史与统计' : '展开历史与统计'"
        placement="bottom"
      >
        <el-button
          circle
          size="small"
          @click="isRightSidebarExpanded = !isRightSidebarExpanded"
        >
          <component
            :is="isRightSidebarExpanded ? PanelRightClose : PanelRight"
            :size="14"
          />
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import {
  GitBranch,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  FolderOpen,
  PanelRight,
  PanelRightClose,
  Search,
  ChevronDown,
  Check,
  Gauge,
  Terminal,
  MoreHorizontal,
  Tag,
  Archive,
  ArchiveRestore,
  Undo2,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { openPath } from "@tauri-apps/plugin-opener";
import { onClickOutside } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import {
  currentRepo,
  currentRepoPath,
  currentStatus,
  isRightSidebarExpanded,
  isRefreshing,
  fileSearchKeyword,
} from "../composables/useGitCommitterState";
import {
  refreshCurrentStatus,
  openRepoOverviewTab,
} from "../composables/useGitCommitterRunner";
import {
  repoOverview,
  loadRepoOverview,
  checkoutBranch,
  createBranch,
  createTag,
  saveStash,
  popStash,
  undoLastCommit,
  openTerminal,
} from "../composables/useGitOverview";
import { useGitRepoWorkflow } from "../composables/useGitRepoWorkflow";
import {
  useGitWorkspaceSearch,
  type GitSearchResultFileItem,
} from "../composables/useGitWorkspaceSearch";
import GitSearchDropdown from "./GitSearchDropdown.vue";

// 复用统一的工作流 Composable（拉取/推送运行态按仓库隔离）
const {
  isPulling,
  isPushing,
  pull: handlePull,
  push: handlePush,
} = useGitRepoWorkflow(currentRepoPath);

// 工作区与内容搜索
const {
  isSearching,
  searchResults,
  totalMatchedFiles,
  totalMatchedLines,
  openSearchResult,
} = useGitWorkspaceSearch(currentRepoPath);

const searchContainerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<any>(null);
const isDropdownVisible = ref(false);

const handleInputFocus = () => {
  if (fileSearchKeyword.value.trim()) {
    isDropdownVisible.value = true;
  }
};

watch(fileSearchKeyword, (kw) => {
  if (kw.trim()) {
    isDropdownVisible.value = true;
  } else {
    isDropdownVisible.value = false;
  }
});

const handleCloseDropdown = () => {
  isDropdownVisible.value = false;
};

// 点击外部关闭搜索下拉面板
onClickOutside(searchContainerRef, () => {
  isDropdownVisible.value = false;
});

const handleSelectSearchResult = (item: GitSearchResultFileItem) => {
  openSearchResult(item);
  isDropdownVisible.value = false;
};

const handleOpenRepoFolder = async () => {
  const repoPath = currentRepoPath.value;
  if (!repoPath) return;
  try {
    await openPath(repoPath);
  } catch {
    customMessage.error("无法打开仓库所在目录");
  }
};

const branchList = computed(() => {
  return repoOverview.value?.branches || [];
});

const handleBranchPopoverShow = () => {
  if (currentRepoPath.value) {
    loadRepoOverview(currentRepoPath.value);
  }
};

const handleSelectBranch = async (branchName: string) => {
  if (currentRepoPath.value) {
    await checkoutBranch(currentRepoPath.value, branchName);
  }
};

const handleOpenRepoOverview = () => {
  openRepoOverviewTab();
};

const handleOpenTerminal = async () => {
  if (currentRepoPath.value) {
    await openTerminal(currentRepoPath.value);
  }
};

const handleMoreCommand = async (command: string) => {
  const repoPath = currentRepoPath.value;
  if (!repoPath) return;

  switch (command) {
    case "overview":
      openRepoOverviewTab();
      break;
    case "terminal":
      await openTerminal(repoPath);
      break;
    case "reveal":
      await handleOpenRepoFolder();
      break;
    case "pull":
      await handlePull();
      break;
    case "push":
      await handlePush();
      break;
    case "refresh":
      await refreshCurrentStatus();
      break;
    case "new-branch": {
      ElMessageBox.prompt("请输入新分支的名称：", "新建分支", {
        confirmButtonText: "创建分支",
        cancelButtonText: "取消",
        inputPlaceholder: "例如 feature/my-feature",
        inputPattern: /\S+/,
        inputErrorMessage: "分支名不能为空",
        lockScroll: false,
      })
        .then(async ({ value }) => {
          if (value?.trim()) {
            await createBranch(repoPath, value.trim());
          }
        })
        .catch(() => {});
      break;
    }
    case "new-tag": {
      ElMessageBox.prompt("请输入新标签的名称：", "新建标签 (Tag)", {
        confirmButtonText: "创建标签",
        cancelButtonText: "取消",
        inputPlaceholder: "例如 v1.0.0",
        inputPattern: /\S+/,
        inputErrorMessage: "标签名不能为空",
        lockScroll: false,
      })
        .then(async ({ value }) => {
          if (value?.trim()) {
            await createTag(repoPath, value.trim());
          }
        })
        .catch(() => {});
      break;
    }
    case "stash-save": {
      ElMessageBox.prompt("请输入储藏说明备注（可选）：", "保存更改到储藏 (Stash)", {
        confirmButtonText: "储藏",
        cancelButtonText: "取消",
        inputPlaceholder: "例如 WIP: 优化布局中...",
        lockScroll: false,
      })
        .then(async ({ value }) => {
          await saveStash(repoPath, value?.trim() || undefined, true);
        })
        .catch(() => {});
      break;
    }
    case "stash-pop": {
      await popStash(repoPath);
      break;
    }
    case "undo-last-commit": {
      ElMessageBox.confirm(
        "确定要撤销最近一次提交吗？提交记录将被撤回，所有变更将保留在暂存区（相当于 git reset --soft HEAD~1）。",
        "撤销上一次提交",
        {
          confirmButtonText: "撤销提交",
          cancelButtonText: "取消",
          type: "warning",
          lockScroll: false,
        }
      )
        .then(async () => {
          await undoLastCommit(repoPath);
        })
        .catch(() => {});
      break;
    }
  }
};
</script>

<style scoped>
.git-header-bar {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  flex-shrink: 0;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  user-select: none;
  container-type: inline-size;
  container-name: git-header;
}

/* 左区：仓库信息与操作 */
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 1;
  min-width: 0;
}

.repo-meta {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  max-width: 220px;
}

.repo-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.repo-branch {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  line-height: 1.3;
}

.repo-branch span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-branch.clickable {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: -4px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.repo-branch.clickable:hover {
  background-color: var(--el-fill-color-light, rgba(255, 255, 255, 0.06));
  color: var(--el-color-primary);
}

.branch-arrow {
  margin-left: 3px;
  opacity: 0.7;
}

.branch-icon {
  margin-right: 4px;
  flex-shrink: 0;
}

.branch-popover-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.branch-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 4px;
}

.branch-list-scroller {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.branch-select-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.branch-select-item:hover {
  background-color: var(--el-fill-color-light, rgba(255, 255, 255, 0.08));
}

.branch-select-item.active {
  color: var(--el-color-primary);
  font-weight: 600;
}

.branch-badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 2px;
}
.branch-badge.local { background: rgba(64, 158, 255, 0.2); color: #409eff; }
.branch-badge.remote { background: rgba(230, 162, 60, 0.2); color: #e6a23c; }

.branch-name {
  flex: 1;
}

.check-icon {
  color: var(--el-color-primary);
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-item-icon {
  margin-right: 8px;
  opacity: 0.8;
}

.git-header-more-menu :deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  font-size: 12px;
}

.repo-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.el-button+.el-button {
    margin-left: 2px;
}

/* 中区：搜索框与结果浮窗 */
.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
  position: relative;
}

.file-search-input {
  width: 100%;
  max-width: 360px;
}

.file-search-input :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

.file-search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

/* 右区：面板控制 */
.header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* ========================================================
   宽度响应式适配：双轨支持容器查询 (首选) 与视口媒体查询 (兜底)
   ======================================================== */

/* 1. 中等宽度响应式 (<= 920px)：隐藏次要动作（终端、在资源管理器显示） */
@container git-header (max-width: 920px) {
  .action-btn-terminal,
  .action-btn-reveal {
    display: none !important;
  }
  .repo-meta {
    max-width: 170px;
  }
  .file-search-input {
    max-width: 280px;
  }
}
@media (max-width: 920px) {
  .action-btn-terminal,
  .action-btn-reveal {
    display: none !important;
  }
  .repo-meta {
    max-width: 170px;
  }
  .file-search-input {
    max-width: 280px;
  }
}

/* 2. 较窄宽度响应式 (<= 740px)：隐藏概览按钮、压缩搜索与元信息、缩短间距 */
@container git-header (max-width: 740px) {
  .git-header-bar {
    padding: 0 8px;
    gap: 8px;
  }
  .header-left {
    gap: 8px;
  }
  .action-btn-overview {
    display: none !important;
  }
  .repo-meta {
    max-width: 130px;
  }
  .file-search-input {
    max-width: 200px;
  }
}
@media (max-width: 740px) {
  .git-header-bar {
    padding: 0 8px;
    gap: 8px;
  }
  .header-left {
    gap: 8px;
  }
  .action-btn-overview {
    display: none !important;
  }
  .repo-meta {
    max-width: 130px;
  }
  .file-search-input {
    max-width: 200px;
  }
}

/* 3. 紧凑宽度响应式 (<= 560px)：拉取/推送收进下拉菜单，仅保留刷新与更多 */
@container git-header (max-width: 560px) {
  .git-header-bar {
    padding: 0 6px;
    gap: 6px;
  }
  .header-left {
    gap: 6px;
  }
  .action-btn-pull,
  .action-btn-push {
    display: none !important;
  }
  .repo-meta {
    max-width: 95px;
  }
  .repo-branch span {
    max-width: 60px;
  }
  .file-search-input {
    max-width: 150px;
  }
}
@media (max-width: 560px) {
  .git-header-bar {
    padding: 0 6px;
    gap: 6px;
  }
  .header-left {
    gap: 6px;
  }
  .action-btn-pull,
  .action-btn-push {
    display: none !important;
  }
  .repo-meta {
    max-width: 95px;
  }
  .repo-branch span {
    max-width: 60px;
  }
  .file-search-input {
    max-width: 150px;
  }
}

/* 4. 极窄宽度响应式 (<= 420px)：进一步压减元数据宽度 */
@container git-header (max-width: 420px) {
  .repo-meta {
    max-width: 75px;
  }
  .file-search-input {
    max-width: 120px;
  }
}
@media (max-width: 420px) {
  .repo-meta {
    max-width: 75px;
  }
  .file-search-input {
    max-width: 120px;
  }
}
</style>
