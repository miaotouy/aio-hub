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
  <div class="git-committer-main-area" ref="mainAreaRef">
    <!-- 全景模式看板 -->
    <PanoramaDashboard v-if="currentRepoPath === '__panorama__'" />

    <!-- 单仓库模式 -->
    <template v-else>
      <!-- 顶部：多 Tab 文件标签栏 -->
      <div v-if="session.openTabs.length > 0" class="tabs-header">
        <div class="tabs-scroll-container">
          <div
            v-for="tab in session.openTabs"
            :key="buildTabKey(tab)"
            class="tab-item"
            :class="{
              active: session.activeTabPath === buildTabKey(tab),
            }"
            @click="session.activeTabPath = buildTabKey(tab)"
          >
            <template v-if="isPromptTab(tab.path)">
              <MessageSquareText :size="12" class="tab-prompt-icon" />
              <span class="tab-name">AI 提示词</span>
            </template>
            <template v-else-if="isCommitViewTab(tab)">
              <GitCommitHorizontal :size="12" class="tab-commit-icon" />
              <span class="tab-name">提交更改</span>
              <span class="tab-commit-badge">{{
                shortHashOf(tab.commitHash)
              }}</span>
            </template>
            <template v-else-if="isChangesViewTab(tab)">
              <FileDiff :size="12" class="tab-commit-icon" />
              <span class="tab-name">{{
                tab.isStaged ? "暂存的更改" : "工作区更改"
              }}</span>
            </template>
            <template v-else-if="isCommitTab(tab)">
              <GitCommitHorizontal :size="12" class="tab-commit-icon" />
              <span class="tab-name" :title="tab.path">{{
                getFileName(tab.path)
              }}</span>
              <span class="tab-commit-badge">{{
                shortHashOf(tab.commitHash)
              }}</span>
            </template>
            <template v-else>
              <span
                class="tab-status"
                :class="getFileStatus(tab.path, tab.isStaged).toLowerCase()"
              >
                {{ getFileStatus(tab.path, tab.isStaged) }}
              </span>
              <span class="tab-name" :title="tab.path">{{
                getFileName(tab.path)
              }}</span>
              <span class="tab-stage-badge" :class="{ staged: tab.isStaged }">
                {{ tab.isStaged ? "暂存" : "工作区" }}
              </span>
            </template>
            <span class="tab-close" @click.stop="closeDiffTab(tab)">
              <X :size="12" />
            </span>
          </div>
        </div>
      </div>

      <!-- 中部：Diff 编辑器或空状态 -->
      <div class="main-content">
        <RepoPromptEditor v-if="isPromptTabActive" />

        <CommitDiffView
          v-else-if="isCommitViewTabActive"
          :repo-path="currentRepoPath"
          :commit-hash="activeTabInfo?.commitHash || ''"
        />

        <ChangesDiffView
          v-else-if="isChangesViewTabActive"
          :repo-path="currentRepoPath"
          :is-staged="activeTabInfo?.isStaged || false"
        />

        <template v-else-if="activeTab">
          <!-- 加载失败提示 -->
          <div v-if="activeTab.error" class="binary-fallback-card">
            <FileWarning :size="48" class="text-placeholder binary-icon" />
            <h3 class="binary-title">无法打开文件差异</h3>
            <p class="text-secondary binary-desc">{{ activeTab.error }}</p>
          </div>

          <!-- 二进制文件降级提示 -->
          <div v-else-if="activeTab.isBinary" class="binary-fallback-card">
            <FileCode :size="48" class="text-placeholder binary-icon" />
            <h3 class="binary-title">二进制文件无法查看差异</h3>
            <p class="text-secondary binary-desc">{{ activeTab.path }}</p>
            <div v-if="!activeTab.commitHash" class="binary-actions">
              <el-button
                v-if="activeTab.isStaged"
                type="danger"
                size="small"
                @click="handleUnstageFile(activeTab.path)"
              >
                取消暂存
              </el-button>
              <el-button
                v-else
                type="primary"
                size="small"
                @click="handleStageFile(activeTab.path)"
              >
                暂存文件
              </el-button>
            </div>
          </div>

          <!-- 文本 Diff 编辑器 -->
          <div v-else-if="activeTab.loading" class="loading-wrapper">
            <el-icon class="is-loading" :size="24"><Loading /></el-icon>
            <span class="loading-text text-secondary">正在加载差异...</span>
          </div>

          <div v-else class="diff-view">
            <div class="diff-toolbar" role="toolbar" aria-label="差异导航">
              <div class="diff-toolbar-group">
                <button
                  class="diff-toolbar-button"
                  :disabled="!canNavigateDiff"
                  title="上一处差异"
                  aria-label="上一处差异"
                  @click="navigateDiff('previous')"
                >
                  <ArrowUp :size="15" />
                </button>
                <button
                  class="diff-toolbar-button"
                  :disabled="!canNavigateDiff"
                  title="下一处差异"
                  aria-label="下一处差异"
                  @click="navigateDiff('next')"
                >
                  <ArrowDown :size="15" />
                </button>
                <span class="diff-position" aria-live="polite">
                  {{ diffPositionLabel }}
                </span>
              </div>

              <div class="diff-toolbar-divider" aria-hidden="true" />

              <button
                class="diff-toolbar-button diff-collapse-button"
                :class="{ active: hideUnchangedRegions }"
                :aria-pressed="hideUnchangedRegions"
                :title="
                  hideUnchangedRegions ? '展开未更改区域' : '折叠未更改区域'
                "
                :aria-label="
                  hideUnchangedRegions ? '展开未更改区域' : '折叠未更改区域'
                "
                @click="toggleHideUnchangedRegions"
              >
                <FoldVertical v-if="hideUnchangedRegions" :size="15" />
                <UnfoldVertical v-else :size="15" />
              </button>
            </div>
            <RichCodeEditor
              ref="editorRef"
              diff
              :original="activeTab.original"
              :modified="activeTab.modified"
              :language="getFileLanguage(activeTab.path)"
              :options="editorOptions"
              class="diff-editor"
              @mount="handleEditorMount"
            />
          </div>
        </template>

        <!-- 空状态引导页 -->
        <div v-else class="empty-guide">
          <GitCommitHorizontal :size="64" class="text-placeholder guide-icon" />
          <h2 class="guide-title">AI 提交助手</h2>
          <p class="text-secondary max-w-md text-center guide-desc">
            在左侧选择文件查看代码差异，暂存需要提交的更改，然后让 AI
            帮您生成完美的提交信息。
          </p>
          <div class="shortcut-tips">
            <div class="tip-item">
              <span class="key">Ctrl</span> + <span class="key">Enter</span>
              <span class="desc">快速提交暂存更改</span>
            </div>
            <div class="tip-item">
              <span class="key">双击手柄</span>
              <span class="desc">恢复侧边栏默认宽度</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  toRaw,
} from "vue";
import {
  X,
  FileCode,
  FileDiff,
  FileWarning,
  GitCommitHorizontal,
  MessageSquareText,
  ArrowUp,
  ArrowDown,
  FoldVertical,
  UnfoldVertical,
} from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import PanoramaDashboard from "./PanoramaDashboard.vue";
import RepoPromptEditor from "./RepoPromptEditor.vue";
import CommitDiffView from "./CommitDiffView.vue";
import ChangesDiffView from "./ChangesDiffView.vue";
import {
  currentRepoPath,
  currentSession as session,
  currentStatus,
  hideUnchangedRegions,
} from "../composables/useGitCommitterState";
import {
  closeDiffTab,
  loadCommitFileDiff,
  loadFileDiff,
  stageFile,
  unstageFile,
} from "../composables/useGitCommitterRunner";
import type { DiffTab } from "../types";
import type * as monaco from "@/utils/monaco";
import {
  buildTabKey,
  getFileName,
  getFileLanguage,
  isChangesViewTab,
  isCommitTab,
  isCommitViewTab,
  REPO_PROMPT_TAB_PATH,
} from "../utils";

