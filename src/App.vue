<script setup lang="ts">
import { onMounted } from "vue";
import { useAppInitStore } from "@/stores/appInitStore";
import { useRootInit } from "@/composables/useRootInit";
import { useDeepLinkHandler } from "@/composables/useDeepLinkHandler";
import GlobalProviders from "./components/GlobalProviders.vue";
import LoadingScreen from "./components/LoadingScreen.vue";
import MainLayout from "./views/MainLayout.vue";

defineOptions({
  name: "App",
});

// 初始化根组件通用逻辑（主题、分离管理器、通信总线等）
useRootInit();

// 初始化 Deep Link 处理器
useDeepLinkHandler();

const appInitStore = useAppInitStore();

onMounted(async () => {
  // 触发主应用初始化序列
  await appInitStore.initMainApp();

  // 强制复位补丁：防止任何意外的滚动位移（如 scrollIntoView 导致的 body 偏移）
  const resetScroll = () => {
    if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
  };

  window.addEventListener("scroll", resetScroll, { passive: true });
  // 某些情况下聚焦输入框也会触发位移，定期检查
  const interval = setInterval(resetScroll, 1000);

  return () => {
    window.removeEventListener("scroll", resetScroll);
    clearInterval(interval);
  };
});
</script>

<template>
  <GlobalProviders>
    <!-- 根据初始化状态切换界面 -->
    <MainLayout v-if="appInitStore.isReady" />
    <LoadingScreen v-else />
  </GlobalProviders>
</template>

<style>
/* 全局基础样式保留在 App.vue */
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 彻底阻断滚动链传播，防止内部滚动影响窗口定位 */
  overscroll-behavior: none;
  /* 渲染隔离：确保内容永远在视口内绘制，防止意外的滚动位移 */
  contain: paint;
}

#app {
  position: relative;
  z-index: 0;
  background: var(--bg-color);
  min-height: 100vh;
}
</style>
