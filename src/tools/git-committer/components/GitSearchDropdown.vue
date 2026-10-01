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
  <div class="git-search-dropdown" @mousedown.stop>
    <!-- 顶部状态栏 -->
    <div class="dropdown-header">
      <div class="header-summary">
        <LoaderCircle v-if="isSearching" :size="13" class="spin" />
        <Search v-else :size="13" class="search-icon" />
        <span v-if="isSearching" class="summary-text">正在检索更改内容...</span>
        <span v-else-if="totalMatchedFiles > 0" class="summary-text">
          找到 <strong>{{ totalMatchedFiles }}</strong> 个文件中的
          <strong>{{ totalMatchedLines }}</strong> 处内容匹配
        </span>
        <span v-else class="summary-text text-muted"
          >未找到匹配的更改或文件</span
        >
      </div>
      <div class="header-shortcuts">
        <button
          type="button"
          class="shortcut-close-btn"
          title="关闭搜索结果 (ESC)"
          @click="emit('close')"
        >
          <kbd>ESC</kbd>
          <span>关闭</span>
        </button>
      </div>
    </div>

    <!-- 结果列表 -->
    <div class="dropdown-body">
      <div v-if="!isSearching && totalMatchedFiles === 0" class="empty-state">
        <SearchX :size="24" class="empty-icon" />
        <span>未找到与 "{{ searchKeyword }}" 相关的更改内容或文件名</span>
      </div>

      <div
        v-for="item in searchResults"
        :key="`${item.isStaged ? 'S' : 'W'}:${item.path}`"
        class="search-file-group"
      >
        <!-- 文件头部行（点击打开该文件） -->
        <div
          class="file-header-row"
          :title="item.path"
          @click="handleOpenFile(item)"
        >
          <!-- 区域标签 -->
          <span
            class="area-badge"
            :class="item.isStaged ? 'staged' : 'unstaged'"
          >
            {{ item.isStaged ? "暂存" : "工作区" }}
          </span>

          <FileIcon :size="14" class="file-icon" />

          <!-- 文件名高亮 -->
          <span class="file-name">
            <template v-for="(part, idx) in item.fileNameParts" :key="idx">
              <mark v-if="part.isMatch" class="highlight">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </span>

          <!-- 所在目录高亮 -->
          <span v-if="item.fileDir" class="file-dir">
            <template v-for="(part, idx) in item.dirParts" :key="idx">
              <mark v-if="part.isMatch" class="highlight">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </span>

          <!-- 文件状态 Badge -->
          <span
            class="status-badge"
            :class="`status-${item.status.toLowerCase()}`"
          >
            {{ item.status }}
          </span>

          <!-- 匹配计数 -->
          <span
            v-if="item.contentResult.totalMatches > 0"
            class="match-count-badge"
          >
            {{ item.contentResult.totalMatches }}
          </span>
        </div>

        <!-- 内容匹配行（前 3 个） -->
        <div
          v-if="item.contentResult.matches.length > 0"
          class="matches-container"
        >
          <div
            v-for="(match, mIdx) in item.contentResult.matches"
            :key="`${item.path}-m-${mIdx}`"
            class="match-line-item"
            :title="match.lineContent"
            @click="handleOpenFile(item)"
          >
            <span class="line-number">{{ match.lineNumber }}</span>
            <span class="line-code">
              <template v-for="(part, pIdx) in match.parts" :key="pIdx">
                <mark v-if="part.isMatch" class="highlight">{{
                  part.text
                }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </span>
          </div>

          <!-- 剩余结果折叠提示 -->
          <div
            v-if="item.contentResult.remainingCount > 0"
            class="remaining-tip"
          >
            剩余 {{ item.contentResult.remainingCount }} 个结果...
          </div>
        </div>

        <!-- 仅文件名匹配提示 -->
        <div
          v-else-if="item.hasFileNameMatch"
          class="filename-only-tip"
          @click="handleOpenFile(item)"
        >
          <span class="tip-dot" />
          <span>文件名匹配（内容中无更多匹配项）</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { Search, SearchX, LoaderCircle } from "lucide-vue-next";
import FileIcon from "@/components/common/FileIcon.vue";
import type { GitSearchResultFileItem } from "../composables/useGitWorkspaceSearch";

defineProps<{
  searchKeyword: string;
  isSearching: boolean;
  searchResults: GitSearchResultFileItem[];
  totalMatchedFiles: number;
  totalMatchedLines: number;
}>();

const emit = defineEmits<{
  (e: "select-file", item: GitSearchResultFileItem): void;
  (e: "close"): void;
}>();

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown, true);
});

