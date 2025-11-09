<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import {
  loadAppSettingsAsync,
  saveAppSettingsDebounced,
  resetAppSettingsAsync,
  type AppSettings,
} from "@utils/appSettings";
import { applyThemeColors } from "@utils/themeColors";
import { settingsModules } from "../config/settings";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@utils/logger";
import { useToolsStore } from "@/stores/tools";
import { useTheme } from "../composables/useTheme";
import { useLogConfig } from "../composables/useLogConfig";

const logger = createModuleLogger("Settings");
const { isDark, applyTheme: applyThemeFromComposable } = useTheme();
const { applyLogConfig, watchLogConfig } = useLogConfig();
const toolsStore = useToolsStore();
const route = useRoute();
const router = useRouter();
const isLoading = ref(true);

// 返回上一页
const handleGoBack = () => {
  router.back();
};

// 从路径提取工具ID（用于初始化工具可见性）
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 应用设置
const settings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: "auto",
  showTrayIcon: true,
  minimizeToTray: true,
  themeColor: "#409eff",
  successColor: "#67c23a",
  warningColor: "#e6a23c",
  dangerColor: "#f56c6c",
  infoColor: "#909399",
  toolsVisible: {},
  toolsOrder: [],
  // 日志配置
  logLevel: "INFO",
  logToFile: true,
  logToConsole: true,
  logBufferSize: 1000,
  version: "1.0.0",
});

// 左侧导航状态与滚动容器
const activeSection = ref("general");
const contentRef = ref<HTMLElement | null>(null);
const isScrollingProgrammatically = ref(false);

// 节流函数
const throttle = (func: Function, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  return (...args: any[]) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(
        () => {
          func(...args);
          lastExecTime = Date.now();
        },
        delay - (currentTime - lastExecTime)
      );
    }
  };
};

// 处理滚动事件，反向匹配导航
const handleScroll = throttle(() => {
  if (isScrollingProgrammatically.value) return;

  const container = contentRef.value;
  if (!container) return;

  const sections = settingsModules.map((m) => m.id);
  const containerHeight = container.clientHeight;

  // 查找当前在视口中最靠近顶部的 section
  let currentSection = sections[0];

  for (const sectionId of sections) {
    const element = container.querySelector<HTMLElement>(`#${sectionId}`);
    if (element) {
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;

      // 如果 section 顶部在视口上半部分，认为它是当前 section
      if (relativeTop <= containerHeight * 0.3) {
        currentSection = sectionId;
      }
    }
  }

  // 更新激活状态
  if (activeSection.value !== currentSection) {
    activeSection.value = currentSection;
  }
}, 200); // 200ms 节流延迟

const scrollToSection = (id: string) => {
  isScrollingProgrammatically.value = true;
  activeSection.value = id;
  const container = contentRef.value;
  if (!container) return;
  const target = container.querySelector<HTMLElement>(`#${id}`);
  if (target) {
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop - 8;
    container.scrollTo({ top: offset, behavior: "smooth" });

    // 滚动完成后重置标记
    setTimeout(() => {
      isScrollingProgrammatically.value = false;
    }, 500);
  }
};

const handleSelect = (key: string) => {
  scrollToSection(key);
};

// 检查路由参数并滚动到指定区域
const checkRouteAndScroll = (query: Record<string, any>) => {
  if (query.section && typeof query.section === "string") {
    // 使用 nextTick 和额外延迟确保 DOM 已经完全渲染
    // 特别是从分离窗口导航过来时，需要更多时间
    nextTick(() => {
      setTimeout(() => {
        scrollToSection(query.section as string);
      }, 100);
    });
  }
};

// 重置设置
const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要重置所有设置到默认值吗？此操作不可撤销。", "重置设置", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    isLoadingFromFile = true; // 防止触发不必要的事件
    const defaultSettings = await resetAppSettingsAsync();
    settings.value = { ...defaultSettings };
    applyThemeFromComposable(settings.value.theme || "auto");

    // 手动触发同步事件
    setTimeout(() => {
      isLoadingFromFile = false;
      window.dispatchEvent(
        new CustomEvent("app-settings-changed", {
          detail: settings.value,
        })
      );
    }, 100);

    customMessage.success("设置已重置到默认值");
  } catch (error) {
    // 用户取消了操作
    if (error !== "cancel") {
      logger.error("重置应用设置失败", error);
      customMessage.error("重置设置失败");
    }
  }
};

