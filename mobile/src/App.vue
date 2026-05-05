<script setup lang="ts">
import { onMounted, watchEffect } from "vue";
import AppBottomNav from "./components/AppBottomNav.vue";
import { useAppInit } from "@/composables/useAppInit";
import { useThemeStore } from "@/stores/theme";
import { useSettingsStore } from "@/stores/settings";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { useDebugPanel } from "@/composables/useDebugPanel";

const { isReady, progress, statusMessage, bootstrap } = useAppInit();
const themeStore = useThemeStore();
const settingsStore = useSettingsStore();
const { syncWithSettings } = useDebugPanel();

// 全局键盘避让
useKeyboardAvoidance();

// 同步调试面板状态
syncWithSettings();

// 同步外观设置到 CSS 变量和根元素
watchEffect(() => {
  const { fontSizeScale } = settingsStore.settings.appearance;

  // 1. 字体缩放
  // 我们将 fontSizeScale 应用于根元素的 font-size (影响 rem)
  // 默认基础 14px * scale
  const baseSize = 14 * fontSizeScale;
  document.documentElement.style.fontSize = `${baseSize}px`;

  // 同时提供变量供全局使用
  document.documentElement.style.setProperty("--app-font-size", `${baseSize}px`);
  document.documentElement.style.setProperty("--app-font-scale", fontSizeScale.toString());

  // 同步更新 Varlet 的基础字体大小变量
  document.documentElement.style.setProperty("--font-size-md", `${baseSize}px`);
  document.documentElement.style.setProperty("--font-size-sm", `${baseSize - 2}px`);
  document.documentElement.style.setProperty("--font-size-lg", `${baseSize + 2}px`);
  document.documentElement.style.setProperty("--font-size-xs", `${baseSize - 4}px`);
});

onMounted(() => {
  bootstrap();
});
</script>

<template>
  <div v-if="!isReady" class="app-init-overlay">
    <div class="init-content">
      <var-loading type="cube" size="large" color="var(--primary-color)" />
      <div class="init-status">{{ statusMessage }}</div>
      <div class="init-progress-bar">
        <div class="init-progress-inner" :style="{ width: progress + '%' }"></div>
      </div>
    </div>
  </div>

  <div v-else class="app-container">
    <var-style-provider :style="themeStore.themeVars" class="app-style-provider">
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>

      <AppBottomNav />
    </var-style-provider>
  </div>
</template>

<style>
/* 全局样式确保视口压缩正常工作 */
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

:root {
  --var-bottom-navigation-height: 66px;
}

.app-init-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color);
}

.init-content {
  width: 80%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.init-status {
  margin-top: 24px;
  font-size: 1rem;
  color: var(--text-color);
  opacity: 0.8;
}

.init-progress-bar {
  margin-top: 16px;
  width: 100%;
  height: 4px;
  background-color: color-mix(in srgb, var(--primary-color), transparent 85%);
  border-radius: 2px;
  overflow: hidden;
}

.init-progress-inner {
  height: 100%;
  background-color: var(--primary-color);
  transition: width 0.3s ease;
}

.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  overflow: hidden;
  /* 确保容器在键盘弹出时能被压缩 */
  position: relative;
}

.app-style-provider {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; /* 关键：允许 flex 项目缩小 */
  overflow: hidden;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* 只有当内容超出时才需要 padding 给 fixed 的导航栏留位置 */
  padding-bottom: calc(var(--var-bottom-navigation-height) + env(safe-area-inset-bottom));
  box-sizing: border-box;
  /* 移除 transition，键盘避让需要即时反馈 */
}

/* 键盘弹出时，容器高度已经缩小了，不需要再保留底部导航栏和安全区的 padding */
.keyboard-visible .main-content {
  padding-bottom: 0;
}

/* 全局键盘避让样式 */
:root {
  --keyboard-height: 0px;
}

/* 键盘可见时，给输入框增加滚动留白，确保内容不被键盘遮挡 */
.keyboard-visible input:focus,
.keyboard-visible textarea:focus,
.keyboard-visible .var-input:focus-within {
  /* 视口已经能正确压缩，这里保留一个基础留白即可 */
  scroll-margin-bottom: 20px;
}

/* 键盘弹出时强制隐藏底部导航栏，防止被顶起 */
.keyboard-visible .var-bottom-navigation {
  display: none !important;
}

</style>
