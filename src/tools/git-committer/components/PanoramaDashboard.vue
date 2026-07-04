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

    <!-- 仓库卡片网格 -->
    <div class="dashboard-content">
      <div v-if="activeRepos.length === 0" class="empty-state">
        <CheckCircle2 :size="64" class="text-success empty-icon" />
        <h3 class="empty-title">所有仓库都很干净</h3>
        <p class="text-secondary empty-desc">
          当前没有检测到任何未提交的更改或未推送的提交。
        </p>
      </div>

      <div v-else class="repo-grid">
        <div
          v-for="repo in activeRepos"
          :key="repo.path"
          class="repo-card"
          :class="{ 'has-changes': hasChanges(repo.path) }"
        >
          <!-- 卡片头部 -->
          <div class="card-header">
            <div class="repo-info">
              <div class="repo-name-row">
                <span class="repo-name" :title="repo.alias || repo.name">
                  {{ repo.alias || repo.name }}
                </span>
                <span class="repo-branch" :title="getBranchName(repo.path)">
                  <GitBranch :size="12" class="branch-icon" />
                  {{ getBranchName(repo.path) }}
                </span>
              </div>
              <div class="repo-path" :title="repo.path">{{ repo.path }}</div>
            </div>

            <div class="card-actions">
              <el-tooltip content="拉取" placement="top">
                <el-button
                  circle
                  size="small"
                  :loading="repoLoadingStates[repo.path]?.pulling"
                  @click="handlePullRepo(repo.path)"
                >
                  <ArrowDown :size="12" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="推送" placement="top">
                <el-button
                  circle
                  size="small"
                  :loading="repoLoadingStates[repo.path]?.pushing"
                  @click="handlePushRepo(repo.path)"
                  :disabled="getAheadCount(repo.path) === 0"
                >
                  <ArrowUp :size="12" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="刷新" placement="top">
                <el-button circle size="small" @click="refreshRepo(repo.path)">
                  <RefreshCw :size="12" />
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <!-- 变更统计与快捷操作 -->
          <div class="changes-summary">
            <div class="summary-item">
              <span class="label">暂存的更改:</span>
              <el-tag
                :type="getStagedCount(repo.path) > 0 ? 'success' : 'info'"
                size="small"
                round
              >
                {{ getStagedCount(repo.path) }}
              </el-tag>
              <el-button
                v-if="getStagedCount(repo.path) > 0"
                link
                type="primary"
                size="small"
                class="action-btn"
                @click="handleUnstageAllFiles(repo.path)"
              >
                全部取消
              </el-button>
            </div>
            <div class="summary-item">
              <span class="label">工作区更改:</span>
              <el-tag
                :type="getUnstagedCount(repo.path) > 0 ? 'warning' : 'info'"
                size="small"
                round
              >
                {{ getUnstagedCount(repo.path) }}
              </el-tag>
              <el-button
                v-if="getUnstagedCount(repo.path) > 0"
                link
                type="primary"
                size="small"
                class="action-btn"
                @click="handleStageAllFiles(repo.path)"
              >
                全部暂存
              </el-button>
            </div>
            <div class="summary-item" v-if="getAheadCount(repo.path) > 0">
              <span class="label">未推送提交:</span>
              <el-tag type="primary" size="small" round>
                {{ getAheadCount(repo.path) }}
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
                :loading="repoLoadingStates[repo.path]?.generating"
                @click="handleGenerateMessageForRepo(repo.path)"
                :disabled="!canGenerateMessage(repo.path)"
              >
                <Sparkles :size="12" class="ai-icon" />
                AI 生成
              </el-button>
            </div>
            <el-input
              v-model="repoDrafts[repo.path]"
              type="textarea"
              :rows="3"
              placeholder="输入提交信息... (Ctrl+Enter 提交)"
              class="commit-input"
              @keydown.ctrl.enter="handleCommitRepo(repo.path)"
            />
            <div class="commit-btn-row">
              <el-button
                type="primary"
                size="small"
                class="w-full"
                :loading="repoLoadingStates[repo.path]?.committing"
                @click="handleCommitRepo(repo.path)"
                :disabled="!canCommit(repo.path)"
              >
                提交更改
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from "vue";
import {
  LayoutGrid,
  Plus,
  Sparkles,
  Check,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  GitBranch,
  CheckCircle2,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import {
  repositories,
  repoStatuses,
  repoSessions,
  isRefreshing,
  aiIncludeUnstaged,
} from "../composables/useGitCommitterState";
import {
  refreshAllStatuses,
  refreshStatus,
  stageFiles,
  unstageFiles,
  pullRepo,
  pushRepo,
  generateCommitMessage,
  executeCommit,
  stageAllRepos,
  pushAllRepos,
} from "../composables/useGitCommitterRunner";

// ===== 全局 Loading 状态 =====
const isGlobalStaging = ref(false);
const isGlobalGenerating = ref(false);
const isGlobalCommitting = ref(false);
const isGlobalPushing = ref(false);

// ===== 每个仓库的局部 Loading 状态 =====
interface RepoLoadingState {
  pulling: boolean;
  pushing: boolean;
  generating: boolean;
  committing: boolean;
}
const repoLoadingStates = reactive<Record<string, RepoLoadingState>>({});

// ===== 提交草稿双向绑定 =====
const repoDrafts = ref<Record<string, string>>({});

// 初始化每个仓库的 loading 状态和草稿
const initRepoStates = () => {
  repositories.value.forEach((repo) => {
    if (!repoLoadingStates[repo.path]) {
      repoLoadingStates[repo.path] = {
        pulling: false,
        pushing: false,
        generating: false,
        committing: false,
      };
    }
    if (!repoSessions.value[repo.path]) {
      repoSessions.value[repo.path] = {
        openTabs: [],
        activeTabPath: "",
        commitDraft: "",
      };
    }
    repoDrafts.value[repo.path] =
      repoSessions.value[repo.path].commitDraft || "";
  });
};

// 监听草稿变化，同步回全局 session
watch(
  repoDrafts,
  (newDrafts) => {
    Object.keys(newDrafts).forEach((path) => {
      if (repoSessions.value[path]) {
        repoSessions.value[path].commitDraft = newDrafts[path];
      }
    });
  },
  { deep: true }
);

// 监听仓库列表变化，重新初始化
watch(() => repositories.value, initRepoStates, {
  deep: true,
  immediate: true,
});

// ===== 过滤出有变更或有未推送提交的活跃仓库 =====
const activeRepos = computed(() => {
  return repositories.value.filter((repo) => {
    const status = repoStatuses.value[repo.path];
    if (!status) return true; // 未加载状态的也显示出来
    return (
      status.staged.length > 0 || status.unstaged.length > 0 || status.ahead > 0
    );
  });
});

// ===== 状态获取辅助函数 =====
const getStagedCount = (path: string) => {
  return repoStatuses.value[path]?.staged.length || 0;
};

const getUnstagedCount = (path: string) => {
  return repoStatuses.value[path]?.unstaged.length || 0;
};

const getAheadCount = (path: string) => {
  return repoStatuses.value[path]?.ahead || 0;
};

const getBranchName = (path: string) => {
  return repoStatuses.value[path]?.branch || "HEAD";
};

const hasChanges = (path: string) => {
  return getStagedCount(path) > 0 || getUnstagedCount(path) > 0;
};

const canGenerateMessage = (path: string) => {
  const staged = getStagedCount(path);
  const unstaged = getUnstagedCount(path);
  return staged > 0 || (aiIncludeUnstaged.value && unstaged > 0);
};

const canCommit = (path: string) => {
  return getStagedCount(path) > 0 && repoDrafts.value[path]?.trim();
};

// ===== 单仓库操作 =====
const refreshRepo = async (path: string) => {
  await refreshStatus(path);
};

const handleStageAllFiles = async (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return;
  const files = status.unstaged.map((f) => f.path);
  await stageFiles(path, files);
};

const handleUnstageAllFiles = async (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return;
  const files = status.staged.map((f) => f.path);
  await unstageFiles(path, files);
};

const handlePullRepo = async (path: string) => {
  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].pulling = true;
  try {
    await pullRepo(path);
  } finally {
    repoLoadingStates[path].pulling = false;
  }
};

