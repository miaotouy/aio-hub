<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const active = ref("home");

// 根据路由更新激活状态
watch(
  () => route.path,
  (path) => {
    if (path === "/") active.value = "home";
    else if (path === "/settings") active.value = "settings";
    else active.value = "tools";
  },
  { immediate: true }
);

const handleChange = (value: string | number) => {
  const val = String(value);
  if (val === "home") router.push("/");
  else if (val === "settings") router.push("/settings");
  // 'tools' 默认留在首页或展示工具列表
};
</script>

<template>
  <div class="app-container">
    <div class="main-content">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>

    <var-bottom-navigation
      v-model:active="active"
      @change="handleChange"
      fixed
      safe-area
    >
      <var-bottom-navigation-item label="首页" name="home" icon="home" />
      <var-bottom-navigation-item label="工具" name="tools" icon="magnify" />
      <var-bottom-navigation-item label="设置" name="settings" icon="cog" />
    </var-bottom-navigation>
  </div>
</template>

<style>
/* 全局样式移入 App.vue 或保持在 theme.css */
:root {
  --var-bottom-navigation-height: 56px;
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
