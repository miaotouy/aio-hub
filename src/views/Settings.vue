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

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, RefreshRight } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { useWindowSize } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import {
  getSettingsModule,
  getSettingsPage,
  resolveSettingsPageId,
  settingsGroups,
  settingsPages,
} from "../config/settings";
import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { useToolsStore } from "@/stores/tools";
import { useTheme } from "../composables/useTheme";
import { useLogConfig } from "../composables/useLogConfig";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { relaunch } from "@tauri-apps/plugin-process";

const errorHandler = createModuleErrorHandler("Settings");
const { isDark, applyTheme: applyThemeFromComposable } = useTheme();
const { applyLogConfig, watchLogConfig } = useLogConfig();
const toolsStore = useToolsStore();
const route = useRoute();
const router = useRouter();
const appSettingsStore = useAppSettingsStore();
const isLoading = ref(true);

const { width } = useWindowSize();
const isMobile = computed(() => width.value < 1000);

// 返回上一页
const handleGoBack = () => {
  router.back();
};

// 从路径提取工具ID（用于初始化工具可见性）
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-applier 转换为 regexApply
  return path
    .substring(1)
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 使用 store 中的设置
const settings = computed(() => appSettingsStore.settings);
const getModule = getSettingsModule;

// 两层导航只管理当前页面，页面内的模块仍按设置组件分组展示
const activePageId = ref("general");
const contentRef = ref<HTMLElement | null>(null);
const currentPage = computed(() => getSettingsPage(activePageId.value));
const activeGroup = computed(
  () =>
    settingsGroups.find((group) => group.id === currentPage.value.groupId) ||
    settingsGroups[0]
);
const activeSubPages = computed(() =>
  activeGroup.value.pageIds
    .map((pageId) => settingsPages.find((page) => page.id === pageId))
    .filter((page): page is NonNullable<typeof page> => Boolean(page))
);

const resolvePageFromQuery = (query: Record<string, any>) => {
  const section = typeof query.section === "string" ? query.section : undefined;
  return resolveSettingsPageId(section);
};

const selectPage = (pageId: string) => {
  const resolvedPageId = resolveSettingsPageId(pageId);
  activePageId.value = resolvedPageId;
  router.replace({
    path: "/settings",
    query: { ...route.query, section: resolvedPageId },
  });
};

const checkRouteAndSelectPage = (query: Record<string, any>) => {
  activePageId.value = resolvePageFromQuery(query);
};

// 重置设置
const handleReset = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要重置所有设置到默认值吗？此操作不可撤销。",
      "重置设置",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );

    await appSettingsStore.reset();
    applyThemeFromComposable(settings.value.theme || "auto");

    customMessage.success("设置已重置到默认值");
  } catch (error) {
    // 用户取消了操作
    if (error !== "cancel") {
      errorHandler.error(error, "重置应用设置失败");
    }
  }
};

// 在导入配置成功后重新加载设置
const onConfigImported = async (resultMessage: string) => {
  try {
    // 重新加载应用设置以反映变化
    await appSettingsStore.load();

    // 应用主题
    applyThemeFromComposable(settings.value.theme || "auto");

    customMessage.success(resultMessage);
  } catch (error) {
    errorHandler.error(error, "导入配置后刷新设置失败");
  }
};
const handleDisableTauriDragDropHandlerChange = async (newValue: boolean) => {
  const currentValue = settings.value.disableTauriDragDropHandler ?? false;
  if (newValue === currentValue) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      "切换拖放兼容模式需要重启应用后才能生效。确认后将立即重启应用。",
      "重启应用",
      {
        confirmButtonText: "确认重启",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );

    appSettingsStore.update({ disableTauriDragDropHandler: newValue });
    await appSettingsStore.saveNow();
    try {
      await relaunch();
    } catch (relaunchErr) {
      errorHandler.error(relaunchErr, "重启应用失败，请手动重启");
    }
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error, "重启应用失败");
    }
  }
};

