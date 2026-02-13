<template>
  <InfoCard title="扫描结果" class="result-card">
    <template #header-extra>
      <div v-if="store.result" class="header-actions">
        <el-tag type="info" size="small"> {{ store.result.statistics.totalGroups }} 组 </el-tag>
        <el-tag type="warning" size="small">
          {{ store.result.statistics.totalDuplicates }} 个冗余
        </el-tag>
        <el-tag type="danger" size="small">
          {{ formatBytes(store.result.statistics.totalWastedBytes) }}
        </el-tag>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-if="!store.hasScanned && !store.isScanning" class="empty-state">
      <FileSearch :size="48" class="empty-icon" />
      <p>选择目录并开始扫描</p>
    </div>

    <!-- 扫描中 -->
    <div v-else-if="store.isScanning" class="scanning-state">
      <el-icon class="is-loading" :size="32">
        <Loading />
      </el-icon>
      <p v-if="store.scanProgress">
        {{ stageLabel(store.scanProgress.stage) }} {{ store.scanProgress.stageProgress.current }}/{{
          store.scanProgress.stageProgress.total
        }}
        <template v-if="store.scanProgress.foundGroups > 0">
          · 已发现 {{ store.scanProgress.foundGroups }} 组
        </template>
      </p>
      <p v-else>正在初始化扫描...</p>
      <p v-if="store.scanProgress?.currentFile" class="scan-path-hint">
        {{ truncatePath(store.scanProgress.currentFile) }}
      </p>
    </div>

    <!-- 无结果 -->
    <div v-else-if="store.result && store.result.groups.length === 0" class="empty-state">
      <CircleCheck :size="48" class="empty-icon success" />
      <p>未发现重复文件</p>
      <p class="sub-text">共扫描 {{ store.result.statistics.totalFilesScanned }} 个文件</p>
    </div>

    <!-- 结果列表 -->
    <div v-else-if="store.result" class="result-content">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="store.searchKeyword"
            placeholder="搜索文件名..."
            clearable
            size="small"
            style="width: 200px"
          >
            <template #prefix>
              <Search :size="14" />
            </template>
          </el-input>
          <el-select v-model="store.filterMatchType" size="small" style="width: 120px">
            <el-option label="全部类型" value="all" />
            <el-option label="精确匹配" value="exact" />
            <el-option label="规范化匹配" value="normalized" />
          </el-select>
          <el-select v-model="store.sortBy" size="small" style="width: 130px">
            <el-option label="按浪费空间" value="wastedBytes" />
            <el-option label="按相似度" value="similarity" />
            <el-option label="按文件数" value="fileCount" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <el-button size="small" @click="store.selectAllDuplicates()" :disabled="store.isDeleting">
            全选冗余
          </el-button>
          <el-button
            size="small"
            @click="store.clearSelection()"
            :disabled="store.selectedPaths.size === 0"
          >
            清空选择
          </el-button>
          <el-button
            type="danger"
            size="small"
            :disabled="store.selectedPaths.size === 0 || store.isDeleting"
            :loading="store.isDeleting"
            @click="emit('delete')"
          >
            <Trash2 :size="14" style="margin-right: 4px" />
            删除选中 ({{ store.selectedPaths.size }})
            <template v-if="store.selectedTotalSize > 0">
              · {{ formatBytes(store.selectedTotalSize) }}
            </template>
          </el-button>
        </div>
      </div>

      <!-- 分组列表 -->
      <div class="groups-list">
        <div
          v-for="group in store.filteredGroups"
          :key="group.id"
          class="group-card"
          :class="{ active: store.activeGroupId === group.id }"
        >
          <div class="group-header" @click="toggleGroup(group.id)">
            <div class="group-header-left">
              <ChevronRight
                :size="16"
                class="expand-icon"
                :class="{ expanded: store.activeGroupId === group.id }"
              />
              <FileIcon :file-name="group.representativeFile.name" :size="18" />
              <span class="group-rep-name" :title="group.representativeFile.path">
                {{ group.representativeFile.name }}
              </span>
              <el-tag
                size="small"
                :type="group.similarFiles[0]?.matchType === 'exact' ? 'danger' : 'warning'"
              >
                {{ group.similarFiles[0]?.matchType === "exact" ? "精确" : "规范化" }}
              </el-tag>
            </div>
            <div class="group-header-right">
              <span class="group-meta">{{ group.similarFiles.length }} 个冗余</span>
              <span class="group-meta waste">{{
                formatBytes(group.metadata.totalWastedBytes)
              }}</span>
              <el-checkbox
                :model-value="isGroupAllSelected(group)"
                :indeterminate="isGroupPartialSelected(group)"
                @change="(val: boolean) => toggleGroupSelection(group.id, val)"
                @click.stop
              />
            </div>
          </div>

          <!-- 展开的文件列表 -->
          <div v-if="store.activeGroupId === group.id" class="group-body">
            <!-- 代表文件 -->
            <div class="file-row representative">
              <div class="file-info">
                <Crown :size="14" class="crown-icon" />
                <span class="file-name" :title="group.representativeFile.path">
                  {{ group.representativeFile.path }}
                </span>
              </div>
              <div class="file-meta">
                <span>{{ formatBytes(group.representativeFile.size) }}</span>
                <span class="file-date">{{ formatDate(group.representativeFile.modified) }}</span>
              </div>
            </div>

            <!-- 相似文件 -->
            <div v-for="sf in group.similarFiles" :key="sf.file.path" class="file-row duplicate">
              <div class="file-info">
                <el-checkbox
                  :model-value="store.selectedPaths.has(sf.file.path)"
                  @change="(val: boolean) => toggleFileSelection(sf.file.path, val)"
                />
                <span class="file-name" :title="sf.file.path">
                  {{ sf.file.path }}
                </span>
              </div>
              <div class="file-meta">
                <span>{{ formatBytes(sf.file.size) }}</span>
                <span class="file-date">{{ formatDate(sf.file.modified) }}</span>
                <el-button
                  text
                  size="small"
                  @click="emit('diff', group.representativeFile.path, sf.file.path)"
                >
                  <GitCompareArrows :size="14" />
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 跳过的文件 -->
      <div v-if="store.result.skippedFiles.length > 0" class="skipped-section">
        <el-collapse>
          <el-collapse-item :title="`跳过的文件 (${store.result.skippedFiles.length})`">
            <div
              v-for="sf in store.result.skippedFiles.slice(0, 50)"
              :key="sf.path"
              class="skipped-item"
            >
              <span class="skipped-path">{{ sf.path }}</span>
              <span class="skipped-reason">{{ sf.reason }}</span>
            </div>
            <p v-if="store.result.skippedFiles.length > 50" class="skipped-more">
              ... 还有 {{ store.result.skippedFiles.length - 50 }} 个
            </p>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { Loading } from "@element-plus/icons-vue";
