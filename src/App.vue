<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ElMessageBox } from "element-plus";
import { useDark } from "@vueuse/core";
import { useWindowSyncBus } from "./composables/useWindowSyncBus";
import { useDetachedManager } from "./composables/useDetachedManager";
import {
  loadAppSettingsAsync,
  updateAppSettingsAsync,
  type AppSettings,
} from "./utils/appSettings";
import { createModuleLogger } from "./utils/logger";
import { applyThemeColors } from "./utils/themeColors";
import TitleBar from "./components/TitleBar.vue";
import MainSidebar from "./components/MainSidebar.vue";
import SyncServiceProvider from "./components/SyncServiceProvider.vue";
import ImageViewer from "./components/common/ImageViewer.vue";
import ModelSelectDialog from "./components/common/ModelSelectDialog.vue";
import { useImageViewer } from "./composables/useImageViewer";

const logger = createModuleLogger("App");

const route = useRoute();
const router = useRouter();
const { isDetached, initialize } = useDetachedManager();
const isCollapsed = ref(true); // 控制侧边栏收起状态（默认收起，避免加载时闪烁）
const isDark = useDark(); // 监听主题模式

// 全局图片查看器
const imageViewer = useImageViewer();

// 判断当前是否为特殊路由（不需要显示侧边栏）
const isSpecialRoute = computed(() => {
  const path = route.path;
  // 使用路径匹配判断是否为分离窗口或特殊路由
  return (
    path.startsWith("/detached-window/") ||
    path.startsWith("/detached-component/")
  );
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

// 监听主题模式切换，重新应用颜色变体
watch(isDark, () => {
  logger.info("主题模式切换，重新应用颜色");
  if (appSettings.value.themeColor) {
    applyThemeColors({
      primary: appSettings.value.themeColor,
      success: appSettings.value.successColor,
      warning: appSettings.value.warningColor,
      danger: appSettings.value.dangerColor,
      info: appSettings.value.infoColor,
    });
  }
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


// 将驼峰命名转换为短横线路径
const camelToKebab = (str: string): string => {
return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
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
  applyThemeColors({ primary: settings.themeColor });
}
};

// 存储事件处理函数的引用，用于清理
let handleSettingsChange: ((event: Event) => void) | null = null;
let unlisten: (() => void) | null = null;
let unlistenDetached: (() => void) | null = null;
let unlistenCloseConfirmation: (() => void) | null = null;

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
        applyThemeColors({ primary: customEvent.detail.themeColor });
      }
    }
  };

  window.addEventListener("app-settings-changed", handleSettingsChange);

  // 监听来自分离窗口的导航请求
  unlisten = await listen<{ sectionId: string }>("navigate-to-settings", (event) => {
    const { sectionId } = event.payload;
    logger.info("收到来自分离窗口的导航请求", { sectionId });
    
    // 导航到设置页面
    router.push({ path: "/settings", query: { section: sectionId } });
  });

  // 监听窗口分离事件，自动导航回主页
  unlistenDetached = await listen<{ label: string; id: string; type: string }>("window-detached", (event) => {
    const { id, type } = event.payload;
    
    // 只处理工具类型的分离
    if (type === 'tool') {
      // 将工具ID（驼峰命名）转换为路由路径（短横线命名）
      const toolPath = '/' + camelToKebab(id);
      
      logger.info("工具已分离，检查是否需要导航", {
        toolId: id,
        toolPath,
        currentPath: route.path
      });
      
      // 如果当前路由正是被分离的工具页面，自动导航回主页
      if (route.path === toolPath) {
        logger.info("当前页面已分离，导航回主页", { from: toolPath });
        router.push('/');
      }
    }
  });

  // 监听关闭确认请求
  unlistenCloseConfirmation = await listen("request-close-confirmation", async () => {
    try {
      await ElMessageBox.confirm(
        '确定要退出程序吗？',
        '退出确认',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }
      );
      // 用户确认退出
      await invoke("exit_app");
    } catch {
      // 用户取消退出，不做任何操作
      logger.info("用户取消退出操作");
    }
  });
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
  
  // 清理 Tauri 事件监听器
  if (unlisten) {
    unlisten();
  }
  if (unlistenDetached) {
    unlistenDetached();
  }
  if (unlistenCloseConfirmation) {
    unlistenCloseConfirmation();
  }
});
</script>

<template>
  <!-- 全局同步服务提供者 - 无界面，仅在主窗口启动服务 -->
  <SyncServiceProvider />
  
  <!-- 全局图片查看器 -->
  <ImageViewer
    v-if="imageViewer.state.value.visible"
    :images="imageViewer.state.value.images"
    :initial-index="imageViewer.state.value.currentIndex"
    :options="imageViewer.state.value.options"
    @close="imageViewer.hide()"
    @change="(index) => imageViewer.state.value.currentIndex = index"
  />
  
  <!-- 全局模型选择弹窗 -->
  <ModelSelectDialog />
  
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