const props = defineProps<{
  sidebarWidth: number;
  rightSidebarWidth: number;
  isRightSidebarExpanded: boolean;
}>();

const mainAreaRef = ref<HTMLElement | null>();
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>();
const activeTab = ref<DiffTab | null>(null);
const mainAreaWidth = ref(1000);
const diffEditorInstance = ref<monaco.editor.IStandaloneDiffEditor | null>(
  null
);
const diffChangeCount = ref(0);
const currentDiffIndex = ref(-1);
let diffUpdateDisposable: { dispose: () => void } | null = null;

// ===== 监听主区域宽度，自适应并排/内联 =====
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (mainAreaRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        mainAreaWidth.value = entry.contentRect.width;
        // 触发 Monaco 重新布局
        triggerEditorLayout();
      }
    });
    resizeObserver.observe(mainAreaRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  diffUpdateDisposable?.dispose();
});

const triggerEditorLayout = () => {
  nextTick(() => {
    if (editorRef.value && "layout" in editorRef.value) {
      (editorRef.value as any).layout();
    }
  });
};

// 监听侧边栏宽度变化，触发重绘
watch(
  [
    () => props.sidebarWidth,
    () => props.rightSidebarWidth,
    () => props.isRightSidebarExpanded,
  ],
  () => {
    triggerEditorLayout();
  }
);

