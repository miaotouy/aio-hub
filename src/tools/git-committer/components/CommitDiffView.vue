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
  <div ref="rootRef" class="commit-diff-view">
    <div v-if="isLoading" class="cdv-state">
      <el-icon class="is-loading" :size="22"><Loading /></el-icon>
      <span class="text-secondary">正在加载提交变更...</span>
    </div>

    <div v-else-if="!detail" class="cdv-state">
      <FileWarning :size="40" class="text-placeholder" />
      <span class="text-secondary">无法加载该提交，可能已不存在</span>
    </div>

    <template v-else>
      <header class="cdv-header">
        <div class="cdv-header-top">
          <span class="cdv-avatar">{{ avatarText }}</span>
          <span class="cdv-author">{{ detail.author }}</span>
          <span class="cdv-hash">{{ shortHash }}</span>
          <span class="cdv-date">{{ absoluteTime }}</span>
        </div>
        <div class="cdv-subject">{{ detail.message }}</div>
        <pre v-if="body" class="cdv-body">{{ body }}</pre>
        <div v-if="stats" class="cdv-stats">
          已更改 <span class="cdv-stat-files">{{ stats.files }}</span> 个文件，<span
            class="cdv-stat-add"
            >{{ stats.additions }}</span
          >
          行插入(+)，<span class="cdv-stat-del">{{ stats.deletions }}</span> 行删除(-)
        </div>
      </header>

      <div class="cdv-files">
        <div v-for="file in files" :key="file.path" class="cdv-file">
          <div class="cdv-file-header" @click="toggleFile(file)">
            <ChevronRight
              :size="14"
              class="cdv-chevron"
              :class="{ open: isExpanded(file.path) }"
            />
            <FileIcon :file-name="file.path" :size="15" class="cdv-file-icon" />
            <span class="cdv-file-name">{{ getFileName(file.path) }}</span>
            <span class="cdv-file-dir">{{ getFileDir(file.path) }}</span>
            <span class="cdv-file-stats">
              <span v-if="file.additions" class="cdv-add"
                >+{{ file.additions }}</span
              >
              <span v-if="file.deletions" class="cdv-del"
                >-{{ file.deletions }}</span
              >
            </span>
            <span
              class="cdv-file-status"
              :class="file.status.toLowerCase()"
              >{{ file.status }}</span
            >
          </div>

          <div v-if="isExpanded(file.path)" class="cdv-file-body">
            <div v-if="isLoadingFile(file.path)" class="cdv-state small">
              <el-icon class="is-loading" :size="16"><Loading /></el-icon>
              <span class="text-secondary">正在加载差异...</span>
            </div>
            <div
              v-else-if="diffFor(file.path)?.error"
              class="cdv-state small"
            >
              <span class="text-secondary">{{
                diffFor(file.path)?.error
              }}</span>
            </div>
            <div
              v-else-if="diffFor(file.path)?.isBinary"
              class="cdv-state small"
            >
              <span class="text-secondary">二进制文件，无法查看文本差异</span>
            </div>
            <RichCodeEditor
              v-else-if="diffFor(file.path)"
              diff
              :original="diffFor(file.path)?.original || ''"
              :modified="diffFor(file.path)?.modified || ''"
              :language="getFileLanguage(file.path)"
              :options="editorOptions"
              class="cdv-editor"
            />
          </div>
        </div>

        <div v-if="files.length === 0" class="cdv-state">
          <span class="text-secondary">该提交没有文件变更</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ChevronRight, FileWarning } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import FileIcon from "@/components/common/FileIcon.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { hideUnchangedRegions } from "../composables/useGitCommitterState";
import { loadCommitDetail } from "../composables/useCommitDetails";
import { loadCommitFileDiff } from "../composables/useGitCommitterRunner";
import { getFileName, getFileDir, getFileLanguage } from "../utils";
import type { CommitFileChange, DiffTab, GitCommitSummary } from "../types";

const props = defineProps<{
  repoPath: string;
  commitHash: string;
}>();

const rootRef = ref<HTMLElement | null>(null);
const detail = ref<GitCommitSummary | null>(null);
const isLoading = ref(false);
const expandedPaths = ref<Set<string>>(new Set());
const loadingFiles = ref<Set<string>>(new Set());
const fileDiffs = ref<Record<string, DiffTab>>({});
const containerWidth = ref(1000);

