<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Expand, Fold } from "@element-plus/icons-vue";
import { toolsConfig, type ToolConfig } from "../config/tools";
import { useDetachable } from "../composables/useDetachable";

// Props
interface Props {
  collapsed: boolean;
  toolsVisible: Record<string, boolean>;
  isDetached: (id: string) => boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  "update:collapsed": [value: boolean];
}>();

const router = useRouter();
const route = useRoute();
const { startDetaching } = useDetachable();

// 内部状态与 props 同步
const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit("update:collapsed", value),
});

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 计算可见的工具列表
const visibleTools = computed(() => {
  const baseTools = props.toolsVisible
    ? toolsConfig.filter((tool) => {
        const toolId = getToolIdFromPath(tool.path);
        return props.toolsVisible[toolId] !== false;
      })
    : toolsConfig;

  // 过滤掉已分离的工具
  return baseTools.filter((tool) => !props.isDetached(getToolIdFromPath(tool.path)));
});

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};

const handleSelect = (key: string) => {
  router.push(key);
};

const handleDragStart = (event: MouseEvent, tool: ToolConfig) => {
  event.preventDefault();
  event.stopPropagation();

  startDetaching({
    id: getToolIdFromPath(tool.path),
    displayName: tool.name,
    type: "tool",
    width: 900,
    height: 700,
    mouseX: event.screenX,
    mouseY: event.screenY,
    metadata: { tool },
    onClickInstead: () => {
      router.push(tool.path);
    },
  });
};
</script>

<template>
  <el-aside
    :width="isCollapsed ? '64px' : '220px'"
    :class="['main-sidebar', { 'is-collapsed': isCollapsed }]"
  >
    <!-- 上部分：标题和导航 -->
    <div class="sidebar-top">
      <!-- 侧边栏头部：根据isCollapsed显示不同内容 -->
      <div class="sidebar-header" :class="{ 'is-collapsed': isCollapsed }">
        <h2 v-if="!isCollapsed" class="sidebar-title">AIO工具箱</h2>
      </div>

      <el-menu
        :default-active="route.path"
        class="el-menu-vertical-demo"
        :collapse="isCollapsed"
        @select="handleSelect"
      >
        <el-menu-item index="/">
          <el-icon><i-ep-home-filled /></el-icon>
          <template #title>主页</template>
        </el-menu-item>
        <el-menu-item
          v-for="tool in visibleTools"
          :key="tool.path"
          :index="tool.path"
          @mousedown.left="handleDragStart($event, tool)"
          class="draggable-menu-item"
        >
          <el-icon><component :is="tool.icon" /></el-icon>
          <template #title>{{ tool.name }}</template>
        </el-menu-item>
      </el-menu>
    </div>

    <!-- 下部分：收起按钮 -->
    <div class="sidebar-bottom">
      <div class="sidebar-actions">
        <el-tooltip
          effect="dark"
          :content="isCollapsed ? '展开侧边栏' : '收起侧边栏'"
          placement="right"
          :hide-after="0"
        >
          <el-button
            :icon="isCollapsed ? Expand : Fold"
            circle
            @click="toggleSidebar"
            class="action-btn collapse-btn"
          />
        </el-tooltip>
      </div>
    </div>
  </el-aside>
</template>

<style scoped>
.main-sidebar {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow-x: hidden;
}

/* 侧边栏三段式布局 */
.sidebar-top {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: 20px;
  overflow-x: hidden;
}

.sidebar-bottom {
  flex: 0 0 auto;
  padding: 15px 0;
  display: flex;
  justify-content: center;
  overflow-x: hidden;
}

/* 标题样式 */
.sidebar-header {
  margin-bottom: 30px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  padding: 0 20px;
  box-sizing: border-box;
  overflow-x: hidden;
}

.sidebar-title {
  color: var(--sidebar-text);
  font-size: 24px;
  font-weight: bold;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  transition: opacity 0.3s ease;
}

/* 收起状态下的头部样式 */
.sidebar-header.is-collapsed {
  justify-content: center;
}

.el-menu-vertical-demo {
  border-right: none;
  background-color: transparent;
  flex-grow: 1;
  overflow-x: hidden;
}

.el-menu-vertical-demo:not(.el-menu--collapse) {
  width: 240px;
}

.sidebar-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  transition: flex-direction 0.3s ease;
}

.main-sidebar.is-collapsed .sidebar-actions {
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.action-btn {
  border: none;
  background: transparent;
  color: var(--text-color);
  padding: 8px;
}

.action-btn:hover {
  background-color: var(--primary-color-light);
}

/* 拖拽菜单项样式 */
.draggable-menu-item {
  cursor: move;
  user-select: none;
}

.draggable-menu-item:active {
  opacity: 0.7;
}
</style>

<style>
/* 全局样式 - 菜单相关 */
.el-menu {
  background-color: transparent !important;
}

.el-menu-item,
.el-sub-menu__title {
  color: var(--sidebar-text) !important;
}

.el-menu-item:hover,
.el-sub-menu__title:hover {
  background-color: var(--primary-color-light) !important;
}

.el-menu-item.is-active {
  background-color: rgba(var(--primary-color-rgb), 0.08) !important;
  color: var(--primary-color) !important;
  font-weight: 500;
  position: relative;
}

/* 左侧高亮条 */
.el-menu-item.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 60%;
  width: 3px;
  background-color: var(--primary-color);
  border-radius: 0 2px 2px 0;
  box-shadow: 0 0 8px rgba(var(--primary-color-rgb), 0.4);
}

/* 修复收起时菜单图标不居中的问题 */
.el-menu--collapse .el-menu-item > div {
  justify-content: center;
}
</style>
