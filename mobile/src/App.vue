<script setup lang="ts">
import { onMounted } from "vue";
import AppBottomNav from "./components/AppBottomNav.vue";
import { useAppInit } from "@/composables/useAppInit";
import { useThemeStore } from "@/stores/theme";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";

const { isReady, progress, statusMessage, bootstrap } = useAppInit();
const themeStore = useThemeStore();

// 全局键盘避让
useKeyboardAvoidance();

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
/* 全局样式移入 App.vue 或保持在 theme.css */
:root {
  --var-bottom-navigation-height: 56px;
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
  font-size: 14px;
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
  /* 关键：键盘弹出时缩小容器高度 */
  height: var(--viewport-height, 100dvh);
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  overflow: hidden;
  transition: height 0.3s ease-out;
}

.app-style-provider {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  /* 只有当内容超出时才需要 padding 给 fixed 的导航栏留位置 */
  /* 但为了保证滚动到底部时内容不被遮挡，padding 还是需要的 */
  padding-bottom: calc(var(--var-bottom-navigation-height) + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* 全局键盘避让样式 */
:root {
  --keyboard-height: 0px;
  --viewport-height: 100vh;
}

/* 当键盘可见时，调整 popup 等浮层的高度 */
.keyboard-visible .var-popup__content {
  max-height: var(--viewport-height) !important;
}

/* 键盘可见时，给所有滚动容器增加底部空间 */
/* 注意：popup 是 teleport 到 body 的，所以需要用 :root 级别的选择器 */
.keyboard-visible .editor-content,
.keyboard-visible .keyboard-aware-scroll,
.keyboard-visible .popup-scroll-content {
  /* 增加额外 Padding 确保内容能滚上去 */
  padding-bottom: calc(var(--keyboard-height) + 40px) !important;
  transition: padding-bottom 0.3s ease-out;
}

/* 聚焦的输入框自动滚动到可见区域 */
.keyboard-visible input:focus,
.keyboard-visible textarea:focus {
  scroll-margin-bottom: calc(var(--keyboard-height) + 60px);
}
</style>