const files = computed<CommitFileChange[]>(() => detail.value?.files || []);
const stats = computed(() => detail.value?.stats || null);
const shortHash = computed(() =>
  (detail.value?.hash || props.commitHash).substring(0, 7)
);
const avatarText = computed(
  () => (detail.value?.author || "?").trim().charAt(0).toUpperCase() || "?"
);
const body = computed(() => {
  const full = detail.value?.full_message;
  if (!full) return "";
  const subject = detail.value?.message || "";
  return full.startsWith(subject) ? full.slice(subject.length).trim() : full;
});
const absoluteTime = computed(() => {
  const date = detail.value?.date;
  if (!date) return "";
  try {
    return format(parseISO(date), "yyyy年M月d日 HH:mm", { locale: zhCN });
  } catch {
    return "";
  }
});

const editorOptions = computed(() => ({
  renderSideBySide: containerWidth.value >= 900,
  readOnly: true,
  minimap: { enabled: false },
  hideUnchangedRegions: {
    enabled: hideUnchangedRegions.value,
    revealLineCount: 3,
    minimumLineCount: 3,
    contextLineCount: 3,
  },
}));

const isExpanded = (path: string): boolean => expandedPaths.value.has(path);
const isLoadingFile = (path: string): boolean =>
  loadingFiles.value.has(path);
const diffFor = (path: string): DiffTab | undefined => fileDiffs.value[path];

const toggleFile = async (file: CommitFileChange) => {
  if (expandedPaths.value.has(file.path)) {
    expandedPaths.value.delete(file.path);
    return;
  }
  expandedPaths.value.add(file.path);
  if (fileDiffs.value[file.path]) return;

  loadingFiles.value.add(file.path);
  const diff = await loadCommitFileDiff(
    props.repoPath,
    props.commitHash,
    file.path
  );
  fileDiffs.value[file.path] = diff;
  loadingFiles.value.delete(file.path);
};

const load = async () => {
  expandedPaths.value = new Set();
  loadingFiles.value = new Set();
  fileDiffs.value = {};
  detail.value = null;
  if (!props.repoPath || !props.commitHash) return;

  isLoading.value = true;
  detail.value = await loadCommitDetail(props.repoPath, props.commitHash);
  isLoading.value = false;

  const first = detail.value?.files?.[0];
  if (first) {
    await toggleFile(first);
  }
};

watch(() => [props.repoPath, props.commitHash], load, { immediate: true });

// ===== 监听容器宽度，自适应并排/内联 =====
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (rootRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(rootRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.commit-diff-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background-color: var(--card-bg);
}

.cdv-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  font-size: 13px;
  height: 100%;
}

.cdv-state.small {
  height: auto;
  padding: 16px;
  font-size: 12px;
}

.cdv-header {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--sidebar-bg);
}

.cdv-header-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}

.cdv-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.cdv-author {
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cdv-hash {
  font-family: monospace;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.cdv-date {
  flex-shrink: 0;
  margin-left: auto;
}

.cdv-subject {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.cdv-body {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
}

.cdv-stats {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.cdv-stat-files {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.cdv-stat-add {
  color: var(--el-color-success);
  font-weight: 600;
}

.cdv-stat-del {
  color: var(--el-color-danger);
  font-weight: 600;
}

.cdv-files {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.cdv-file {
  border-bottom: var(--border-width) solid var(--border-color);
}

.cdv-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.15s ease;
}

.cdv-file-header:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.cdv-chevron {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  transition: transform 0.15s ease;
}

.cdv-chevron.open {
  transform: rotate(90deg);
}

.cdv-file-icon {
  flex-shrink: 0;
}

.cdv-file-name {
  flex-shrink: 0;
  max-width: 40%;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cdv-file-dir {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cdv-file-stats {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  font-family: monospace;
  font-size: 11px;
}

.cdv-add {
  color: var(--el-color-success);
}

.cdv-del {
  color: var(--el-color-danger);
}

.cdv-file-status {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-family: monospace;
  font-weight: bold;
  font-size: 11px;
}

.cdv-file-status.m {
  color: var(--el-color-warning);
}
.cdv-file-status.a {
  color: var(--el-color-success);
}
.cdv-file-status.d {
  color: var(--el-color-danger);
}
.cdv-file-status.r,
.cdv-file-status.c,
.cdv-file-status.t {
  color: var(--el-color-info);
}

.cdv-file-body {
  border-top: var(--border-width) solid var(--border-color);
}

.cdv-editor {
  height: 420px;
  width: 100%;
}
</style>
