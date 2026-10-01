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
        <div class="repo-branch" :title="currentStatus?.branch">
          <GitBranch :size="13" class="branch-icon" />
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
        <el-tooltip content="打开仓库所在目录" placement="bottom">
          <el-button circle size="small" @click="handleOpenRepoFolder">
            <FolderOpen :size="14" />
          </el-button>
        </el-tooltip>
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
import { ref, watch } from "vue";
import {
  GitBranch,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  FolderOpen,
  PanelRight,
  PanelRightClose,
  Search,
} from "lucide-vue-next";
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
import { refreshCurrentStatus } from "../composables/useGitCommitterRunner";
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

.branch-icon {
  margin-right: 4px;
  flex-shrink: 0;
}

.repo-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
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
</style>