const editorOptions = computed(() => {
  // 宽度低于 800px 时，自动切 inline diff
  const renderSideBySide = mainAreaWidth.value >= 800;
  return {
    renderSideBySide,
    readOnly: true,
    minimap: { enabled: false },
    hideUnchangedRegions: {
      enabled: hideUnchangedRegions.value,
      revealLineCount: 3,
      minimumLineCount: 3,
      contextLineCount: 3,
    },
  };
});

const canNavigateDiff = computed(
  () => diffEditorInstance.value !== null && diffChangeCount.value > 0
);

const diffPositionLabel = computed(() => {
  if (diffChangeCount.value === 0) return "无差异";
  return `${Math.max(currentDiffIndex.value, 0) + 1} / ${diffChangeCount.value}`;
});

// ===== Tab 辅助 =====
const isPromptTab = (filePath: string): boolean => {
  return filePath === REPO_PROMPT_TAB_PATH;
};

const shortHashOf = (hash?: string): string =>
  hash ? hash.substring(0, 7) : "";

const activeTabInfo = computed(() => {
  const key = session.value.activeTabPath;
  return session.value.openTabs.find((t) => buildTabKey(t) === key) || null;
});

const isPromptTabActive = computed(() => {
  return isPromptTab(activeTabInfo.value?.path || "");
});

const isCommitViewTabActive = computed(() => {
  return isCommitViewTab(activeTabInfo.value);
});

const isChangesViewTabActive = computed(() => {
  return isChangesViewTab(activeTabInfo.value);
});

// ===== Diff 导航与未更改区域折叠 =====
const handleEditorMount = (editor: unknown) => {
  const diffEditor = editor as monaco.editor.IStandaloneDiffEditor;
  if (!diffEditor || typeof diffEditor.getLineChanges !== "function") return;

  diffUpdateDisposable?.dispose();
  diffEditorInstance.value = diffEditor;
  currentDiffIndex.value = -1;
  let hasRevealedInitialChange = false;

  const revealFirstChange = (): boolean => {
    const changes = diffEditor.getLineChanges();
    if (!changes || changes.length === 0) return false;

    const first = changes[0];
    // 改动可能只存在于单侧：纯删除时 modified 行为 0，反之 original 行为 0
    if (first.modifiedEndLineNumber > 0) {
      diffEditor
        .getModifiedEditor()
        .revealLineInCenter(first.modifiedStartLineNumber);
    } else if (first.originalEndLineNumber > 0) {
      diffEditor
        .getOriginalEditor()
        .revealLineInCenter(first.originalStartLineNumber);
    } else {
      return false;
    }
    return true;
  };

  const updateDiffState = () => {
    const changes = diffEditor.getLineChanges() || [];
    const previousCount = diffChangeCount.value;
    diffChangeCount.value = changes.length;
    if (changes.length === 0) {
      currentDiffIndex.value = -1;
      return;
    }

    if (
      currentDiffIndex.value < 0 ||
      currentDiffIndex.value >= changes.length ||
      previousCount !== changes.length
    ) {
      currentDiffIndex.value = 0;
    }
    if (!hasRevealedInitialChange && revealFirstChange()) {
      hasRevealedInitialChange = true;
    }
  };

  // 差异计算是异步的，挂载时可能尚未完成；事件同时驱动导航计数。
  diffUpdateDisposable = diffEditor.onDidUpdateDiff(updateDiffState);
  updateDiffState();
};

const navigateDiff = (direction: "previous" | "next") => {
  const diffEditor = diffEditorInstance.value;
  if (!diffEditor || diffChangeCount.value === 0) return;

  const delta = direction === "next" ? 1 : -1;
  currentDiffIndex.value =
    (Math.max(currentDiffIndex.value, 0) + delta + diffChangeCount.value) %
    diffChangeCount.value;
  toRaw(diffEditor).goToDiff(direction);
};

const toggleHideUnchangedRegions = () => {
  hideUnchangedRegions.value = !hideUnchangedRegions.value;
  diffEditorInstance.value?.updateOptions({
    hideUnchangedRegions: {
      enabled: hideUnchangedRegions.value,
      revealLineCount: 3,
      minimumLineCount: 3,
      contextLineCount: 3,
    },
  });
};

