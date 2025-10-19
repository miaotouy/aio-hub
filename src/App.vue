<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useWindowSyncBus } from "./composables/useWindowSyncBus";
import { useDetachedManager } from "./composables/useDetachedManager";
import {
  loadAppSettingsAsync,
  updateAppSettingsAsync,
  type AppSettings,
} from "./utils/appSettings";
import { createModuleLogger } from "./utils/logger";
import TitleBar from "./components/TitleBar.vue";
import MainSidebar from "./components/MainSidebar.vue";

const logger = createModuleLogger("App");

const route = useRoute();
const { isDetached, initialize } = useDetachedManager();
const isCollapsed = ref(true); // 控制侧边栏收起状态（默认收起，避免加载时闪烁）

// 特殊路由列表 - 这些路由不需要显示标题栏和侧边栏
const specialRoutes = [
  "/detached-component-loader",
  "/detached-component",
  "/drag-indicator",
  "/component-container",
  "/component-standby",
];

// 判断当前是否为特殊路由
const isSpecialRoute = computed(() => {
  return specialRoutes.includes(route.path);
});

// 应用设置
const appSettings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: "auto",
  toolsVisible: {},
});

// 监听 isCollapsed 变化并保存
watch(isCollapsed, (newVal) => {
  updateAppSettingsAsync({ sidebarCollapsed: newVal });
});

// 缓存工具可见性配置
const cacheToolsVisible = (toolsVisible: Record<string, boolean> | undefined) => {
  if (toolsVisible) {
    try {
      localStorage.setItem("app-tools-visible", JSON.stringify(toolsVisible));
    } catch (error) {
      logger.warn("缓存工具可见性失败", { error });
    }
  }
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
  cacheToolsVisible(settings.toolsVisible);

  // 应用主题色
  if (settings.themeColor) {
    applyThemeColor(settings.themeColor);
  }
};

// 存储事件处理函数的引用，用于清理
let handleSettingsChange: ((event: Event) => void) | null = null;

onMounted(async () => {
  // 优先从缓存加载工具可见性，防止闪烁
  try {
    const cachedToolsVisible = localStorage.getItem("app-tools-visible");
    if (cachedToolsVisible) {
      appSettings.value.toolsVisible = JSON.parse(cachedToolsVisible);
    }
  } catch (error) {
    logger.warn("加载工具可见性缓存失败", { error });
  }

  // 初始化跨窗口通信总线
  const { initializeSyncBus } = useWindowSyncBus();
  initializeSyncBus();

  // 初始化统一的分离窗口管理器
  await initialize();

  // 初始加载设置
  await loadSettings();

  // 监听设置变化事件（来自设置页面）- 这是主要的同步机制
  handleSettingsChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;
    if (customEvent.detail) {
      appSettings.value = customEvent.detail;
      isCollapsed.value = customEvent.detail.sidebarCollapsed;

      // 主题设置由 useTheme 模块处理
      cacheToolsVisible(customEvent.detail.toolsVisible);

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
</script>

<template>
  <!-- 自定义标题栏 - 仅在非特殊路由显示 -->
  <TitleBar v-if="!isSpecialRoute" />

  <!-- 主布局容器，需要添加padding-top来避让标题栏 -->
  <el-container :class="['common-layout', { 'no-titlebar': isSpecialRoute }]">
    <!-- 侧边栏 - 仅在非特殊路由显示 -->
    <MainSidebar
      v-if="!isSpecialRoute"
      v-model:collapsed="isCollapsed"
      :tools-visible="appSettings.toolsVisible || {}"
      :is-detached="isDetached"
    />

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

/* 特殊路由（无标题栏）样式 */
.common-layout.no-titlebar {
  height: 100vh; /* 无标题栏时占满全屏 */
  margin-top: 0; /* 移除顶部边距 */
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

.main-content {
  background-color: var(--bg-color);
  padding: 0;
  overflow-y: auto;
  flex-grow: 1;
  height: 100%;
  box-sizing: border-box;
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

/* 独立窗口模式样式 */
.detached-content {
  padding: 20px;
  width: 100%;
  height: 100%;
}
</style>