const handleOpenFile = (item: GitSearchResultFileItem) => {
  emit("select-file", item);
};
</script>

<style scoped>
.git-search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin-left: auto;
  margin-right: auto;
  width: 580px;
  max-width: 92vw;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.28),
    0 2px 6px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
  user-select: none;
}

/* 顶部状态栏 */
.dropdown-header {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background-color: rgba(var(--card-bg-rgb), 0.35);
  border-bottom: var(--border-width) solid var(--border-color);
  font-size: 11px;
  flex-shrink: 0;
}

.header-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
}

.summary-text strong {
  color: var(--el-color-primary);
  font-weight: 600;
}

.text-muted {
  color: var(--el-text-color-secondary);
}

.search-icon {
  color: var(--el-text-color-secondary);
}

.spin {
  animation: search-spin 0.8s linear infinite;
  color: var(--el-color-primary);
}

@keyframes search-spin {
  to {
    transform: rotate(360deg);
  }
}

.header-shortcuts {
  display: flex;
  align-items: center;
}

.shortcut-close-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  margin: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 10px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
  user-select: none;
}

.shortcut-close-btn:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: rgba(var(--el-color-primary-rgb), 0.25);
  color: var(--el-text-color-regular);
}

.shortcut-close-btn:active {
  transform: translateY(1px);
}

.shortcut-close-btn kbd {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 1px 4px;
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
  transition: border-color 0.15s ease;
}

.shortcut-close-btn:hover kbd {
  border-color: rgba(var(--el-color-primary-rgb), 0.4);
  color: var(--el-color-primary);
}

/* 结果列表主体 */
.dropdown-body {
  max-height: 420px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.empty-icon {
  color: var(--el-text-color-placeholder);
}

/* 单个文件结果组 */
.search-file-group {
  background-color: rgba(var(--card-bg-rgb), 0.4);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.search-file-group:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.45);
  background-color: rgba(var(--card-bg-rgb), 0.55);
}

/* 文件头部行 */
.file-header-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  background-color: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.12s ease;
}

.file-header-row:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.area-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
  flex-shrink: 0;
}

.area-badge.staged {
  background-color: rgba(var(--el-color-primary-rgb), 0.15);
  color: var(--el-color-primary);
}

.area-badge.unstaged {
  background-color: rgba(var(--el-color-warning-rgb), 0.15);
  color: var(--el-color-warning);
}

.file-icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.file-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.file-dir {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.status-badge.status-m {
  color: #e5c07b;
}

.status-badge.status-a {
  color: #98c379;
}

.status-badge.status-d {
  color: #e06c75;
}

.match-count-badge {
  font-size: 10px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-primary);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
  flex-shrink: 0;
}

/* 内容匹配行容器 */
.matches-container {
  display: flex;
  flex-direction: column;
  padding: 2px 0;
}
.match-line-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 20px;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
  transition: background-color 0.1s ease;
  font-family: monospace;
}

.match-line-item:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.line-number {
  color: var(--el-text-color-placeholder);
  font-size: 10px;
  min-width: 28px;
  text-align: right;
  flex-shrink: 0;
  user-select: none;
}

.line-code {
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

/* 高亮样式 */
mark.highlight {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.28)
  );
  color: var(--el-color-primary);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 600;
}

/* 剩余提示 */
.remaining-tip {
  padding: 4px 10px 4px 56px;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

/* 仅文件名匹配提示 */
.filename-only-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 24px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.filename-only-tip:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.tip-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  flex-shrink: 0;
}
</style>