// 监听暗黑模式变化，更新设置中的主题
watch(isDark, (newValue) => {
  // 如果主题是自动模式，不处理
  if (settings.value.theme === "auto") {
    return;
  }

  // 根据暗黑模式状态更新主题设置
  const newTheme = newValue ? "dark" : "light";
  if (settings.value.theme !== newTheme) {
    appSettingsStore.update({ theme: newTheme });
  }
});

// 监听托盘图标显示设置变化（实时生效）
watch(
  () => settings.value.showTrayIcon,
  async (newValue) => {
    try {
      // 同步到 Rust 后端，动态创建/移除托盘
      await invoke("set_show_tray_icon", { show: newValue });
      customMessage.success(newValue ? "托盘图标已显示" : "托盘图标已隐藏");
    } catch (error) {
      errorHandler.error(error, "更新托盘图标失败", { show: newValue });
    }
  }
);

// 监听最小化到托盘设置变化
watch(
  () => settings.value.minimizeToTray,
  async (newValue) => {
    try {
      // 同步到 Rust 后端
      await invoke("update_tray_setting", { enabled: newValue });
    } catch (error) {
      errorHandler.error(error, "更新托盘设置失败", { enabled: newValue });
    }
  }
);

// 监听设置变化，自动应用（Store 内部处理保存）
watch(
  () => settings.value,
  (newSettings) => {
    // 应用主题设置（使用统一的主题管理）
    if (newSettings.theme) {
      applyThemeFromComposable(newSettings.theme);
    }
    // 注意：主题色应用已移至 useRootInit.ts 的全局监听中统一处理
  },
  { deep: true }
);

onMounted(async () => {
  isLoading.value = true;
  try {
    // 确保 toolsVisible 包含所有工具（包括动态加载的插件）
    if (!appSettingsStore.settings.toolsVisible) {
      appSettingsStore.update({ toolsVisible: {} });
    }

    // 为每个工具设置默认可见状态（使用 toolsStore.orderedTools 包括插件）
    const updates: Record<string, boolean> = {
      ...(appSettingsStore.settings.toolsVisible || {}),
    };
    let hasUpdates = false;
    toolsStore.orderedTools.forEach((tool) => {
      const toolId = getToolIdFromPath(tool.path);
      if (updates[toolId] === undefined) {
        updates[toolId] = true;
        hasUpdates = true;
      }
    });
    if (hasUpdates) {
      appSettingsStore.update({ toolsVisible: updates });
    }

    // 应用日志配置
    applyLogConfig(appSettingsStore.settings);

    // 监听日志配置变化
    watchLogConfig(appSettingsStore.settings);

    // 应用主题（使用统一的主题管理）
    applyThemeFromComposable(appSettingsStore.settings.theme || "auto");

    // 同步托盘设置到后端
    try {
      await invoke("update_tray_setting", {
        enabled: appSettingsStore.settings.minimizeToTray || false,
      });
    } catch (error) {
      // 初始化时静默处理，只记录日志
      errorHandler.handle(error, {
        userMessage: "初始化系统托盘设置失败",
        context: { enabled: appSettingsStore.settings.minimizeToTray || false },
        showToUser: false,
      });
    }

    // 根据路由恢复当前二级设置页
    checkRouteAndSelectPage(route.query);
  } finally {
    await nextTick();
    isLoading.value = false;
  }
});

// 外部链接、分离窗口和浏览器前进后退都通过 section 参数切换页面
watch(
  () => route.query.section,
  (section) => {
    if (!isLoading.value) {
      checkRouteAndSelectPage({ section });
    }
  }
);

// 清理设置页状态
onUnmounted(() => {
  contentRef.value = null;
});
</script>