// 在导入配置成功后重新加载设置
const onConfigImported = async (resultMessage: string) => {
  try {
    // 重新加载应用设置以反映变化
    isLoadingFromFile = true;
    const loadedSettings = await loadAppSettingsAsync();
    settings.value = loadedSettings;

    // 应用主题
    applyThemeFromComposable(settings.value.theme || "auto");
    applyThemeColors({
      primary: settings.value.themeColor,
      success: settings.value.successColor,
      warning: settings.value.warningColor,
      danger: settings.value.dangerColor,
      info: settings.value.infoColor,
    });

    // 手动触发同步事件
    setTimeout(() => {
      isLoadingFromFile = false;
      window.dispatchEvent(
        new CustomEvent("app-settings-changed", {
          detail: settings.value,
        })
      );
    }, 100);

    customMessage.success(resultMessage);
  } catch (error) {
    logger.error("导入配置后刷新设置失败", error);
    customMessage.error("刷新设置失败");
  }
};

// 标记是否正在从文件加载设置，避免触发不必要的事件
let isLoadingFromFile = false;

// 监听暗黑模式变化，更新设置中的主题
watch(isDark, (newValue) => {
  // 如果正在加载文件或主题是自动模式，不处理
  if (isLoadingFromFile || settings.value.theme === "auto") {
    return;
  }

  // 根据暗黑模式状态更新主题设置
  const newTheme = newValue ? "dark" : "light";
  if (settings.value.theme !== newTheme) {
    settings.value.theme = newTheme;
  }
});

// 监听托盘图标显示设置变化（实时生效）
watch(
  () => settings.value.showTrayIcon,
  async (newValue) => {
    if (isLoadingFromFile) return;

    try {
      // 同步到 Rust 后端，动态创建/移除托盘
      await invoke("set_show_tray_icon", { show: newValue });
      customMessage.success(newValue ? "托盘图标已显示" : "托盘图标已隐藏");
    } catch (error) {
      logger.error("更新托盘图标显示状态失败", error, { show: newValue });
      customMessage.error("更新托盘图标失败");
    }
  }
);

// 监听最小化到托盘设置变化
watch(
  () => settings.value.minimizeToTray,
  async (newValue) => {
    if (isLoadingFromFile) return;

    try {
      // 同步到 Rust 后端
      await invoke("update_tray_setting", { enabled: newValue });
    } catch (error) {
      logger.error("更新系统托盘设置失败", error, { enabled: newValue });
      customMessage.error("更新托盘设置失败");
    }
  }
);

// 监听主题色变化
watch(
  () => settings.value.themeColor,
  (newColor) => {
    if (newColor) {
      applyThemeColors({ primary: newColor });
    }
  }
);

// 监听成功色变化
watch(
  () => settings.value.successColor,
  (newColor) => {
    if (newColor) {
      applyThemeColors({ success: newColor });
    }
  }
);

// 监听警告色变化
watch(
  () => settings.value.warningColor,
  (newColor) => {
    if (newColor) {
      applyThemeColors({ warning: newColor });
    }
  }
);

// 监听危险色变化
watch(
  () => settings.value.dangerColor,
  (newColor) => {
    if (newColor) {
      applyThemeColors({ danger: newColor });
    }
  }
);

// 监听信息色变化
watch(
  () => settings.value.infoColor,
  (newColor) => {
    if (newColor) {
      applyThemeColors({ info: newColor });
    }
  }
);

// 监听设置变化，自动保存并应用
watch(
  settings,
  (newSettings) => {
    // 如果是从文件加载的，不触发事件
    if (isLoadingFromFile) {
      return;
    }

    // 保存设置到文件系统（使用防抖）
    saveAppSettingsDebounced(newSettings);

    // 应用主题设置（使用统一的主题管理）
    if (newSettings.theme) {
      applyThemeFromComposable(newSettings.theme);
    }

    // 应用主题色系统
    applyThemeColors({
      primary: newSettings.themeColor,
      success: newSettings.successColor,
      warning: newSettings.warningColor,
      danger: newSettings.dangerColor,
      info: newSettings.infoColor,
    });

    // 发出事件通知设置已更改（用于实时同步到侧边栏）
    window.dispatchEvent(
      new CustomEvent("app-settings-changed", {
        detail: newSettings,
      })
    );
  },
  { deep: true }
);

