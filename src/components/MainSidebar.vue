<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Expand, Fold, Promotion } from "@element-plus/icons-vue";
import { Puzzle } from "lucide-vue-next";
import type { ToolConfig } from "@/services/types";
import { useToolsStore } from "@/stores/tools";
import { useDetachable } from "../composables/useDetachable";
import { useTheme } from "../composables/useTheme";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import iconBlack from "../assets/aio-icon-black.svg";
import iconWhite from "../assets/aio-icon-white.svg";

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
const toolsStore = useToolsStore();
const { startDetaching, detachByClick } = useDetachable();
const { isDark } = useTheme();
const { appearanceSettings } = useThemeAppearance();
const logoSrc = computed(() => (isDark.value ? iconWhite : iconBlack));

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
    ? toolsStore.orderedTools.filter((tool) => {
        const toolId = getToolIdFromPath(tool.path);
        // 明确处理 undefined：默认显示（true）
        const isVisible = props.toolsVisible[toolId];
        return isVisible !== false;
      })
    : toolsStore.orderedTools;

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

const handleDetachByClick = async (tool: ToolConfig) => {
  const success = await detachByClick({
    id: getToolIdFromPath(tool.path),
    displayName: tool.name,
    type: "tool",
    width: 900, // TODO: 从工具配置中读取默认尺寸
    height: 700,
    metadata: { tool },
  });

  if (success && route.path === tool.path) {
    // 如果分离的是当前页面，则导航回主页
    router.push("/");
  }
};

// 滚动遮罩相关
const menuContainerRef = ref<HTMLElement | null>(null);

const updateScrollMasks = () => {
  if (!menuContainerRef.value) return;
  const el = menuContainerRef.value;
  const { scrollTop, scrollHeight, clientHeight } = el;

  // 顶部遮罩：当滚动位置大于5px时显示
  const showTopMask = scrollTop > 5;

  // 底部遮罩：当还可以向下滚动超过5px时显示
  const showBottomMask = scrollHeight - scrollTop - clientHeight > 5;

  // 使用 CSS 变量控制 mask-image 的渐变，实现真正的透明效果
  el.style.setProperty("--top-mask-active", showTopMask ? "0" : "1");
  el.style.setProperty("--bottom-mask-active", showBottomMask ? "0" : "1");
};

const setupScrollListener = () => {
  if (menuContainerRef.value) {
    menuContainerRef.value.addEventListener("scroll", updateScrollMasks);
    // 初始检查
    nextTick(() => updateScrollMasks());
  }
};

const cleanupScrollListener = () => {
  if (menuContainerRef.value) {
    menuContainerRef.value.removeEventListener("scroll", updateScrollMasks);
  }
};

onMounted(() => {
  setupScrollListener();
  // 监听窗口大小变化
  window.addEventListener("resize", updateScrollMasks);
});

onUnmounted(() => {
  cleanupScrollListener();
  window.removeEventListener("resize", updateScrollMasks);
});
</script>

<template>
  <el-aside
    :width="isCollapsed ? '64px' : '220px'"
    :class="['main-sidebar', { 'is-collapsed': isCollapsed, 'glass-sidebar': appearanceSettings?.enableUiEffects && appearanceSettings?.enableUiBlur }]"
  >
    <!-- 上部分：标题和导航 -->
    <div class="sidebar-top">
      <!-- 侧边栏头部：根据isCollapsed显示不同内容 -->
      <div class="sidebar-header" :class="{ 'is-collapsed': isCollapsed }">
        <img :src="logoSrc" alt="Logo" class="sidebar-logo" />
        <h2 v-if="!isCollapsed" class="sidebar-title">AIO Hub</h2>
      </div>

      <!-- 菜单容器包装器 - 用于遮罩定位 -->
      <div class="menu-wrapper">
        <!-- 菜单滚动容器 -->
        <div class="menu-container" ref="menuContainerRef">
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
            <el-menu-item index="/extensions">
              <el-icon><Puzzle :size="18" /></el-icon>
              <template #title>扩展</template>
            </el-menu-item>
            <el-menu-item
              v-for="tool in visibleTools"
              :key="tool.path"
              :index="tool.path"
              @mousedown.left="handleDragStart($event, tool)"
              class="draggable-menu-item"
              style="padding: 0"
            >
              <el-dropdown
                trigger="contextmenu"
                placement="bottom-start"
                style="width: 100%; height: 100%"
              >
                <span class="menu-item-trigger">
                  <!-- 插件图标直接渲染，不用 el-icon 包裹 -->
                  <component
                    v-if="tool.path.startsWith('/plugin-')"
                    :is="tool.icon"
                    class="plugin-icon-wrapper"
                  />
                  <!-- 普通图标用 el-icon 包裹 -->
                  <el-icon v-else><component :is="tool.icon" /></el-icon>
                  <!-- 手动处理标题，以使其成为触发器的一部分 -->
                  <template v-if="!isCollapsed">
                    <span class="menu-item-title-text">{{ tool.name }}</span>
                  </template>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="handleDetachByClick(tool)">
                      <el-icon><Promotion /></el-icon>
                      <span>在新窗口中打开</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </el-menu-item>
          </el-menu>
        </div>
      </div>
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
  overflow: hidden;
  position: relative;
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

.sidebar-logo {
  width: 32px;
  height: 32px;
  transition: all 0.3s ease;
}

.sidebar-header:not(.is-collapsed) .sidebar-logo {
  margin-right: 12px;
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

/* 菜单容器包装器 - 用于遮罩定位 */
.menu-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* 菜单滚动容器 */
.menu-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  /* 使用 mask-image 实现顶部和底部的渐变遮罩，以支持半透明背景 */
  --mask-height: 30px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, var(--top-mask-active, 1)) 0%,
    black var(--mask-height),
    black calc(100% - var(--mask-height)),
    rgba(0, 0, 0, var(--bottom-mask-active, 1)) 100%
  );
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, var(--top-mask-active, 1)) 0%,
    black var(--mask-height),
    black calc(100% - var(--mask-height)),
    rgba(0, 0, 0, var(--bottom-mask-active, 1)) 100%
  );
}

/* 隐藏滚动条但保留滚动功能 */
.menu-container::-webkit-scrollbar {
  display: none;
}

.menu-container {
  -ms-overflow-style: none;  /* IE 和 Edge */
  scrollbar-width: none;  /* Firefox */
}

.el-menu-vertical-demo {
  border-right: none;
  background-color: transparent;
  overflow: visible; /* 确保 el-menu 自身不创建滚动条 */
}

.el-menu-vertical-demo:not(.el-menu--collapse) {
  /* 移除固定宽度，让其自适应父容器 */
  width: 100%;
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

.menu-item-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0 20px; /* 模拟 el-menu-item 的内边距 */
  box-sizing: border-box;
}

.is-collapsed .menu-item-trigger {
  justify-content: center;
  padding: 0;
}

.menu-item-title-text {
  margin-left: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 继承 el-menu-item 的颜色 */
  color: inherit;
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

/* 插件图标样式 - 模拟 el-icon 的布局 */
.plugin-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  font-size: inherit;
  vertical-align: middle;
}
</style>