<template>
  <div class="settings-page">
    <div class="settings-wrapper">
      <template v-if="isLoading">
        <div class="settings-loading">
          <el-skeleton animated />
          <el-skeleton :rows="15" animated />
        </div>
      </template>

      <template v-else>
        <div class="settings-container" :class="{ 'is-mobile': isMobile }">
          <header v-if="isMobile" class="mobile-header">
            <div class="header-top">
              <button class="mobile-back" @click="handleGoBack">
                <el-icon><ArrowLeft /></el-icon>
              </button>
              <div class="mobile-heading">
                <h1>设置</h1>
                <span>{{ currentPage.title }}</span>
              </div>
              <el-tooltip content="重置所有设置" placement="bottom">
                <button class="mobile-reset" @click="handleReset">
                  <el-icon><RefreshRight /></el-icon>
                </button>
              </el-tooltip>
            </div>

            <nav class="mobile-group-nav" aria-label="设置分类">
              <button
                v-for="group in settingsGroups"
                :key="group.id"
                class="mobile-group-item"
                :class="{ active: activeGroup.id === group.id }"
                @click="selectPage(group.pageIds[0])"
              >
                {{ group.title }}
              </button>
            </nav>
            <nav class="mobile-page-nav" aria-label="设置页面">
              <button
                v-for="page in activeSubPages"
                :key="page.id"
                class="mobile-page-item"
                :class="{ active: activePageId === page.id }"
                @click="selectPage(page.id)"
              >
                {{ page.title }}
              </button>
            </nav>
          </header>

          <aside v-else class="settings-sidebar">
            <div class="sidebar-header">
              <button class="back-button" @click="handleGoBack">
                <el-icon><ArrowLeft /></el-icon>
                <span>返回</span>
              </button>
              <h1 class="sidebar-title">设置</h1>
            </div>

            <nav class="settings-nav" aria-label="设置分类">
              <div
                v-for="group in settingsGroups"
                :key="group.id"
                class="nav-group"
              >
                <button
                  class="nav-group-title"
                  :class="{ active: activeGroup.id === group.id }"
                  @click="selectPage(group.pageIds[0])"
                >
                  {{ group.title }}
                </button>
                <div class="nav-submenu">
                  <button
                    v-for="pageId in group.pageIds"
                    :key="pageId"
                    class="nav-submenu-item"
                    :class="{ active: activePageId === pageId }"
                    @click="selectPage(pageId)"
                  >
                    {{ getSettingsPage(pageId).title }}
                  </button>
                </div>
              </div>
            </nav>

            <div class="sidebar-footer">
              <el-button
                @click="handleReset"
                type="danger"
                plain
                class="reset-btn"
              >
                重置所有设置
              </el-button>
            </div>
          </aside>

          <main
            class="settings-main"
            :class="{ 'is-workspace': currentPage.layout === 'workspace' }"
            ref="contentRef"
          >
            <div class="settings-page-header">
              <div>
                <h2 class="settings-breadcrumb">
                  {{ activeGroup.title }}<span>/</span>{{ currentPage.title }}
                </h2>
                <p>{{ currentPage.description }}</p>
              </div>
            </div>

            <template v-for="moduleId in currentPage.moduleIds" :key="moduleId">
              <section
                v-if="getModule(moduleId)"
                :id="moduleId"
                class="settings-section component-section"
              >
                <h3
                  v-if="currentPage.layout !== 'workspace'"
                  class="section-title"
                >
                  {{ getModule(moduleId)?.title }}
                </h3>

                <!-- 通用设置 -->
                <component
                  v-if="moduleId === 'general'"
                  :is="getModule(moduleId)?.component"
                  :show-tray-icon="settings.showTrayIcon"
                  :minimize-to-tray="settings.minimizeToTray"
                  :theme="settings.theme"
                  :auto-adjust-window-position="
                    settings.autoAdjustWindowPosition
                  "
                  :disable-tauri-drag-drop-handler="
                    settings.disableTauriDragDropHandler ?? false
                  "
                  :sidebar-mode="settings.sidebarMode"
                  :proxy="settings.proxy"
                  :timezone="settings.timezone"
                  :download="settings.download"
                  @update:show-tray-icon="
                    (val: any) => appSettingsStore.update({ showTrayIcon: val })
                  "
                  @update:minimize-to-tray="
                    (val: any) =>
                      appSettingsStore.update({ minimizeToTray: val })
                  "
                  @update:theme="
                    (val: any) => appSettingsStore.update({ theme: val })
                  "
                  @update:auto-adjust-window-position="
                    (val: any) =>
                      appSettingsStore.update({ autoAdjustWindowPosition: val })
                  "
                  @update:disable-tauri-drag-drop-handler="
                    handleDisableTauriDragDropHandlerChange
                  "
                  @update:sidebar-mode="
                    (val: any) => appSettingsStore.update({ sidebarMode: val })
                  "
                  @update:proxy="
                    (val: any) => appSettingsStore.update({ proxy: val })
                  "
                  @update:timezone="
                    (val: any) => appSettingsStore.update({ timezone: val })
                  "
                  @update:download="
                    (val: any) => appSettingsStore.update({ download: val })
                  "
                  @config-imported="onConfigImported"
                />

                <!-- 启动项管理 -->
                <component
                  v-else-if="moduleId === 'startup'"
                  :is="getModule(moduleId)?.component"
                  :startup-tasks="settings.startupTasks"
                  @update:startup-tasks="
                    (val: any) => appSettingsStore.update({ startupTasks: val })
                  "
                />

                <!-- 主题色配置 -->
                <component
                  v-else-if="moduleId === 'theme-colors'"
                  :is="getModule(moduleId)?.component"
                  :theme-color="settings.themeColor"
                  :success-color="settings.successColor"
                  :warning-color="settings.warningColor"
                  :danger-color="settings.dangerColor"
                  :info-color="settings.infoColor"
                  @update:theme-color="
                    (val: any) => appSettingsStore.update({ themeColor: val })
                  "
                  @update:success-color="
                    (val: any) => appSettingsStore.update({ successColor: val })
                  "
                  @update:warning-color="
                    (val: any) => appSettingsStore.update({ warningColor: val })
                  "
                  @update:danger-color="
                    (val: any) => appSettingsStore.update({ dangerColor: val })
                  "
                  @update:info-color="
                    (val: any) => appSettingsStore.update({ infoColor: val })
                  "
                />

                <!-- 日志配置 -->
                <component
                  v-else-if="moduleId === 'log-settings'"
                  :is="getModule(moduleId)?.component"
                  :log-level="settings.logLevel"
                  :log-to-file="settings.logToFile"
                  :log-to-console="settings.logToConsole"
                  :log-buffer-size="settings.logBufferSize"
                  :max-file-size="settings.maxFileSize"
                  @update:log-level="
                    (val: any) => appSettingsStore.update({ logLevel: val })
                  "
                  @update:log-to-file="
                    (val: any) => appSettingsStore.update({ logToFile: val })
                  "
                  @update:log-to-console="
                    (val: any) => appSettingsStore.update({ logToConsole: val })
                  "
                  @update:log-buffer-size="
                    (val: any) =>
                      appSettingsStore.update({ logBufferSize: val })
                  "
                  @update:max-file-size="
                    (val: any) => appSettingsStore.update({ maxFileSize: val })
                  "
                />

                <!-- 工具模块配置 -->
                <component
                  v-else-if="moduleId === 'tools'"
                  :is="getModule(moduleId)?.component"
                  :tools-visible="settings.toolsVisible"
                  @update:tools-visible="
                    (val: any) => appSettingsStore.update({ toolsVisible: val })
                  "
                />

                <!-- 其他设置组件 -->
                <component v-else :is="getModule(moduleId)?.component" />
              </section>
            </template>
          </main>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow: hidden;
  background: var(--bg-color);
  box-sizing: border-box;
}

