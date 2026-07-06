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
  <div
    class="repo-bar-container"
    :class="{ 'is-pinned': isPinned, 'is-hovered': isHovered }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="repo-bar-content">
      <!-- 顶部固定按钮与标题 -->
      <div class="repo-bar-header">
        <el-tooltip
          :content="isPinned ? '取消固定仓库栏' : '固定仓库栏'"
          placement="right"
        >
          <el-button
            circle
            size="small"
            class="pin-btn"
            @click="$emit('toggle-pin')"
          >
            <component :is="isPinned ? PinOff : Pin" :size="14" />
          </el-button>
        </el-tooltip>
        <span v-if="isPinned || isHovered" class="header-title">代码仓库</span>
      </div>

      <!-- 仓库列表 -->
      <div class="repo-list">
        <!-- 全景模式虚拟项 -->
        <div
          v-if="repositories.length > 0"
          class="repo-item panorama-item"
          :class="{ active: currentRepoPath === '__panorama__' }"
          @click="switchRepoWithAutoPull('__panorama__')"
        >
          <div class="repo-avatar-wrapper">
            <div class="panorama-icon-wrapper">
              <LayoutGrid :size="16" class="text-primary" />
            </div>
            <!-- 聚合状态徽章 -->
            <div class="badges-container">
              <span v-if="getAllUncommittedCount() > 0" class="badge badge-red">
                {{ getAllUncommittedCount() }}
              </span>
              <span v-if="getAllAheadCount() > 0" class="badge badge-blue">
                {{ getAllAheadCount() }}
              </span>
            </div>
          </div>

          <div
            class="repo-info"
            :class="{ 'show-info': isPinned || isHovered }"
          >
            <div class="repo-name">全景模式</div>
            <div class="repo-branch">所有仓库看板</div>
          </div>
        </div>

        <div class="divider" v-if="repositories.length > 0" />

        <div
          v-for="repo in repositories"
          :key="repo.path"
          class="repo-item"
          :class="{ active: currentRepoPath === repo.path }"
          @click="switchRepoWithAutoPull(repo.path)"
        >
          <!-- 仓库头像与状态徽章 -->
          <div class="repo-avatar-wrapper">
            <Avatar src="" :alt="repo.alias || repo.name" class="repo-avatar" />
            <!-- 状态徽章 -->
            <div class="badges-container">
              <span
                v-if="getUncommittedCount(repo.path) > 0"
                class="badge badge-red"
              >
                {{ getUncommittedCount(repo.path) }}
              </span>
              <span
                v-if="getAheadCount(repo.path) > 0"
                class="badge badge-blue"
              >
                {{ getAheadCount(repo.path) }}
              </span>
            </div>
          </div>

          <!-- 仓库详细信息（展开时显示） -->
          <div
            class="repo-info"
            :class="{ 'show-info': isPinned || isHovered }"
          >
            <div class="repo-name" :title="repo.alias || repo.name">
              {{ repo.alias || repo.name }}
            </div>
            <div class="repo-branch" :title="getBranchName(repo.path)">
              {{ getBranchName(repo.path) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作区 -->
      <div class="repo-bar-footer">
        <div class="footer-item">
          <el-tooltip content="刷新所有仓库状态" placement="right">
            <el-button
              circle
              :loading="isRefreshing"
              @click="refreshAllStatuses"
            >
              <RefreshCw v-if="!isRefreshing" :size="16" />
            </el-button>
          </el-tooltip>
        </div>

        <div class="footer-item">
          <el-tooltip content="仓库管理与设置" placement="right">
            <el-button circle @click="$emit('open-settings')">
              <Settings :size="16" />
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Pin, PinOff, RefreshCw, Settings, LayoutGrid } from "lucide-vue-next";
import Avatar from "@/components/common/Avatar.vue";
import {
  repositories,
  currentRepoPath,
  repoStatuses,
  isRefreshing,
} from "../composables/useGitCommitterState";
import {
  refreshAllStatuses,
  switchRepoWithAutoPull,
} from "../composables/useGitCommitterRunner";

defineProps<{
  isPinned: boolean;
}>();

defineEmits<{
  (e: "toggle-pin"): void;
  (e: "open-settings"): void;
}>();

const isHovered = ref(false);
let hoverTimeout: number | null = null;

const handleMouseEnter = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = window.setTimeout(() => {
    isHovered.value = true;
  }, 200); // 悬停展开加 200ms 延迟
};

const handleMouseLeave = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  isHovered.value = false;
};

// ===== 状态获取辅助函数 =====
const getUncommittedCount = (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return 0;
  return status.staged.length + status.unstaged.length;
};

const getAheadCount = (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return 0;
  return status.ahead;
};

const getBranchName = (path: string) => {
  const status = repoStatuses.value[path];
  if (!status) return "未加载";
  return status.branch || "HEAD";
};

// ===== 聚合状态获取 =====
const getAllUncommittedCount = () => {
  return repositories.value.reduce(
    (acc, repo) => acc + getUncommittedCount(repo.path),
    0
  );
};

const getAllAheadCount = () => {
  return repositories.value.reduce(
    (acc, repo) => acc + getAheadCount(repo.path),
    0
  );
};
</script>

<style scoped>
.repo-bar-container {
  width: 64px;
  height: 100%;
  flex-shrink: 0;
  position: relative;
  transition: width 0.2s ease;
  border-right: var(--border-width) solid var(--border-color);
  background-color: var(--sidebar-bg);
  z-index: 100;
}

.repo-bar-container.is-pinned {
  width: 240px;
}

.repo-bar-content {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 64px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}

.repo-bar-container.is-pinned .repo-bar-content,
.repo-bar-container.is-hovered .repo-bar-content {
  width: 240px;
}

/* 悬停展开时的毛玻璃与微弱阴影 */
.repo-bar-container.is-hovered:not(.is-pinned) .repo-bar-content {
  background-color: var(--sidebar-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-right: var(--border-width) solid var(--border-color);
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
}

/* 头部 */
.repo-bar-header {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  gap: 12px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.repo-bar-container.is-pinned .header-title,
.repo-bar-container.is-hovered .header-title {
  opacity: 1;
  /* 延迟显示文字，等宽度展开得差不多了再淡入，避免竖排抖动 */
  transition-delay: 0.1s;
}

.pin-btn {
  flex-shrink: 0;
}

/* 仓库列表 */
.repo-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 4px 12px;
  flex-shrink: 0;
}

.panorama-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.repo-item {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  position: relative;
  gap: 12px;
}

.repo-item:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.repo-item.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.repo-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background-color: var(--el-color-primary);
  border-radius: 0 4px 4px 0;
}

/* 头像与徽章 */
.repo-avatar-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.repo-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

.badges-container {
  position: absolute;
  top: -2px;
  right: -2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 2;
}

.badge {
  font-size: 10px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 10px;
  line-height: 1;
  min-width: 12px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.badge-red {
  background-color: var(--el-color-danger);
  color: white;
}

.badge-blue {
  background-color: var(--el-color-primary);
  color: white;
}

/* 仓库信息 */
.repo-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  opacity: 0;
  width: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    width 0.15s ease;
}

.repo-info.show-info {
  opacity: 1;
  width: auto;
  pointer-events: auto;
  /* 延迟显示文字，等宽度展开得差不多了再淡入，避免竖排抖动 */
  transition-delay: 0.1s;
}

.repo-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repo-branch {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 底部操作区 */
.repo-bar-footer {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 12px;
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.footer-item {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer-item :deep(.el-button) {
  margin: 0;
}
</style>
