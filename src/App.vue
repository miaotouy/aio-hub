<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Sunny, Moon, Expand, Fold } from "@element-plus/icons-vue";
import { toolsConfig, type ToolConfig } from "./config/tools";
import { useDetachedTools, type WindowConfig } from "./composables/useDetachedTools";
import { useToolDragging } from "./composables/useToolDragging";
import {
  loadAppSettingsAsync,
  updateAppSettingsAsync,
  type AppSettings,
} from "./utils/appSettings";
import { createModuleLogger } from "./utils/logger";
import TitleBar from "./components/TitleBar.vue";
import SystemThemeIcon from "./components/icons/SystemThemeIcon.vue";
import { useTheme } from "./composables/useTheme";

const logger = createModuleLogger("App");

const router = useRouter();
const route = useRoute();
const { currentTheme, toggleTheme } = useTheme();
const { isToolDetached, initializeListeners } = useDetachedTools();
const { startDrag } = useToolDragging();
const isCollapsed = ref(false); // 控制侧边栏收起状态

// 应用设置
const appSettings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: "auto",
  toolsVisible: {},
});

// 获取当前主题图标
const getThemeIcon = computed(() => {
  if (currentTheme.value === "auto") {
    // 跟随系统模式，显示自定义的太阳月亮组合图标
    return SystemThemeIcon;
  } else if (currentTheme.value === "light") {
    // 固定浅色模式，显示太阳
    return Sunny;
  } else {
    // 固定深色模式，显示月亮
    return Moon;
  }
});

// 获取主题提示文本
const getThemeTooltip = computed(() => {
  if (currentTheme.value === "auto") {
    return "主题：跟随系统";
  } else if (currentTheme.value === "light") {
    return "主题：浅色";
  } else {
    return "主题：深色";
  }
});

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 计算可见的工具列表
const visibleTools = computed(() => {
  const baseTools = appSettings.value.toolsVisible
    ? toolsConfig.filter((tool) => {
        const toolId = getToolIdFromPath(tool.path);
        return appSettings.value.toolsVisible![toolId] !== false;
      })
    : toolsConfig;

  // 过滤掉已分离的工具
  return baseTools.filter((tool) => !isToolDetached(getToolIdFromPath(tool.path)));
});

const toggleSidebar = async () => {
  isCollapsed.value = !isCollapsed.value;
  // 使用新的设置管理器保存状态（异步保存）
  updateAppSettingsAsync({ sidebarCollapsed: isCollapsed.value });
};

// 应用主题色
const applyThemeColor = (color: string) => {
  // 验证颜色格式
  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    return;
  }

  // 设置 CSS 变量
  const root = document.documentElement;
  root.style.setProperty("--primary-color", color);

  // 计算悬停色（变亮）
  const hoverColor = lightenColor(color, 20);
  root.style.setProperty("--primary-hover-color", hoverColor);

  // 计算 RGB 值
  const rgb = hexToRgb(color);
  if (rgb) {
    root.style.setProperty("--primary-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }

  // 同步 Element Plus 变量
  root.style.setProperty("--el-color-primary", color);
  root.style.setProperty("--el-color-primary-light-3", hoverColor);
  root.style.setProperty("--el-color-primary-light-5", hoverColor);
  root.style.setProperty("--el-color-primary-light-7", hoverColor);
  root.style.setProperty("--el-color-primary-light-9", hoverColor);

  // 缓存到 localStorage 以避免下次启动时的闪烁
  try {
    localStorage.setItem("app-theme-color", color);
  } catch (error) {
    logger.warn("缓存主题颜色失败", { color, error });
  }
};

// 颜色处理工具函数
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const lightenColor = (hex: string, percent: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * (percent / 100)));
  const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * (percent / 100)));
  const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * (percent / 100)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

// 监听设置变化（用于响应设置页面的更改）
const loadSettings = async () => {
  const settings = await loadAppSettingsAsync();
  appSettings.value = settings;
  isCollapsed.value = settings.sidebarCollapsed;

  // 主题设置由 useTheme 模块自动加载和应用

  // 应用主题色
  if (settings.themeColor) {
    applyThemeColor(settings.themeColor);
  }
};

// 存储事件处理函数的引用，用于清理
let handleSettingsChange: ((event: Event) => void) | null = null;

