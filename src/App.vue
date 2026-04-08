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
}

#app {
  position: relative;
  z-index: 0;
  background: var(--bg-color);
  min-height: 100vh;
}
</style>
