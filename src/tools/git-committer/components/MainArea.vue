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
            :key="buildTabKey(tab.path, tab.isStaged)"
            class="tab-item"
            :class="{
              active:
                session.activeTabPath === buildTabKey(tab.path, tab.isStaged),
            }"
            @click="session.activeTabPath = buildTabKey(tab.path, tab.isStaged)"
          >
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
            <span
              class="tab-close"
              @click.stop="closeDiffTab(tab.path, tab.isStaged)"
            >
              <X class="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      <!-- 中部：Diff 编辑器或空状态 -->
      <div class="main-content">
        <template v-if="activeTab">
          <!-- 二进制文件降级提示 -->
          <div v-if="activeTab.isBinary" class="binary-fallback-card">
            <FileCode class="w-12 h-12 text-placeholder mb-4" />
            <h3 class="text-lg font-semibold mb-2">二进制文件无法查看差异</h3>
            <p class="text-sm text-secondary mb-4">{{ activeTab.path }}</p>
            <div class="flex gap-4">
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
            <span class="ml-2 text-sm text-secondary">正在加载差异...</span>
          </div>

          <RichCodeEditor
            v-else
            ref="editorRef"
            diff
            :original="activeTab.original"
            :modified="activeTab.modified"
            :language="getFileLanguage(activeTab.path)"
            :options="editorOptions"
            class="diff-editor"
          />
        </template>

        <!-- 空状态引导页 -->
        <div v-else class="empty-guide">
          <GitCommitHorizontal class="w-16 h-16 text-placeholder mb-4" />
          <h2 class="text-xl font-semibold mb-2">AI 提交助手</h2>
          <p class="text-sm text-secondary max-w-md text-center mb-6">
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { X, FileCode, GitCommitHorizontal } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import PanoramaDashboard from "./PanoramaDashboard.vue";
import { getExtension } from "@/utils/fileTypeDetector";
import {
  currentRepoPath,
  currentSession as session,
  currentStatus,
} from "../composables/useGitCommitterState";
import {
  closeDiffTab,
  loadFileDiff,
  stageFile,
  unstageFile,
} from "../composables/useGitCommitterRunner";
import type { DiffTab } from "../types";

const props = defineProps<{
  sidebarWidth: number;
  rightSidebarWidth: number;
  isRightSidebarExpanded: boolean;
}>();

const mainAreaRef = ref<HTMLElement | null>();
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>();
const activeTab = ref<DiffTab | null>(null);
const mainAreaWidth = ref(1000);

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
  };
});

// ===== Tab 唯一键 =====
const buildTabKey = (filePath: string, isStaged: boolean): string => {
  return `${isStaged ? "S" : "W"}:${filePath}`;
};

// ===== 监听激活 Tab 变化，加载 Diff 内容 =====
watch(
  () => session.value.activeTabPath,
  async (newKey) => {
    if (!newKey) {
      activeTab.value = null;
      return;
    }

    const tabInfo = session.value.openTabs.find(
      (t) => buildTabKey(t.path, t.isStaged) === newKey
    );
    if (!tabInfo) {
      activeTab.value = null;
      return;
    }

    activeTab.value = {
      path: tabInfo.path,
      isStaged: tabInfo.isStaged,
      original: "",
      modified: "",
      isBinary: false,
      loading: true,
    };

    const diff = await loadFileDiff(
      currentRepoPath.value,
      tabInfo.path,
      tabInfo.isStaged
    );
    if (diff && session.value.activeTabPath === newKey) {
      activeTab.value = diff;
      triggerEditorLayout();
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
const getFileName = (path: string) => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1];
};

const getFileLanguage = (path: string) => {
  const ext = getExtension(path);
  if (!ext) return "plaintext";
  const map: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    vue: "html",
    rs: "rust",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
  };
  return map[ext.toLowerCase()] || "plaintext";
};

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

.diff-editor {
  width: 100%;
  height: 100%;
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