.settings-wrapper,
.settings-container {
  height: 100%;
  box-sizing: border-box;
}

.settings-container {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 20px;
}

.settings-loading {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 20px;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.settings-loading :deep(.el-skeleton) {
  min-height: 100%;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 20px 14px;
  box-sizing: border-box;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
}

.sidebar-header {
  margin-bottom: 18px;
}

.sidebar-title {
  margin: 12px 0 0 12px;
  color: var(--text-color);
  font-size: 24px;
  font-weight: 700;
}

.back-button,
.nav-group-title,
.nav-submenu-item,
.mobile-group-item,
.mobile-page-item {
  border: 0;
  cursor: pointer;
  color: var(--text-color);
  background: transparent;
  font: inherit;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-color-secondary);
  font-size: 14px;
  text-align: left;
}

.back-button:hover,
.nav-submenu-item:hover,
.mobile-page-item:hover {
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.06);
}

.settings-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.nav-group + .nav-group {
  margin-top: 16px;
}

.nav-group-title {
  width: 100%;
  padding: 6px 12px;
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
}

.nav-group-title.active {
  color: var(--primary-color);
}

.nav-submenu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 3px;
}

.nav-submenu-item {
  position: relative;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px 8px 20px;
  border-radius: 8px;
  color: var(--text-color);
  font-size: 14px;
  text-align: left;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.nav-submenu-item.active {
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  font-weight: 600;
}

.nav-submenu-item.active::before {
  position: absolute;
  top: 50%;
  left: 8px;
  width: 3px;
  height: 18px;
  border-radius: 0 2px 2px 0;
  background: var(--primary-color);
  content: "";
  transform: translateY(-50%);
}

.sidebar-footer {
  margin-top: 18px;
  padding-top: 18px;
  border-top: var(--border-width) solid var(--border-color);
}

.reset-btn {
  width: 100%;
}

.settings-main {
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 4px 20px 0;
  box-sizing: border-box;
}

.settings-main.is-workspace {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.is-workspace .settings-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  margin-bottom: 0;
  padding: 16px;
  overflow: hidden;
  container: settings-content / inline-size;
}

.is-workspace .settings-section > :deep(*) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.settings-page-header {
  flex-shrink: 0;
  padding: 12px 8px 20px;
}

.settings-breadcrumb {
  display: flex;
  gap: 8px;
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
}

.settings-page-header p {
  margin: 8px 0 0;
  color: var(--text-color-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.settings-section {
  margin-bottom: 20px;
  padding: 24px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
}

.section-title {
  margin: 0 0 18px;
  padding-bottom: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--text-color);
  font-size: 18px;
  font-weight: 600;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 8px 12px 0;
  background: var(--bg-color);
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
}

.mobile-back,
.mobile-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  color: var(--text-color-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 20px;
}

.mobile-back:active,
.mobile-reset:active {
  background: rgba(var(--primary-color-rgb), 0.1);
}

.mobile-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.mobile-heading h1 {
  margin: 0;
  color: var(--text-color);
  font-size: 18px;
  font-weight: 600;
}

.mobile-heading span {
  overflow: hidden;
  max-width: 220px;
  margin-top: 2px;
  color: var(--text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-group-nav,
.mobile-page-nav {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.mobile-group-nav::-webkit-scrollbar,
.mobile-page-nav::-webkit-scrollbar {
  display: none;
}

.mobile-group-nav {
  padding: 4px 0 2px;
}

.mobile-page-nav {
  padding: 6px 0 10px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.mobile-group-item,
.mobile-page-item {
  flex: 0 0 auto;
  white-space: nowrap;
}

.mobile-group-item {
  padding: 7px 10px;
  border-radius: 7px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.mobile-group-item.active {
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  font-weight: 600;
}

.mobile-page-item {
  padding: 6px 4px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.mobile-page-item.active {
  color: var(--primary-color);
  font-weight: 600;
}

.mobile-page-item.active::after {
  display: block;
  height: 2px;
  margin-top: 5px;
  border-radius: 2px;
  background: var(--primary-color);
  content: "";
}

.settings-main::-webkit-scrollbar,
.settings-nav::-webkit-scrollbar {
  width: 6px;
}

.settings-main::-webkit-scrollbar-thumb,
.settings-nav::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--border-color);
}

@media (max-width: 999px) {
  .settings-container {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .settings-main {
    flex: 1;
    height: auto;
    padding: 0 12px 20px;
  }

  .mobile-header {
    flex-shrink: 0;
  }

  .is-workspace .settings-section {
    padding: 12px;
  }

  .settings-page-header {
    padding: 18px 4px 14px;
  }

  .is-workspace .settings-page-header {
    padding: 12px 4px;
  }

  .is-workspace .settings-breadcrumb {
    display: none;
  }

  .is-workspace .settings-page-header p {
    margin: 0;
  }

  .settings-section {
    margin-bottom: 16px;
    padding: 16px;
  }

  .section-title {
    font-size: 17px;
  }
}

:root {
  --primary-color-rgb: 64, 158, 255;
}
</style>
