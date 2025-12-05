<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ElMessageBox } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { useDark } from "@vueuse/core";
import { useDetachedManager } from "./composables/useDetachedManager";
import {
  loadAppSettingsAsync,
  updateAppSettingsAsync,
  type AppSettings,
} from "./utils/appSettings";
import { createModuleLogger, logger as globalLogger, LogLevel } from "./utils/logger";
import { createModuleErrorHandler } from "./utils/errorHandler";
import { applyThemeColors } from "./utils/themeColors";
import TitleBar from "./components/TitleBar.vue";
import MainSidebar from "./components/MainSidebar.vue";
import GlobalProviders from "./components/GlobalProviders.vue";
import { useTheme } from "@/composables/useTheme";
import { initThemeAppearance, cleanupThemeAppearance } from "./composables/useThemeAppearance";
import { useUserProfileStore } from "@/tools/llm-chat/userProfileStore";

const logger = createModuleLogger("App");
const errorHandler = createModuleErrorHandler("App");
const isLoading = ref(true); // 控制骨架屏显示

// 初始化主题，必须在其他操作之前
useTheme();

const route = useRoute();
const router = useRouter();
const { isDetached, initialize } = useDetachedManager();
const userProfileStore = useUserProfileStore();
const isCollapsed = ref(true); // 控制侧边栏收起状态（默认收起，避免加载时闪烁）
const isDark = useDark(); // 监听主题模式

