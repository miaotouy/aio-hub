<template>
  <div
    class="repo-bar-container"
    :class="{ 'is-pinned': isPinned, 'is-hovered': isHovered }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="repo-bar-content">
      <!-- 顶部固定按钮与标题 -->
      <div class="repo-bar-header">
        <span v-if="isPinned || isHovered" class="header-title">代码仓库</span>
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
            <component :is="isPinned ? PinOff : Pin" class="w-3.5 h-3.5" />
          </el-button>
        </el-tooltip>
      </div>

      <!-- 仓库列表 -->
      <div class="repo-list">
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
          <div v-if="isPinned || isHovered" class="repo-info">
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
        <el-tooltip content="刷新所有仓库状态" placement="right">
          <el-button circle :loading="isRefreshing" @click="refreshAllStatuses">
            <RefreshCw v-if="!isRefreshing" class="w-4 h-4" />
          </el-button>
        </el-tooltip>

        <el-tooltip content="仓库管理与设置" placement="right">
          <el-button circle @click="$emit('open-settings')">
            <Settings class="w-4 h-4" />
          </el-button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Pin, PinOff, RefreshCw, Settings } from "lucide-vue-next";
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
  backdrop-filter: blur(var(--ui-blur));
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
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.05);
}

/* 头部 */
.repo-bar-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pin-btn {
  margin-left: auto;
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
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.repo-bar-container.is-pinned .repo-bar-footer,
.repo-bar-container.is-hovered .repo-bar-footer {
  justify-content: flex-start;
}
</style>
