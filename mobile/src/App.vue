<script setup lang="ts">
import AppBottomNav from "./components/AppBottomNav.vue";
</script>

<template>
  <div class="app-container">
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>

    <AppBottomNav />
  </div>
</template>

<style>
/* 全局样式移入 App.vue 或保持在 theme.css */
:root {
  --var-bottom-navigation-height: 56px;
  /* 状态栏保底高度，如果 env 无效则使用 24px */
  --status-bar-height: env(safe-area-inset-top, 24px);
}

.safe-area-top {
  padding-top: env(safe-area-inset-top);
}

.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(var(--var-bottom-navigation-height) + env(safe-area-inset-bottom));
}
</style>