const handlePushRepo = async (path: string) => {
  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].pushing = true;
  try {
    await pushRepo(path);
  } finally {
    repoLoadingStates[path].pushing = false;
  }
};

const handleGenerateMessageForRepo = async (path: string) => {
  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].generating = true;
  repoDrafts.value[path] = "";

  try {
    await generateCommitMessage(path, (chunk) => {
      repoDrafts.value[path] += chunk;
    });
  } finally {
    repoLoadingStates[path].generating = false;
  }
};

const handleCommitRepo = async (path: string) => {
  const msg = repoDrafts.value[path];
  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].committing = true;

  try {
    const ok = await executeCommit(path, msg);
    if (ok) {
      repoDrafts.value[path] = "";
    }
  } finally {
    repoLoadingStates[path].committing = false;
  }
};

// ===== 全局一键操作 =====
const handleStageAllRepos = async () => {
  isGlobalStaging.value = true;
  try {
    await stageAllRepos(activeRepos.value);
    customMessage.success("一键暂存完成");
  } finally {
    isGlobalStaging.value = false;
  }
};

const handleGenerateAllMessages = async () => {
  isGlobalGenerating.value = true;
  try {
    // 并发为所有符合条件的仓库生成提交消息
    await Promise.all(
      activeRepos.value
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
    for (const repo of activeRepos.value) {
      if (canCommit(repo.path)) {
        const msg = repoDrafts.value[repo.path];
        const ok = await executeCommit(repo.path, msg);
        if (ok) {
          successCount++;
          repoDrafts.value[repo.path] = "";
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

onMounted(() => {
  initRepoStates();
});
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
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
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

.branch-icon {
  margin-right: 4px;
}

.action-btn {
  margin-left: 8px;
}

.ai-icon {
  margin-right: 4px;
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

.text-placeholder {
  color: var(--el-text-color-placeholder);
}

/* 仓库网格 */
.repo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
  align-items: start;
}

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
</style>