onMounted(async () => {
  // 初始化分离工具的事件监听
  initializeListeners();

  // 初始加载设置
  await loadSettings();

  // 监听设置变化事件（来自设置页面）- 这是主要的同步机制
  handleSettingsChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;
    if (customEvent.detail) {
      appSettings.value = customEvent.detail;
      isCollapsed.value = customEvent.detail.sidebarCollapsed;

      // 主题设置由 useTheme 模块处理

      // 同步主题色
      if (customEvent.detail.themeColor) {
        applyThemeColor(customEvent.detail.themeColor);
      }
    }
  };

  window.addEventListener("app-settings-changed", handleSettingsChange);
});

// 监听路由变化，仅在离开设置页面时更新一次
watch(
  () => route.path,
  async (_, oldPath) => {
    if (oldPath === "/settings") {
      // 离开设置页面时从文件系统加载最新设置，确保数据同步
      // 使用 setTimeout 避免与事件处理冲突
      setTimeout(async () => {
        await loadSettings();
      }, 100);
    }
  }
);

// 清理事件监听器
onUnmounted(() => {
  // 移除事件监听器
  if (handleSettingsChange) {
    window.removeEventListener("app-settings-changed", handleSettingsChange);
  }
});

const handleSelect = (key: string) => {
  router.push(key);
};

const handleDragStart = (event: MouseEvent, tool: ToolConfig) => {
  // 阻止默认行为和事件冒泡，防止触发 el-menu 的点击导航
  event.preventDefault();
  event.stopPropagation();

  // 数据转换：将 ToolConfig 转换为 WindowConfig
  const toolId = getToolIdFromPath(tool.path);
  const windowConfig: WindowConfig = {
    label: toolId,
    title: tool.name,
    url: `/detached-window?toolPath=${encodeURIComponent(
      tool.path
    )}&title=${encodeURIComponent(tool.name)}`,
    width: 900,
    height: 700,
  };

  // 调用指挥部的 startDrag 方法
  startDrag(event, windowConfig);

  // 如果当前就在这个工具页面，拖拽后导航回主页
  if (route.path === tool.path) {
    router.push("/");
  }
};
</script>

<template>
  <!-- 自定义标题栏 -->
  <TitleBar />

  <!-- 主布局容器，需要添加padding-top来避让标题栏 -->
  <el-container class="common-layout">
    <el-aside
      :width="isCollapsed ? '64px' : '220px'"
      :class="['main-sidebar', { 'is-collapsed': isCollapsed }]"
    >
      <!-- 上部分：标题和导航 -->
      <div class="sidebar-top">
        <!-- 侧边栏头部：根据isCollapsed显示不同内容 -->
        <div v-if="!isCollapsed" class="sidebar-header">
          <div class="header-text-wrapper">
            <h2 class="sidebar-title">AIO工具箱</h2>
          </div>
          <el-tooltip effect="dark" :content="getThemeTooltip" placement="bottom" :hide-after="0">
            <el-icon class="theme-icon" @click="toggleTheme">
              <component :is="getThemeIcon" />
            </el-icon>
          </el-tooltip>
        </div>
        <el-tooltip
          v-else
          effect="dark"
          :content="getThemeTooltip"
          placement="right"
          :hide-after="0"
        >
          <div class="sidebar-header-collapsed" @click="toggleTheme">
            <el-icon class="theme-icon-only">
              <component :is="getThemeIcon" />
            </el-icon>
          </div>
        </el-tooltip>

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

    <el-container>
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <keep-alive :exclude="['Settings']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style>
.common-layout {
  height: calc(100vh - 32px); /* 减去标题栏高度 */
  width: 100vw;
  overflow: hidden; /* 隐藏整个布局的滚动条 */
  margin-top: 32px; /* 为标题栏留出空间 */
}

.main-sidebar {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease; /* 添加宽度过渡效果 */
  overflow-x: hidden; /* 隐藏侧边栏的横向滚动条 */
}

/* 侧边栏三段式布局 */
.sidebar-top {
  flex: 1; /* 占据剩余空间 */
  display: flex;
  flex-direction: column;
  padding-top: 20px;
  overflow-x: hidden; /* 隐藏 sidebar-top 的横向滚动条 */
}

