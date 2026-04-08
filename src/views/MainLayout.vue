<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ElMessageBox } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { useDark } from "@vueuse/core";
import { createModuleLogger } from "@/utils/logger";
import TitleBar from "@/components/TitleBar.vue";
import MainSidebar from "@/components/MainSidebar.vue";
import LlmDeepLinkConfirmDialog from "./Settings/llm-service/components/LlmDeepLinkConfirmDialog.vue";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useToolsStore } from "@/stores/tools";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { applyThemeColors } from "@/utils/themeColors";

const logger = createModuleLogger("MainLayout");
const route = useRoute();
const router = useRouter();
const detachedManager = useDetachedManager();
const toolsStore = useToolsStore();
const appSettingsStore = useAppSettingsStore();
const isDark = useDark();

const isCollapsed = ref(appSettingsStore.settings.sidebarCollapsed);

// 监听主题模式切换，重新应用颜色变体
watch(isDark, () => {
  logger.info("主题模式切换，重新应用颜色");
  if (appSettingsStore.settings.themeColor) {
    applyThemeColors({
      primary: appSettingsStore.settings.themeColor,
      success: appSettingsStore.settings.successColor,
      warning: appSettingsStore.settings.warningColor,
      danger: appSettingsStore.settings.dangerColor,
      info: appSettingsStore.settings.infoColor,
    });
  }
});

// 监听 isCollapsed 变化并保存
watch(isCollapsed, (newVal) => {
  if (appSettingsStore.isLoaded && appSettingsStore.settings.sidebarCollapsed !== newVal) {
    appSettingsStore.update({ sidebarCollapsed: newVal });
  }
});

// 将驼峰命名转换为短横线路径
const camelToKebab = (str: string): string => {
  return str
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
};

// 从路径提取工具ID（短横线转驼峰）
const getToolIdFromPath = (path: string): string => {
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 存储事件处理函数的引用，用于清理
let unlisten: (() => void) | null = null;
let unlistenDetached: (() => void) | null = null;
let unlistenAttached: (() => void) | null = null;
let unlistenCloseConfirmation: (() => void) | null = null;

onMounted(async () => {
  // 监听来自分离窗口的导航请求
  unlisten = await listen<{ sectionId: string }>("navigate-to-settings", (event) => {
    const { sectionId } = event.payload;
    logger.info("收到来自分离窗口的导航请求", { sectionId });
    router.push({ path: "/settings", query: { section: sectionId } });
  });

  // 监听窗口分离事件，自动导航回主页
  unlistenDetached = await listen<{ label: string; id: string; type: string }>("window-detached", (event) => {
    const { id, type } = event.payload;
    if (type === "tool") {
      const toolPath = "/" + camelToKebab(id);
      if (route.path === toolPath) {
        logger.info("当前页面已分离，导航回主页", { from: toolPath });
        router.push("/");
      }
    }
  });

  // 监听窗口重新附着事件，自动恢复工具标签
  unlistenAttached = await listen<{ label: string; id: string; type: string }>("window-attached", (event) => {
    const { id, type } = event.payload;
    if (type === "tool") {
      const toolPath = "/" + camelToKebab(id);
      logger.info("工具已重新附着，恢复标签页", { toolId: id, toolPath });
      toolsStore.openTool(toolPath);
    }
  });

  // 监听关闭确认请求
  unlistenCloseConfirmation = await listen("request-close-confirmation", async () => {
    try {
      await ElMessageBox.confirm("确定要退出程序吗？", "退出确认", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      });
      await invoke("exit_app");
    } catch {
      logger.info("用户取消退出操作");
    }
  });
});

// 监听路由变化，自动打开工具标签
watch(
  () => route.path,
  (newPath, oldPath) => {
    if (newPath === oldPath) return;
    if (newPath.startsWith("/") && newPath !== "/" && newPath !== "/settings" && newPath !== "/extensions") {
      if (toolsStore.openedToolPaths.includes(newPath)) return;
      const toolId = getToolIdFromPath(newPath);
      if (!detachedManager.isDetached(toolId)) {
        toolsStore.openTool(newPath);
      }
    }
  },
);

onUnmounted(() => {
  if (unlisten) unlisten();
  if (unlistenDetached) unlistenDetached();
  if (unlistenAttached) unlistenAttached();
  if (unlistenCloseConfirmation) unlistenCloseConfirmation();
});
</script>

<template>
  <div class="main-layout-wrapper">
    <!-- 自定义标题栏 -->
    <TitleBar />

    <!-- Deep Link 确认弹窗 -->
    <LlmDeepLinkConfirmDialog />

    <!-- 主布局容器 -->
    <el-container class="common-layout">
      <!-- 侧边栏 -->
      <MainSidebar
        v-if="!appSettingsStore.sidebarMode || appSettingsStore.sidebarMode === 'sidebar'"
        v-model:collapsed="isCollapsed"
        :tools-visible="appSettingsStore.toolsVisible || {}"
        :is-detached="detachedManager.isDetached"
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
    </el-container>
  </div>
</template>

<style scoped>
.main-layout-wrapper {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.common-layout {
  height: calc(100vh - var(--titlebar-height));
  width: 100vw;
  overflow: hidden;
  margin-top: var(--titlebar-height);
}

.main-content {
  background-color: var(--bg-color);
  overflow-y: auto;
  flex-grow: 1;
  height: 100%;
  box-sizing: border-box;
}

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
</style>
