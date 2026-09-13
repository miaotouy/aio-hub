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
  <div ref="rootRef" class="changes-diff-view">
    <div v-if="!files.length" class="cdv-state">
      <FileWarning :size="40" class="text-placeholder" />
      <span class="text-secondary">{{
        isStaged ? "暂无暂存的更改" : "工作区干净"
      }}</span>
    </div>

    <template v-else>
      <header class="cdv-header">
        <div class="cdv-header-top">
          <span class="cdv-title">{{
            isStaged ? "暂存的更改" : "工作区更改"
          }}</span>
          <span class="cdv-count">共 {{ files.length }} 个文件</span>
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
              <span v-if="statsFor(file.path).additions" class="cdv-add"
                >+{{ statsFor(file.path).additions }}</span
              >
              <span v-if="statsFor(file.path).deletions" class="cdv-del"
                >-{{ statsFor(file.path).deletions }}</span
              >
            </span>
            <span class="cdv-file-status" :class="file.status.toLowerCase()">{{
              file.status
            }}</span>
          </div>

          <div v-if="isExpanded(file.path)" class="cdv-file-body">
            <div v-if="isLoadingFile(file.path)" class="cdv-state small">
              <el-icon class="is-loading" :size="16"><Loading /></el-icon>
              <span class="text-secondary">正在加载差异...</span>
            </div>
            <div v-else-if="diffFor(file.path)?.error" class="cdv-state small">
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
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ChevronRight, FileWarning } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { diffLines } from "diff";
import FileIcon from "@/components/common/FileIcon.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import {
  currentStatus,
  hideUnchangedRegions,
} from "../composables/useGitCommitterState";
import {
  loadFileDiff,
  refreshStatus,
} from "../composables/useGitCommitterRunner";
import { getFileName, getFileDir, getFileLanguage } from "../utils";
import type { DiffTab, FileStatus } from "../types";

const props = defineProps<{
  repoPath: string;
  isStaged: boolean;
}>();

const rootRef = ref<HTMLElement | null>(null);
const expandedPaths = ref<Set<string>>(new Set());
const loadingFiles = ref<Set<string>>(new Set());
const fileDiffs = ref<Record<string, DiffTab>>({});
const containerWidth = ref(1000);

const files = computed<FileStatus[]>(() => {
  const group = props.isStaged
    ? currentStatus.value?.staged
    : currentStatus.value?.unstaged;
  return group || [];
});

const statsMap = computed<
  Record<string, { additions: number; deletions: number }>
>(() => {
  const map: Record<string, { additions: number; deletions: number }> = {};
  for (const [path, diff] of Object.entries(fileDiffs.value)) {
    if (diff.isBinary || diff.error) continue;
    let additions = 0;
    let deletions = 0;
    for (const part of diffLines(diff.original || "", diff.modified || "")) {
      const count = part.count ?? 0;
      if (part.added) additions += count;
      else if (part.removed) deletions += count;
    }
    map[path] = { additions, deletions };
  }
  return map;
});

const statsFor = (path: string) =>
  statsMap.value[path] || { additions: 0, deletions: 0 };

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
const isLoadingFile = (path: string): boolean => loadingFiles.value.has(path);
const diffFor = (path: string): DiffTab | undefined => fileDiffs.value[path];

const toggleFile = async (file: FileStatus) => {
  if (expandedPaths.value.has(file.path)) {
    expandedPaths.value.delete(file.path);
    return;
  }
  expandedPaths.value.add(file.path);
  if (fileDiffs.value[file.path]) return;

  loadingFiles.value.add(file.path);
  const diff = await loadFileDiff(props.repoPath, file.path, props.isStaged);
  if (diff) {
    fileDiffs.value[file.path] = diff;
  }
  loadingFiles.value.delete(file.path);
};

const load = async () => {
  expandedPaths.value = new Set();
  loadingFiles.value = new Set();
  fileDiffs.value = {};
  if (!props.repoPath) return;

  await refreshStatus(props.repoPath);
  const first = files.value[0];
  if (first) {
    await toggleFile(first);
  }
};

watch(() => [props.repoPath, props.isStaged], load, { immediate: true });

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
.changes-diff-view {
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
}

.cdv-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cdv-count {
  margin-left: auto;
  color: var(--el-text-color-secondary);
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