// 判断当前是否为特殊路由（不需要显示侧边栏）
const isSpecialRoute = computed(() => {
  const path = route.path;
  // 使用路径匹配判断是否为分离窗口或特殊路由
  return path.startsWith("/detached-window/") || path.startsWith("/detached-component/");
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
  return str
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
};

// 应用日志配置到 logger 实例
const applyLogConfig = (settings: AppSettings) => {
  // 应用日志级别
  if (settings.logLevel) {
    const levelMap: Record<string, LogLevel> = {
      DEBUG: LogLevel.DEBUG,
      INFO: LogLevel.INFO,
      WARN: LogLevel.WARN,
      ERROR: LogLevel.ERROR,
    };
    globalLogger.setLevel(levelMap[settings.logLevel] ?? LogLevel.INFO);
  }

  // 应用日志输出配置
  globalLogger.setLogToFile(settings.logToFile ?? true);
  globalLogger.setLogToConsole(settings.logToConsole ?? true);

  // 应用日志缓冲区大小
  if (settings.logBufferSize) {
    globalLogger.setLogBufferSize(settings.logBufferSize);
  }
};

// 监听设置变化（用于响应设置页面的更改）
const loadSettings = async () => {
  const settings = await loadAppSettingsAsync();
  appSettings.value = settings;
  isCollapsed.value = settings.sidebarCollapsed;

  // 应用日志配置
  applyLogConfig(settings);

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
  isLoading.value = true;
  try {
    // 优先从缓存加载工具可见性，防止闪烁
    try {
      const cachedToolsVisible = localStorage.getItem("app-tools-visible");
      if (cachedToolsVisible) {
        appSettings.value.toolsVisible = JSON.parse(cachedToolsVisible);
      }
    } catch (error) {
      logger.warn("加载工具可见性缓存失败", { error });
    }

    // 初始化统一的分离窗口管理器
    await initialize();

    // 初始加载设置
    await loadSettings();

    // 初始化用户档案
    await userProfileStore.loadProfiles();

    // 初始化主题外观
    await initThemeAppearance();
  } catch (error) {
    errorHandler.error(error, "App 初始化失败");
  } finally {
    await nextTick();
    isLoading.value = false;
  }

  // 监听设置变化事件（来自设置页面）- 这是主要的同步机制
  handleSettingsChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;
    if (customEvent.detail) {
      appSettings.value = customEvent.detail;
      isCollapsed.value = customEvent.detail.sidebarCollapsed;

      // 应用日志配置
      applyLogConfig(customEvent.detail);

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
  unlistenDetached = await listen<{ label: string; id: string; type: string }>(
    "window-detached",
    (event) => {
      const { id, type } = event.payload;

      // 只处理工具类型的分离
      if (type === "tool") {
        // 将工具ID（驼峰命名）转换为路由路径（短横线命名）
        const toolPath = "/" + camelToKebab(id);

        logger.info("工具已分离，检查是否需要导航", {
          toolId: id,
          toolPath,
          currentPath: route.path,
        });

        // 如果当前路由正是被分离的工具页面，自动导航回主页
        if (route.path === toolPath) {
          logger.info("当前页面已分离，导航回主页", { from: toolPath });
          router.push("/");
        }
      }
    }
  );

  // 监听关闭确认请求
  unlistenCloseConfirmation = await listen("request-close-confirmation", async () => {
    try {
      await ElMessageBox.confirm("确定要退出程序吗？", "退出确认", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      });
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
  // 清理主题外观资源
  cleanupThemeAppearance();

  // 清理事件监听器
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
  <GlobalProviders>
    <!-- 自定义标题栏 - 仅在非特殊路由显示 -->
    <TitleBar v-if="!isSpecialRoute" />

    <!-- 主布局容器，需要添加padding-top来避让标题栏 -->
    <el-container :class="['common-layout', { 'no-titlebar': isSpecialRoute }]">
      <!-- 骨架屏 -->
      <template v-if="isLoading">
        <div class="app-skeleton">
          <!-- Sidebar Skeleton -->
          <el-skeleton
            v-if="!isCollapsed && !isSpecialRoute"
            class="sidebar-skeleton"
            :style="{ width: isCollapsed ? '64px' : '200px' }"
            animated
          >
            <template #template>
              <el-skeleton-item variant="rect" style="width: 100%; height: 100%" />
            </template>
          </el-skeleton>
          <!-- Main Content Skeleton -->
          <div class="main-content-skeleton">
            <el-skeleton animated>
              <template #template>
                <el-skeleton-item variant="rect" style="width: 100%; height: 100%" />
              </template>
            </el-skeleton>
          </div>
        </div>
      </template>

      <!-- 实际内容 -->
      <template v-else>
        <!-- 侧边栏 - 仅在非特殊路由显示 -->
        <MainSidebar
          v-if="!isSpecialRoute"
          v-model:collapsed="isCollapsed"
          :tools-visible="appSettings.toolsVisible || {}"
          :is-detached="isDetached"
        />

        <el-container>
          <el-main class="main-content">
            <router-view v-slot="{ Component, route }">
              <Suspense>
                <template #default>
                  <keep-alive :exclude="['Settings']">
                    <component :is="Component" :key="route.path" />
                  </keep-alive>
                </template>
                <template #fallback>
                  <div class="loading-container">
                    <el-icon class="is-loading" :size="32">
                      <Loading />
                    </el-icon>
                    <p>加载中...</p>
                  </div>
                </template>
              </Suspense>
            </router-view>
          </el-main>
        </el-container>
      </template>
    </el-container>
  </GlobalProviders>
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
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden; /* 强制禁止根元素滚动，防止 scrollIntoView 等行为导致应用整体偏移 */
}

/* 为透明窗口添加背景 */
#app {
  position: relative;
  z-index: 0;
  background: var(--bg-color);
  min-height: 100vh;
}

/* 独立窗口模式样式 */
.detached-content {
  padding: 20px;
  width: 100%;
  height: 100%;
}

/* 组件加载状态样式 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--text-color);
}

.loading-container p {
  margin: 0;
  font-size: 14px;
  color: var(--text-color-secondary);
}

/* 骨架屏样式 */
.app-skeleton {
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar-skeleton {
  flex-shrink: 0;
  padding: 0;
  transition: width 0.3s ease;
}

.main-content-skeleton {
  flex-grow: 1;
  padding: 0;
}
</style>
