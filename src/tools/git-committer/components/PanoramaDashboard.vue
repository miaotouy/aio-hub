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
  <div class="panorama-dashboard">
    <!-- 顶部全局操作栏 -->
    <div class="global-action-bar">
      <div class="title-section">
        <LayoutGrid :size="18" class="text-primary title-icon" />
        <span class="title">全景模式看板</span>
        <span class="subtitle">聚合管理所有仓库的变更与提交</span>
      </div>

      <div class="actions-section">
        <el-button-group>
          <el-button
            type="primary"
            plain
            size="small"
            :loading="isGlobalStaging"
            @click="handleStageAllRepos"
          >
            <Plus :size="12" class="btn-icon" />
            一键暂存所有
          </el-button>
          <el-button
            type="primary"
            plain
            size="small"
            :loading="isGlobalGenerating"
            @click="handleGenerateAllMessages"
          >
            <Sparkles :size="12" class="btn-icon" />
            一键 AI 生成
          </el-button>
          <el-button
            type="primary"
            size="small"
            :loading="isGlobalCommitting"
            @click="handleCommitAllRepos"
          >
            <Check :size="12" class="btn-icon" />
            一键提交所有
          </el-button>
          <el-button
            type="success"
            size="small"
            :loading="isGlobalPushing"
            @click="handlePushAllRepos"
          >
            <ArrowUp :size="12" class="btn-icon" />
            一键推送所有
          </el-button>
        </el-button-group>

        <el-tooltip content="刷新所有仓库状态" placement="bottom">
          <el-button
            circle
            size="small"
            :loading="isRefreshing"
            @click="refreshAllStatuses"
            class="refresh-btn"
          >
            <RefreshCw v-if="!isRefreshing" :size="12" />
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="dashboard-toolbar">
      <span class="filter-label">显示</span>
      <el-segmented
        v-model="filterMode"
        :options="filterOptions"
        size="small"
      />
      <span class="repo-count">
        {{ visibleRepos.length }} / {{ repositories.length }} 个仓库
      </span>
    </div>

    <!-- 仓库卡片网格 -->
    <div class="dashboard-content">
      <div v-if="visibleRepos.length === 0" class="empty-state">
        <CheckCircle2 :size="64" class="text-success empty-icon" />
        <h3 class="empty-title">{{ emptyTitle }}</h3>
        <p class="text-secondary empty-desc">
          {{ emptyDescription }}
        </p>
      </div>

      <div v-else class="repo-grid">
        <RepoCard v-for="repo in visibleRepos" :key="repo.path" :repo="repo" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  LayoutGrid,
  Plus,
  Sparkles,
  Check,
  ArrowUp,
  RefreshCw,
  CheckCircle2,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import {
  repositories,
  repoStatuses,
  repoSessions,
  isRefreshing,
  aiIncludeUnstaged,
  updateRepoCommitDraft,
} from "../composables/useGitCommitterState";
import {
  refreshAllStatuses,
  executeCommit,
  stageAllRepos,
  pushAllRepos,
  generateCommitMessage,
} from "../composables/useGitCommitterRunner";
import RepoCard from "./RepoCard.vue";

type RepoFilter = "all" | "changes" | "staged" | "ahead" | "clean";

const filterMode = ref<RepoFilter>("changes");
const filterOptions = [
  { label: "有更改", value: "changes" },
  { label: "全部", value: "all" },
  { label: "已暂存", value: "staged" },
  { label: "待推送", value: "ahead" },
  { label: "干净", value: "clean" },
];

// ===== 全局 Loading 状态 =====
const isGlobalStaging = ref(false);
const isGlobalGenerating = ref(false);
const isGlobalCommitting = ref(false);
const isGlobalPushing = ref(false);

// ===== 过滤出有变更或有未推送提交的活跃仓库 =====
const visibleRepos = computed(() => {
  return repositories.value.filter((repo) => {
    const status = repoStatuses.value[repo.path];
    if (!status) {
      return filterMode.value === "all" || filterMode.value === "changes";
    }
    const hasChanges = status.staged.length > 0 || status.unstaged.length > 0;
    if (filterMode.value === "all") return true;
    if (filterMode.value === "staged") return status.staged.length > 0;
    if (filterMode.value === "ahead") return status.ahead > 0;
    if (filterMode.value === "clean") {
      return !hasChanges && status.ahead === 0;
    }
    return hasChanges || status.ahead > 0;
  });
});

// 批量操作始终针对有工作流动作可执行的仓库，不受显示筛选影响。
const batchRepos = computed(() => {
  return repositories.value.filter((repo) => {
    const status = repoStatuses.value[repo.path];
    if (!status) return true;
    return (
      status.staged.length > 0 || status.unstaged.length > 0 || status.ahead > 0
    );
  });
});