// ===== 监听激活 Tab 变化，加载 Diff 内容 =====
watch(
  () => session.value.activeTabPath,
  async (newKey) => {
    diffUpdateDisposable?.dispose();
    diffUpdateDisposable = null;
    diffEditorInstance.value = null;
    diffChangeCount.value = 0;
    currentDiffIndex.value = -1;

    if (!newKey) {
      activeTab.value = null;
      return;
    }

    const tabInfo = session.value.openTabs.find(
      (t) => buildTabKey(t) === newKey
    );
    if (
      !tabInfo ||
      isPromptTab(tabInfo.path) ||
      isCommitViewTab(tabInfo) ||
      isChangesViewTab(tabInfo)
    ) {
      activeTab.value = null;
      return;
    }

    activeTab.value = {
      path: tabInfo.path,
      isStaged: tabInfo.isStaged,
      commitHash: tabInfo.commitHash,
      original: "",
      modified: "",
      isBinary: false,
      loading: true,
    };

    const diff = tabInfo.commitHash
      ? await loadCommitFileDiff(
          currentRepoPath.value,
          tabInfo.commitHash,
          tabInfo.path
        )
      : await loadFileDiff(
          currentRepoPath.value,
          tabInfo.path,
          tabInfo.isStaged
        );
    if (diff && session.value.activeTabPath === newKey) {
      activeTab.value = diff;
      triggerEditorLayout();
    } else if (!diff && session.value.activeTabPath === newKey) {
      activeTab.value = {
        path: tabInfo.path,
        isStaged: tabInfo.isStaged,
        commitHash: tabInfo.commitHash,
        original: "",
        modified: "",
        isBinary: false,
        loading: false,
        error: "加载文件差异失败，文件可能已不存在",
      };
    }
  },
  { immediate: true }
);

// ===== 暂存/取消暂存操作 =====
const handleStageFile = async (path: string) => {
  await stageFile(currentRepoPath.value, path);
};

const handleUnstageFile = async (path: string) => {
  await unstageFile(currentRepoPath.value, path);
};

// ===== 辅助函数 =====
const getFileStatus = (path: string, isStaged: boolean): string => {
  const list = isStaged
    ? currentStatus.value?.staged
    : currentStatus.value?.unstaged;
  const file = list?.find((f) => f.path === path);
  return file?.status || "M";
};
</script>

<style scoped>
.git-committer-main-area {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: transparent;
  overflow: hidden;
}

/* Tab 标签栏 */
.tabs-header {
  height: 36px;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tabs-scroll-container {
  display: flex;
  overflow-x: auto;
  height: 100%;
  align-items: flex-end;
  padding: 0 8px;
  gap: 4px;
}

.tabs-scroll-container::-webkit-scrollbar {
  height: 2px;
}

.tab-item {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.02)
  );
  border: var(--border-width) solid var(--border-color);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  gap: 6px;
  font-size: 12px;
  transition: all 0.2s ease;
  color: var(--el-text-color-regular);
}

.tab-item:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
  color: var(--el-text-color-primary);
}

.tab-item.active {
  background-color: var(--card-bg);
  border-color: var(--border-color);
  border-bottom: 2px solid var(--el-color-primary);
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.tab-status {
  font-family: monospace;
  font-weight: bold;
  font-size: 10px;
}

.tab-status.m {
  color: var(--el-color-warning);
}
.tab-status.a {
  color: var(--el-color-success);
}
.tab-status.d {
  color: var(--el-color-danger);
}

.tab-name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-prompt-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.tab-commit-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.tab-commit-badge {
  font-family: monospace;
  font-size: 9px;
  color: var(--el-text-color-secondary);
}

.tab-stage-badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
  background-color: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-text-color-secondary);
}

.tab-stage-badge.staged {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.tab-close:hover {
  background-color: var(--el-fill-color-dark);
  color: var(--el-color-danger);
}

/* 主内容区 */
.main-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  background-color: var(--card-bg);
}

.diff-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.diff-toolbar {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 8px;
  gap: 4px;
  flex-shrink: 0;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--el-text-color-secondary);
}

.diff-toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.diff-toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 25px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.diff-toolbar-button:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.diff-toolbar-button:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: -1px;
}

.diff-toolbar-button:disabled {
  color: var(--el-text-color-placeholder);
  cursor: default;
  opacity: 0.55;
}

.diff-toolbar-button.active {
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
}

.diff-position {
  min-width: 48px;
  padding: 0 4px;
  font-size: 11px;
  line-height: 25px;
  text-align: center;
  user-select: none;
}

.diff-toolbar-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: var(--border-color);
}

.diff-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.loading-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  z-index: 5;
}

.loading-text {
  margin-left: 8px;
  font-size: 14px;
}

/* 二进制降级卡片 */
.binary-fallback-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--card-bg);
  z-index: 5;
}

.binary-icon {
  margin-bottom: 16px;
}

.binary-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.binary-desc {
  font-size: 14px;
  margin-bottom: 16px;
}

.binary-actions {
  display: flex;
  gap: 16px;
}

.text-placeholder {
  color: var(--el-text-color-placeholder);
}

/* 空状态引导页 */
.empty-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
}

.guide-icon {
  margin-bottom: 16px;
}

.guide-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.guide-desc {
  font-size: 14px;
  margin-bottom: 24px;
}

.shortcut-tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: rgba(var(--el-color-info-rgb), 0.05);
  padding: 12px 16px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.key {
  background-color: var(--el-fill-color-light);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: monospace;
  font-weight: bold;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
}

.desc {
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}
</style>
