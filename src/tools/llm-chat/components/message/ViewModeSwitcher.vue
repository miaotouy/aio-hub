<script setup lang="ts">
import { computed } from 'vue';
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon } from 'element-plus';
import { List } from '@element-plus/icons-vue';
import { GitMerge, Network } from 'lucide-vue-next';
import { useLlmChatUiState } from '../../composables/useLlmChatUiState';

/**
 * 视图模式切换器
 * 提供对话视图和树图视图的切换功能
 */

const { viewMode } = useLlmChatUiState();

// 当前视图模式的显示信息
const currentModeInfo = computed(() => {
  switch (viewMode.value) {
    case 'linear':
      return { label: '对话视图', icon: List };
    case 'graph':
      return { label: '树图视图', icon: GitMerge };
    case 'force-graph':
      return { label: '高级树图视图', icon: Network };
    default:
      return { label: '对话视图', icon: List };
  }
});

// 切换视图模式
const handleSelect = (mode: 'linear' | 'graph' | 'force-graph') => {
  viewMode.value = mode;
};
</script>

<template>
  <ElDropdown trigger="click" @command="handleSelect">
    <div class="view-mode-switcher">
      <ElIcon :size="16">
        <component :is="currentModeInfo.icon" />
      </ElIcon>
      <span class="mode-label">{{ currentModeInfo.label }}</span>
    </div>
    <template #dropdown>
      <ElDropdownMenu>
        <ElDropdownItem
          command="linear"
          :class="{ 'is-active': viewMode === 'linear' }"
        >
          <ElIcon :size="16">
            <List />
          </ElIcon>
          <span>对话视图</span>
        </ElDropdownItem>
        <ElDropdownItem
          command="graph"
          :class="{ 'is-active': viewMode === 'graph' }"
        >
          <ElIcon :size="16">
            <GitMerge />
          </ElIcon>
          <span>树图视图</span>
        </ElDropdownItem>
        <ElDropdownItem
          command="force-graph"
          :class="{ 'is-active': viewMode === 'force-graph' }"
        >
          <ElIcon :size="16">
            <Network />
          </ElIcon>
          <span>高级树图视图</span>
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<style scoped>
.view-mode-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  color: var(--text-color-secondary);
  border: 1px solid transparent;
}

.view-mode-switcher:hover {
  background-color: var(--el-fill-color-light);
  color: var(--primary-color);
  border-color: var(--primary-color);
  transform: translateY(-1px);
}

.view-mode-switcher:active {
  background-color: var(--el-fill-color);
  transform: translateY(0);
}

.mode-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

/* 下拉菜单项样式 */
:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.el-dropdown-menu__item.is-active) {
  color: var(--primary-color);
  background-color: var(--el-fill-color-light);
}

:deep(.el-dropdown-menu__item .el-icon) {
  margin-right: 0;
}
</style>