const emptyTitle = computed(() => {
  if (repositories.value.length === 0) return "还没有关联仓库";
  if (filterMode.value === "staged") return "没有已暂存更改的仓库";
  if (filterMode.value === "ahead") return "没有待推送的仓库";
  if (filterMode.value === "clean") return "没有干净的仓库";
  if (filterMode.value === "changes") return "所有仓库都很干净";
  return "没有符合条件的仓库";
});

const emptyDescription = computed(() => {
  if (repositories.value.length === 0) {
    return "使用左侧仓库栏的添加按钮导入本地 Git 仓库。";
  }
  if (filterMode.value === "staged") {
    return "当前没有已暂存的更改，切换筛选条件查看其他仓库。";
  }
  if (filterMode.value === "ahead") return "当前没有检测到未推送的提交。";
  if (filterMode.value === "clean") {
    return "当前仓库仍有未提交的更改或未推送的提交。";
  }
  if (filterMode.value === "changes") {
    return "当前没有检测到任何未提交的更改或未推送的提交。";
  }
  return "切换筛选条件查看其他仓库。";
});

// ===== 辅助校验函数 =====
const getStagedCount = (path: string) => {
  return repoStatuses.value[path]?.staged.length || 0;
};

const getUnstagedCount = (path: string) => {
  return repoStatuses.value[path]?.unstaged.length || 0;
};

const canGenerateMessage = (path: string) => {
  const staged = getStagedCount(path);
  const unstaged = getUnstagedCount(path);
  return staged > 0 || (aiIncludeUnstaged.value && unstaged > 0);
};

const canCommit = (path: string) => {
  const draft = repoSessions.value[path]?.commitDraft || "";
  return getStagedCount(path) > 0 && draft.trim();
};

// ===== 全局一键操作 =====
const handleStageAllRepos = async () => {
  isGlobalStaging.value = true;
  try {
    await stageAllRepos(batchRepos.value);
    customMessage.success("一键暂存完成");
  } finally {
    isGlobalStaging.value = false;
  }
};

const handleGenerateMessageForRepo = async (path: string) => {
  updateRepoCommitDraft(path, "");
  await generateCommitMessage(path, (chunk) => {
    const currentDraft = repoSessions.value[path]?.commitDraft || "";
    updateRepoCommitDraft(path, currentDraft + chunk);
  });
};

const handleGenerateAllMessages = async () => {
  isGlobalGenerating.value = true;
  try {
    // 并发为所有符合条件的仓库生成提交消息
    await Promise.all(
      batchRepos.value
        .filter((repo) => canGenerateMessage(repo.path))
        .map((repo) =>
          handleGenerateMessageForRepo(repo.path).catch(() => null)
        )
    );
    customMessage.success("一键 AI 生成完成");
  } finally {
    isGlobalGenerating.value = false;
  }
};

const handleCommitAllRepos = async () => {
  isGlobalCommitting.value = true;
  try {
    let successCount = 0;
    for (const repo of batchRepos.value) {
      if (canCommit(repo.path)) {
        const msg = repoSessions.value[repo.path]?.commitDraft || "";
        const ok = await executeCommit(repo.path, msg);
        if (ok) {
          successCount++;
        }
      }
    }
    if (successCount > 0) {
      customMessage.success(`成功提交了 ${successCount} 个仓库`);
    } else {
      customMessage.warning(
        "没有符合提交条件的仓库（需有暂存文件且有提交信息）"
      );
    }
  } finally {
    isGlobalCommitting.value = false;
  }
};

const handlePushAllRepos = async () => {
  isGlobalPushing.value = true;
  try {
    const successCount = await pushAllRepos();
    if (successCount > 0) {
      customMessage.success(`成功推送了 ${successCount} 个仓库`);
    } else {
      customMessage.info("没有需要推送的仓库");
    }
  } finally {
    isGlobalPushing.value = false;
  }
};
</script>

<style scoped>
.panorama-dashboard {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: transparent;
  overflow: hidden;
}

/* 顶部全局操作栏 */
.global-action-bar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.dashboard-toolbar {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--card-bg);
  flex-shrink: 0;
}

.filter-label,
.repo-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.repo-count {
  margin-left: auto;
}

.title-section {
  display: flex;
  align-items: center;
}

.title-icon {
  margin-right: 8px;
}

.btn-icon {
  margin-right: 4px;
}

.refresh-btn {
  margin-left: 8px;
}

.empty-icon {
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.empty-desc {
  font-size: 14px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 12px;
}

.actions-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* 看板内容区 */
.dashboard-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: var(--card-bg);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

/* 仓库网格 */
.repo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .global-action-bar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
  }

  .actions-section {
    width: 100%;
    justify-content: flex-start;
  }

  .actions-section :deep(.el-button-group) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 6px;
  }

  .actions-section :deep(.el-button-group .el-button) {
    width: 100%;
    margin: 0;
    border-radius: 4px;
  }

  .dashboard-toolbar {
    padding: 8px 16px;
    flex-wrap: wrap;
  }

  .repo-count {
    margin-left: 0;
  }
}
</style>