// 存储事件处理函数的引用
let handleSettingsChange: ((event: Event) => void) | null = null;

onMounted(async () => {
  isLoading.value = true;
  try {
    // 标记正在加载
    isLoadingFromFile = true;

    // 异步加载设置
    const loadedSettings = await loadAppSettingsAsync();

    // 确保 toolsVisible 包含所有工具（包括动态加载的插件）
    if (!loadedSettings.toolsVisible) {
      loadedSettings.toolsVisible = {};
    }

    // 为每个工具设置默认可见状态（使用 toolsStore.orderedTools 包括插件）
    toolsStore.orderedTools.forEach((tool) => {
      const toolId = getToolIdFromPath(tool.path);
      if (loadedSettings.toolsVisible![toolId] === undefined) {
        loadedSettings.toolsVisible![toolId] = true;
      }
    });

    settings.value = loadedSettings;

    // 应用日志配置
    applyLogConfig(settings.value);

    // 监听日志配置变化
    watchLogConfig(settings.value);

    // 应用主题（使用统一的主题管理）
    applyThemeFromComposable(settings.value.theme || "auto");

    // 应用主题色系统
    applyThemeColors({
      primary: settings.value.themeColor,
      success: settings.value.successColor,
      warning: settings.value.warningColor,
      danger: settings.value.dangerColor,
      info: settings.value.infoColor,
    });

    // 同步托盘设置到后端
    try {
      await invoke("update_tray_setting", { enabled: settings.value.minimizeToTray || false });
    } catch (error) {
      logger.error("初始化系统托盘设置失败", error, {
        enabled: settings.value.minimizeToTray || false,
      });
    }

    // 监听来自侧边栏的设置变化事件
    handleSettingsChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppSettings>;
      if (customEvent.detail && customEvent.detail.theme) {
        // 更新本地设置但不触发保存（因为侧边栏已经保存了）
        isLoadingFromFile = true;
        settings.value.theme = customEvent.detail.theme;
        // 主题已经由 useTheme 统一管理，这里只需要同步本地状态
        setTimeout(() => {
          isLoadingFromFile = false;
        }, 100);
      }
    };

    window.addEventListener("app-settings-changed", handleSettingsChange);

    // 加载完成后，允许触发事件
    setTimeout(() => {
      isLoadingFromFile = false;
    }, 100);

    // 检查初始路由参数，可能需要跳转到特定区域
    checkRouteAndScroll(route.query);
  } finally {
    await nextTick();
    isLoading.value = false;
  }
});

// 监听路由查询参数变化，支持页面内导航
watch(
  () => route.query,
  (newQuery) => {
    checkRouteAndScroll(newQuery);
  }
);

// 清理事件监听器
onUnmounted(() => {
  if (handleSettingsChange) {
    window.removeEventListener("app-settings-changed", handleSettingsChange);
  }
});
</script>

