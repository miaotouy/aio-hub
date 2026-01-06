<script setup lang="ts">
import { useThemeStore } from "../stores/theme";
import { ref, onMounted } from "vue";

const themeStore = useThemeStore();
const isDark = ref(false);

onMounted(() => {
  themeStore.initTheme();
  isDark.value = themeStore.isDark;
});

const toggleTheme = () => {
  themeStore.toggleTheme();
  isDark.value = themeStore.isDark;
};
</script>

<template>
  <div class="settings-container safe-area-bottom">
    <h2 class="page-title">设置</h2>

    <div class="settings-list">
      <div class="setting-item">
        <span class="setting-label">深色模式</span>
        <var-switch v-model="isDark" @change="toggleTheme" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  min-height: 100vh;
  background-color: var(--bg-color);
  padding: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 24px 0;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  background-color: var(--card-bg);
  border-radius: var(--app-radius-md);
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border-color);
}

.setting-label {
  font-size: 16px;
  color: var(--text-color);
}
</style>