.sidebar-bottom {
  flex: 0 0 auto; /* 不伸缩，保持内容尺寸 */
  padding: 15px 0; /* 垂直内边距15px，水平0 */
  display: flex;
  justify-content: center;
  overflow-x: hidden; /* 隐藏 sidebar-bottom 的横向滚动条 */
}

/* 标题样式 */
.sidebar-header {
  margin-bottom: 30px;
  height: 40px; /* 固定高度，避免收起时跳动 */
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: space-between; /* 文本和图标分别在两端 */
  user-select: none; /* 防止双击选择文字 */
  padding: 0 20px; /* 增加点击区域的左右内边距，方便点击 */
  box-sizing: border-box; /* 确保padding不会撑大元素 */
  overflow-x: hidden; /* 隐藏 sidebar-header 的横向滚动条 */
}

.sidebar-header .header-text-wrapper {
  display: flex;
  align-items: center;
  flex-grow: 1; /* 让文本区域占据剩余空间 */
  justify-content: center; /* 让标题在文本区域内居中 */
  overflow-x: hidden; /* 隐藏 header-text-wrapper 的横向滚动条 */
}

.sidebar-header .theme-icon {
  font-size: 20px; /* 图标大小 */
  color: var(--sidebar-text); /* 图标颜色与文字一致 */
  transition: all 0.3s ease;
  cursor: pointer; /* 表示可点击 */
  padding: 4px;
  border-radius: 4px;
}

.sidebar-header .theme-icon:hover {
  color: var(--primary-color); /* 悬停颜色 */
  background-color: rgba(var(--primary-color-rgb), 0.1);
}

.sidebar-title {
  color: var(--sidebar-text);
  font-size: 24px;
  font-weight: bold;
  margin: 0;
  white-space: nowrap; /* 防止文字换行 */
  overflow: hidden; /* 隐藏溢出文字 */
  transition: opacity 0.3s ease;
}

/* 新增的收起状态下头部样式 */
.sidebar-header-collapsed {
  margin-bottom: 30px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center; /* 图标居中 */
  cursor: pointer;
  user-select: none;
  padding: 0 20px;
  box-sizing: border-box;
  overflow-x: hidden;
}

.sidebar-header-collapsed .theme-icon-only {
  font-size: 20px;
  color: var(--sidebar-text);
  transition: color 0.3s ease;
}

.sidebar-header-collapsed .theme-icon-only:hover {
  color: var(--primary-color);
}

.el-menu-vertical-demo {
  border-right: none;
  background-color: transparent;
  flex-grow: 1; /* 让菜单占据sidebar-top剩余空间 */
  overflow-x: hidden; /* 隐藏菜单的横向滚动条 */
}

.el-menu-vertical-demo:not(.el-menu--collapse) {
  width: 240px; /* 展开时的菜单宽度，与侧边栏宽度一致 */
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  height: 60px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.header-title {
  font-size: 20px;
  color: var(--text-color);
}

.sidebar-actions {
  display: flex;
  justify-content: center;
  gap: 10px; /* 按钮间距 */
  transition: flex-direction 0.3s ease;
}

.main-sidebar.is-collapsed .sidebar-actions {
  flex-direction: column;
  align-items: center; /* 水平居中 */
  gap: 15px; /* 垂直间距 */
}

/*
  修复收起时，菜单图标不居中的问题
  Element Plus 的 el-menu-item 内部有一个 div，需要让这个 div 居中
*/
.el-menu--collapse .el-menu-item > div {
  justify-content: center;
}

.action-btn {
  border: none;
  background: transparent;
  color: var(--text-color);
  padding: 8px; /* 增加点击区域 */
}

.action-btn:hover {
  background-color: var(--primary-color-light);
}

.main-content {
  background-color: var(--bg-color);
  padding: 0;
  overflow-y: auto;
  flex-grow: 1;
  height: 100%;
  box-sizing: border-box;
}

/* 覆盖 Element Plus 默认样式以适应主题 */
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

/* 确保整个应用没有默认边距 */
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* 为透明窗口添加背景 */
#app {
  background: var(--bg-color);
  min-height: 100vh;
}

/* 拖拽菜单项样式 */
.draggable-menu-item {
  cursor: move;
  user-select: none;
}

.draggable-menu-item:active {
  opacity: 0.7;
}

/* 独立窗口模式样式 */
.detached-content {
  padding: 20px;
  width: 100%;
  height: 100%;
}
</style>