<template>
  <div class="settings-page">
    <div class="settings-wrapper">
      <!-- 骨架屏 -->
      <template v-if="isLoading">
        <!-- Nav Skeleton -->
        <aside class="settings-nav">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="rect" style="width: 100%; height: 100%" />
            </template>
          </el-skeleton>
        </aside>
        <!-- Content Skeleton -->
        <div class="settings-content">
          <el-skeleton :rows="15" animated />
        </div>
      </template>

      <!-- 实际内容 -->
      <template v-else>
        <!-- 左侧导航 -->
        <aside class="settings-nav">
          <button class="back-button" @click="handleGoBack">
            <el-icon><ArrowLeft /></el-icon>
            <span>返回</span>
          </button>
          <h1 class="nav-title">设置</h1>
          <div class="nav-menu">
            <button
              v-for="module in settingsModules"
              :key="module.id"
              class="nav-menu-item"
              :class="{ active: activeSection === module.id }"
              @click="handleSelect(module.id)"
            >
              {{ module.title }}
            </button>
          </div>

          <div class="nav-actions">
            <el-button @click="handleReset" type="danger" plain> 重置所有设置 </el-button>
          </div>
        </aside>

        <!-- 右侧内容 -->
        <div class="settings-content" ref="contentRef" @scroll="handleScroll">
          <template v-for="module in settingsModules" :key="module.id">
            <!-- 动态组件模块 -->
            <section
              v-if="module.component"
              :id="module.id"
              class="settings-section component-section"
              :style="{ minHeight: module.minHeight || 'auto' }"
            >
              <h2 class="section-title">{{ module.title }}</h2>
              <!-- 根据模块 ID 动态绑定 v-model -->

              <!-- 通用设置 -->
              <component
                v-if="module.id === 'general'"
                :is="module.component"
                v-model:show-tray-icon="settings.showTrayIcon"
                v-model:minimize-to-tray="settings.minimizeToTray"
                v-model:theme="settings.theme"
                v-model:auto-adjust-window-position="settings.autoAdjustWindowPosition"
                @config-imported="onConfigImported"
              />

              <!-- 主题色配置 -->
              <component
                v-else-if="module.id === 'theme-colors'"
                :is="module.component"
                v-model:theme-color="settings.themeColor"
                v-model:success-color="settings.successColor"
                v-model:warning-color="settings.warningColor"
                v-model:danger-color="settings.dangerColor"
                v-model:info-color="settings.infoColor"
              />

              <!-- 日志配置 -->
              <component
                v-else-if="module.id === 'log-settings'"
                :is="module.component"
                v-model:log-level="settings.logLevel"
                v-model:log-to-file="settings.logToFile"
                v-model:log-to-console="settings.logToConsole"
                v-model:log-buffer-size="settings.logBufferSize"
              />

              <!-- 工具模块配置 -->
              <component
                v-else-if="module.id === 'tools'"
                :is="module.component"
                v-model:tools-visible="settings.toolsVisible"
              />

              <!-- 其他动态组件 -->
              <component v-else :is="module.component" />
            </section>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow: hidden;
  /* 由右侧内容滚动 */
  background: var(--bg-color);
  box-sizing: border-box;
}

/* 新布局：左侧导航 + 右侧内容 */
.settings-wrapper {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 20px;
  height: 100%;
  align-items: start;
  box-sizing: border-box;
}

/* 左侧导航 */
.settings-nav {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  position: sticky;
  top: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0 12px;
  height: 36px;
  margin-bottom: 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  outline: none;
}

.back-button:hover {
  color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.08);
}

.back-button .el-icon {
  font-size: 16px;
}

.nav-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px 0;
}

/* 自定义导航菜单样式 */
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.nav-menu-item {
  width: 100%;
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
  outline: none;
}

/* 默认 hover 效果 */
.nav-menu-item:hover:not(.active) {
  background-color: rgba(var(--primary-color-rgb), 0.05);
  color: var(--primary-color);
}

/* 激活状态 - 左侧边缘高亮 */
.nav-menu-item.active {
  color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.08);
  font-weight: 500;
}

/* 左侧高亮条 */
.nav-menu-item.active::before {
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

/* 点击效果 */
.nav-menu-item:active {
  transform: scale(0.98);
}

.nav-actions {
  margin-top: auto;
  /* 底部对齐 */
  padding-top: 16px;
}

.nav-actions .el-button {
  width: 100%;
}

/* 右侧内容区域滚动 */
.settings-content {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 8px;
  box-sizing: border-box;
  padding-right: 10px;
  padding-bottom: 40px;
}

/* 添加 CSS 变量支持 */
:root {
  --primary-color-rgb: 64, 158, 255;
  /* 默认蓝色 */
}

/* 暗色模式下的主色调 RGB */
.dark {
  --primary-color-rgb: 64, 158, 255;
}

/* 滚动条样式优化 */
.settings-content::-webkit-scrollbar {
  width: 8px;
}

.settings-content::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 4px;
}

.settings-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.settings-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-secondary);
}

/* 旧容器保留但未使用 */
.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 30px;
}

/* 卡片与条目 */
.settings-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color-light);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.setting-hint {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  margin-left: 4px;
  white-space: nowrap;
}

.setting-hint.warning {
  color: var(--warning-color, #e6a23c);
  background-color: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.3);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

/* 配置管理按钮组 */
.config-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 动态组件 section 特殊样式 */
.component-section {
  padding: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  max-height: 95%;
}

.component-section .section-title {
  position: sticky;
  top: 0;
  background: var(--card-bg);
  z-index: 1;
  padding: 24px 24px 12px;
  margin: 0;
  flex-shrink: 0;
}
</style>
