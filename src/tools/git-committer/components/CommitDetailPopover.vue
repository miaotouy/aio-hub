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
  <el-popover
    :width="360"
    trigger="hover"
    placement="left-start"
    :show-after="250"
    :hide-after="60"
    :offset="10"
    popper-class="commit-detail-popper"
    @show="loadDetail"
  >
    <template #reference>
      <div class="commit-detail-trigger">
        <slot />
      </div>
    </template>

    <div class="commit-detail">
      <div class="detail-header">
        <span class="detail-avatar">{{ avatarText }}</span>
        <span class="detail-author">{{ commit.author }}</span>
        <el-icon class="detail-clock" :size="11"><Clock /></el-icon>
        <span class="detail-time">{{ relativeTime }}</span>
        <span class="detail-absolute">{{ absoluteTime }}</span>
      </div>

      <div class="detail-subject">{{ commit.message }}</div>
      <pre v-if="body" class="detail-body">{{ body }}</pre>

      <div v-if="isLoading" class="detail-loading">
        <el-icon class="is-loading" :size="14"><Loading /></el-icon>
        <span>正在加载变更信息…</span>
      </div>
      <div v-else-if="stats" class="detail-stats">
        已更改 <span class="stat-files">{{ stats.files }}</span> 个文件，<span
          class="stat-additions"
          >{{ stats.additions }}</span
        >
        行插入(+)，<span class="stat-deletions">{{ stats.deletions }}</span> 行删除(-)
      </div>

      <div class="detail-footer">
        <span class="detail-hash">{{ shortHash }}</span>
        <el-tooltip content="复制完整哈希" placement="top" :show-after="300">
          <button class="detail-copy" type="button" @click.stop="copyHash">
            <el-icon :size="12"><Copy /></el-icon>
          </button>
        </el-tooltip>
        <template v-if="remoteInfo">
          <span class="detail-divider" />
          <button
            class="detail-remote"
            type="button"
            @click.stop="openRemote"
          >
            <el-icon :size="12"><ExternalLink /></el-icon>
            <span>在 {{ remoteInfo.name }} 上打开</span>
          </button>
        </template>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Clock, Copy, ExternalLink } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { customMessage } from "@/utils/customMessage";
import { currentRepoPath } from "../composables/useGitCommitterState";
import { errorHandler } from "../composables/useGitCommitterErrorHandler";
import { loadCommitDetail } from "../composables/useCommitDetails";
import { getRemoteInfo } from "../composables/useGitRemoteInfo";
import type { RemoteInfo } from "../utils";
import type { CommitStats, GitCommitSummary } from "../types";

const props = defineProps<{
  commit: GitCommitSummary;
}>();

const detailStats = ref<CommitStats | null>(null);
const remoteInfo = ref<RemoteInfo | null>(null);
const isLoading = ref(false);
let hasLoadedDetail = false;
let hasLoadedRemote = false;

const stats = computed(() => props.commit.stats ?? detailStats.value);

const shortHash = computed(() => props.commit.hash.substring(0, 7));

const avatarText = computed(
  () => (props.commit.author || "?").trim().charAt(0).toUpperCase() || "?"
);

const body = computed(() => {
  const full = props.commit.full_message;
  if (!full) return "";
  const subject = props.commit.message;
  return full.startsWith(subject) ? full.slice(subject.length).trim() : full;
});

const formatRelativeTime = (dateStr: string) => {
  try {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: zhCN,
    });
  } catch {
    return dateStr;
  }
};

const relativeTime = computed(() => formatRelativeTime(props.commit.date));

const absoluteTime = computed(() => {
  try {
    return format(parseISO(props.commit.date), "yyyy年M月d日 HH:mm", {
      locale: zhCN,
    });
  } catch {
    return "";
  }
});

const loadRemote = async () => {
  if (hasLoadedRemote || !currentRepoPath.value) return;
  hasLoadedRemote = true;
  remoteInfo.value = await getRemoteInfo(currentRepoPath.value);
};

const loadDetail = async () => {
  if (!currentRepoPath.value) return;
  void loadRemote();
  if (hasLoadedDetail || isLoading.value) return;
  if (props.commit.stats) {
    hasLoadedDetail = true;
    return;
  }
  isLoading.value = true;
  const result = await loadCommitDetail(
    currentRepoPath.value,
    props.commit.hash
  );
  if (result?.stats) {
    detailStats.value = result.stats;
    hasLoadedDetail = true;
  }
  isLoading.value = false;
};

const copyHash = async () => {
  try {
    await navigator.clipboard.writeText(props.commit.hash);
    customMessage.success("已复制提交哈希");
  } catch {
    customMessage.error("复制失败");
  }
};

const openRemote = async () => {
  const info = remoteInfo.value;
  if (!info) return;
  const url = info.buildCommitUrl(props.commit.hash);
  await errorHandler.wrapAsync(() => invoke("open_url", { url }), {
    userMessage: "打开远端提交页失败",
  });
};
</script>

<style scoped>
:deep(.commit-detail-popper) {
  padding: 0 !important;
  border-radius: 10px !important;
  overflow: hidden !important;
  background-color: var(--card-bg) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
  border: var(--border-width) solid var(--border-color) !important;
  box-shadow: var(--el-box-shadow-light) !important;
}

.commit-detail-trigger {
  display: block;
}

.commit-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.detail-avatar {
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

.detail-author {
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-clock {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.detail-time {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.detail-absolute {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

.detail-subject {
  font-weight: 600;
  word-break: break-word;
}

.detail-body {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.detail-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.detail-stats {
  color: var(--el-text-color-regular);
  font-size: 11px;
}

.stat-files {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.stat-additions {
  color: var(--el-color-success);
  font-weight: 600;
}

.stat-deletions {
  color: var(--el-color-danger);
  font-weight: 600;
}

.detail-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 6px;
  border-top: var(--border-width) solid var(--border-color);
}

.detail-hash {
  font-family: monospace;
  font-size: 11px;
  color: var(--el-color-primary);
  user-select: text;
  white-space: nowrap;
}

.detail-copy {
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
  transition: color 0.2s ease, background-color 0.2s ease;
}

.detail-copy:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

.detail-divider {
  width: 1px;
  height: 12px;
  background-color: var(--border-color);
}

.detail-remote {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.detail-remote:hover {
  background-color: var(--el-fill-color-light);
}
</style>
