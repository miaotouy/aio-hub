<template>
  <div class="panorama-dashboard">
    <!-- 顶部全局操作栏 -->
    <div class="global-action-bar">
      <div class="title-section">
        <LayoutGrid class="w-5 h-5 text-primary mr-2" />
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
            @click="stageAllRepos"
          >
            <Plus class="w-3.5 h-3.5 mr-1" />
            一键暂存所有
          </el-button>
          <el-button
            type="primary"
            plain
            size="small"
            :loading="isGlobalGenerating"
            @click="generateAllMessages"
          >
            <Sparkles class="w-3.5 h-3.5 mr-1" />
            一键 AI 生成
          </el-button>
          <el-button
            type="primary"
            size="small"
            :loading="isGlobalCommitting"
            @click="commitAllRepos"
          >
            <Check class="w-3.5 h-3.5 mr-1" />
            一键提交所有
          </el-button>
          <el-button
            type="success"
            size="small"
            :loading="isGlobalPushing"
            @click="pushAllRepos"
          >
            <ArrowUp class="w-3.5 h-3.5 mr-1" />
            一键推送所有
          </el-button>
        </el-button-group>

        <el-tooltip content="刷新所有仓库状态" placement="bottom">
          <el-button
            circle
            size="small"
            :loading="isRefreshing"
            @click="refreshAllStatuses"
            class="ml-2"
          >
            <RefreshCw v-if="!isRefreshing" class="w-3.5 h-3.5" />
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 仓库卡片网格 -->
    <div class="dashboard-content">
      <div v-if="activeRepos.length === 0" class="empty-state">
        <CheckCircle2 class="w-16 h-16 text-success mb-4" />
        <h3 class="text-lg font-semibold mb-2">所有仓库都很干净</h3>
        <p class="text-sm text-secondary">
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
                  <GitBranch class="w-3 h-3 mr-1" />
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
                  @click="pullRepo(repo.path)"
                >
                  <ArrowDown class="w-3 h-3" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="推送" placement="top">
                <el-button
                  circle
                  size="small"
                  :loading="repoLoadingStates[repo.path]?.pushing"
                  @click="pushRepo(repo.path)"
                  :disabled="getAheadCount(repo.path) === 0"
                >
                  <ArrowUp class="w-3 h-3" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="刷新" placement="top">
                <el-button circle size="small" @click="refreshRepo(repo.path)">
                  <RefreshCw class="w-3 h-3" />
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
                class="ml-2"
                @click="unstageAllFiles(repo.path)"
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
                class="ml-2"
                @click="stageAllFiles(repo.path)"
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
                @click="generateMessageForRepo(repo.path)"
                :disabled="!canGenerateMessage(repo.path)"
              >
                <Sparkles class="w-3 h-3 mr-1" />
                AI 生成
              </el-button>
            </div>
            <el-input
              v-model="repoDrafts[repo.path]"
              type="textarea"
              :rows="3"
              placeholder="输入提交信息... (Ctrl+Enter 提交)"
              class="commit-input"
              @keydown.ctrl.enter="commitRepo(repo.path)"
            />
            <div class="commit-btn-row">
              <el-button
                type="primary"
                size="small"
                class="w-full"
                :loading="repoLoadingStates[repo.path]?.committing"
                @click="commitRepo(repo.path)"
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
import { invoke } from "@tauri-apps/api/core";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import {
  repositories,
  repoStatuses,
  repoSessions,
  isRefreshing,
  defaultModelRef,
  systemPromptRef,
  aiIncludeUnstagedRef,
} from "../composables/useGitCommitterState";
import {
  refreshAllStatuses,
  refreshStatus,
} from "../composables/useGitCommitterRunner";
import { errorHandler } from "../composables/useGitCommitterErrorHandler";
import type { FileStatus } from "../types";

const logger = createModuleLogger("git-committer/panorama");
const { sendRequest } = useLlmRequest();

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
  return staged > 0 || (aiIncludeUnstagedRef.value && unstaged > 0);
};

const canCommit = (path: string) => {
  return getStagedCount(path) > 0 && repoDrafts.value[path]?.trim();
};

// ===== 单仓库操作 =====
const refreshRepo = async (path: string) => {
  await refreshStatus(path);
};

const stageAllFiles = async (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return;
  const files = status.unstaged.map((f) => f.path);

  const ok = await errorHandler.wrapAsync(
    () => invoke<void>("git_stage_files", { path, files }),
    { userMessage: "暂存文件失败" }
  );
  if (ok !== null) {
    await refreshStatus(path);
  }
};

const unstageAllFiles = async (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return;
  const files = status.staged.map((f) => f.path);

  const ok = await errorHandler.wrapAsync(
    () => invoke<void>("git_unstage_files", { path, files }),
    { userMessage: "取消暂存失败" }
  );
  if (ok !== null) {
    await refreshStatus(path);
  }
};

const pullRepo = async (path: string) => {
  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].pulling = true;
  try {
    const ok = await errorHandler.wrapAsync(
      () => invoke<void>("git_pull", { path }),
      { userMessage: "拉取失败" }
    );
    if (ok !== null) {
      customMessage.success("拉取成功");
      await refreshStatus(path);
    }
  } finally {
    repoLoadingStates[path].pulling = false;
  }
};

const pushRepo = async (path: string) => {
  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].pushing = true;
  try {
    const ok = await errorHandler.wrapAsync(
      () => invoke<void>("git_push", { path }),
      { userMessage: "推送失败" }
    );
    if (ok !== null) {
      customMessage.success("推送成功");
      await refreshStatus(path);
    }
  } finally {
    repoLoadingStates[path].pushing = false;
  }
};