import {
  FileSearch,
  CircleCheck,
  Search,
  Trash2,
  ChevronRight,
  Crown,
  GitCompareArrows,
} from "lucide-vue-next";
import InfoCard from "@components/common/InfoCard.vue";
import FileIcon from "@components/common/FileIcon.vue";
import { useContentDeduplicatorStore } from "../stores/store";
import type { DuplicateGroup } from "../types";

const emit = defineEmits<{
  (e: "delete"): void;
  (e: "diff", pathA: string, pathB: string): void;
}>();

const store = useContentDeduplicatorStore();

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncatePath(path: string, maxLen = 60): string {
  if (path.length <= maxLen) return path;
  return "..." + path.slice(path.length - maxLen + 3);
}

const STAGE_LABELS: Record<string, string> = {
  collecting: "收集文件中...",
  "size-filter": "尺寸过滤...",
  fingerprint: "快速指纹...",
  hashing: "全文哈希...",
  building: "构建结果...",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

function toggleGroup(groupId: string) {
  store.activeGroupId = store.activeGroupId === groupId ? null : groupId;
}

function isGroupAllSelected(group: DuplicateGroup): boolean {
  return group.similarFiles.every((sf) => store.selectedPaths.has(sf.file.path));
}

function isGroupPartialSelected(group: DuplicateGroup): boolean {
  const selected = group.similarFiles.filter((sf) => store.selectedPaths.has(sf.file.path)).length;
  return selected > 0 && selected < group.similarFiles.length;
}

function toggleGroupSelection(groupId: string, selected: boolean) {
  if (selected) {
    store.selectGroupDuplicates(groupId);
  } else {
    store.deselectGroupDuplicates(groupId);
  }
}

function toggleFileSelection(path: string, selected: boolean) {
  if (selected) {
    store.selectedPaths.add(path);
  } else {
    store.selectedPaths.delete(path);
  }
}
</script>

<style scoped>
.result-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.result-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.header-actions {
  display: flex;
  gap: 6px;
}

.empty-state,
.scanning-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-light);
}

.empty-icon {
  opacity: 0.4;
}

.empty-icon.success {
  color: var(--el-color-success);
  opacity: 0.6;
}

.sub-text {
  font-size: 12px;
  opacity: 0.7;
}

.scan-path-hint {
  font-size: 12px;
  opacity: 0.5;
  max-width: 400px;
  text-align: center;
  word-break: break-all;
}

.result-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.groups-list {
  flex: 1;
  overflow-y: auto;
  padding-top: 8px;
}

.group-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.group-card.active {
  border-color: var(--el-color-primary-light-5);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  background-color: var(--card-bg);
  transition: background-color 0.2s;
}

.group-header:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.04));
}

.group-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.expand-icon {
  transition: transform 0.2s;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.group-rep-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.group-meta {
  font-size: 12px;
  color: var(--text-color-light);
}

.group-meta.waste {
  color: var(--el-color-danger);
  font-weight: 500;
}

.group-body {
  border-top: 1px solid var(--el-border-color-lighter);
}

.file-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 8px 36px;
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.file-row:last-child {
  border-bottom: none;
}

.file-row.representative {
  background-color: rgba(var(--el-color-success-rgb), calc(var(--card-opacity, 1) * 0.05));
}

.file-row.duplicate:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.03));
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.crown-icon {
  color: var(--el-color-success);
  flex-shrink: 0;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  color: var(--text-color-light);
}

.file-date {
  font-size: 11px;
  opacity: 0.7;
}

.skipped-section {
  margin-top: 12px;
  flex-shrink: 0;
}

.skipped-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;
}

.skipped-path {
  color: var(--text-color-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.skipped-reason {
  color: var(--el-color-warning);
  flex-shrink: 0;
  margin-left: 12px;
}

.skipped-more {
  font-size: 12px;
  color: var(--text-color-light);
  text-align: center;
  padding: 8px 0;
}
</style>