// 组装单仓库的 diff 文本
const buildDiffPromptForRepo = async (path: string): Promise<string | null> => {
  const status = repoStatuses.value[path];
  if (!status) return null;

  let files: FileStatus[] = [];
  let isStaged = true;

  if (status.staged.length > 0) {
    files = status.staged;
    isStaged = true;
  } else if (aiIncludeUnstagedRef.value && status.unstaged.length > 0) {
    files = status.unstaged;
    isStaged = false;
  }

  if (files.length === 0) return null;

  const parts: string[] = [];
  for (const f of files) {
    if (f.isBinary) {
      parts.push(`### ${f.path}\n[二进制文件，无文本差异]`);
      continue;
    }
    const diff = await errorHandler.wrapAsync(
      () =>
        invoke<[string, string]>("git_get_file_diff", {
          path,
          filePath: f.path,
          isStaged,
        }),
      { showToUser: false }
    );
    if (!diff) {
      parts.push(`### ${f.path}\n[二进制文件，无文本差异]`);
      continue;
    }
    parts.push(
      `### ${f.path} (${f.status})\n--- original ---\n${diff[0]}\n--- modified ---\n${diff[1]}`
    );
  }
  return parts.join("\n\n");
};

const generateMessageForRepo = async (path: string) => {
  const combo = defaultModelRef.value;
  const [profileId, modelId] = parseModelCombo(combo);
  if (!profileId || !modelId) {
    customMessage.warning("请先在设置中选择 AI 模型");
    return;
  }

  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].generating = true;
  repoDrafts.value[path] = "";

  try {
    const diffText = await buildDiffPromptForRepo(path);
    if (!diffText) {
      customMessage.warning("没有可生成提交信息的文件变更");
      return;
    }

    const systemPrompt = systemPromptRef.value;
    const requestId = `gc-panorama-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await sendRequest({
      profileId,
      modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: diffText },
      ],
      stream: true,
      onStream: (chunk: string) => {
        repoDrafts.value[path] += chunk;
      },
      requestId,
      inspectorContext: {
        toolName: "git-committer",
        purpose: "generate-commit-message-panorama",
      },
    } as any);
  } catch (error) {
    logger.error(`AI 生成提交信息失败 (${path})`, error as Error);
    customMessage.error(`AI 生成提交信息失败: ${path}`);
  } finally {
    repoLoadingStates[path].generating = false;
  }
};

const commitRepo = async (path: string) => {
  const msg = repoDrafts.value[path];
  if (!msg?.trim()) {
    customMessage.warning("提交信息不能为空");
    return;
  }

  if (!repoLoadingStates[path]) return;
  repoLoadingStates[path].committing = true;

  try {
    const ok = await errorHandler.wrapAsync(
      () => invoke<void>("git_commit", { path, message: msg }),
      { userMessage: "提交失败" }
    );
    if (ok !== null) {
      customMessage.success(`提交成功: ${path.split(/[/\\]/).pop()}`);
      repoDrafts.value[path] = "";
      await refreshStatus(path);
    }
  } finally {
    repoLoadingStates[path].committing = false;
  }
};

// ===== 全局一键操作 =====
const stageAllRepos = async () => {
  isGlobalStaging.value = true;
  try {
    await Promise.all(
      activeRepos.value.map((repo) =>
        stageAllFiles(repo.path).catch(() => null)
      )
    );
    customMessage.success("一键暂存完成");
  } finally {
    isGlobalStaging.value = false;
  }
};

const generateAllMessages = async () => {
  const combo = defaultModelRef.value;
  const [profileId, modelId] = parseModelCombo(combo);
  if (!profileId || !modelId) {
    customMessage.warning("请先在设置中选择 AI 模型");
    return;
  }

  isGlobalGenerating.value = true;
  try {
    // 并发为所有符合条件的仓库生成提交消息
    await Promise.all(
      activeRepos.value
        .filter((repo) => canGenerateMessage(repo.path))
        .map((repo) => generateMessageForRepo(repo.path).catch(() => null))
    );
    customMessage.success("一键 AI 生成完成");
  } finally {
    isGlobalGenerating.value = false;
  }
};

const commitAllRepos = async () => {
  isGlobalCommitting.value = true;
  try {
    let successCount = 0;
    for (const repo of activeRepos.value) {
      if (canCommit(repo.path)) {
        const msg = repoDrafts.value[repo.path];
        const ok = await errorHandler.wrapAsync(
          () => invoke<void>("git_commit", { path: repo.path, message: msg }),
          { showToUser: false }
        );
        if (ok !== null) {
          successCount++;
          repoDrafts.value[repo.path] = "";
          await refreshStatus(repo.path);
        } else {
          customMessage.error(`提交失败: ${repo.alias || repo.name}`);
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

const pushAllRepos = async () => {
  isGlobalPushing.value = true;
  try {
    let successCount = 0;
    for (const repo of repositories.value) {
      const status = repoStatuses.value[repo.path];
      if (status && status.ahead > 0) {
        const ok = await errorHandler.wrapAsync(
          () => invoke<void>("git_push", { path: repo.path }),
          { showToUser: false }
        );
        if (ok !== null) {
          successCount++;
          await refreshStatus(repo.path);
        } else {
          customMessage.error(`推送失败: ${repo.alias || repo.name}`);
        }
      }
    }
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
