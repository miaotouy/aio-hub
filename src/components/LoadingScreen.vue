<script setup lang="ts">
import { computed } from "vue";
import { useDark } from "@vueuse/core";
import { useAppInitStore } from "@/stores/appInitStore";
import iconBlack from "@/assets/aio-icon-black.svg";
import iconWhite from "@/assets/aio-icon-white.svg";
import { RefreshRight, Warning } from "@element-plus/icons-vue";

const isDark = useDark();
const appInitStore = useAppInitStore();

const appIcon = computed(() => (isDark.value ? iconWhite : iconBlack));

const progress = computed(() => appInitStore.progress);
const statusText = computed(() => appInitStore.statusText);
const error = computed(() => appInitStore.error);

const handleRetry = () => {
  appInitStore.retry();
};
</script>

<template>
  <div class="loading-screen" :class="{ 'is-dark': isDark }">
    <div class="loading-content">
      <!-- 应用图标 -->
      <div class="app-logo-container">
        <img :src="appIcon" alt="AIO Hub" class="app-logo" />
        <div class="logo-pulse"></div>
      </div>

      <h1 class="app-name">AIO Hub</h1>

      <!-- 进度条和状态 -->
      <div v-if="!error" class="progress-container">
        <el-progress :percentage="progress" :stroke-width="4" :show-text="false" class="loading-progress" />
        <p class="status-text">{{ statusText }}</p>
      </div>

      <!-- 错误显示 -->
      <div v-else class="error-container">
        <el-icon class="error-icon"><Warning /></el-icon>
        <p class="error-message">{{ error.message || "启动过程中发生错误" }}</p>
        <el-button type="primary" :icon="RefreshRight" @click="handleRetry"> 重试 </el-button>
      </div>
    </div>

    <!-- 底部版本信息 -->
    <div class="loading-footer">
      <p>一站式桌面 AI 工具枢纽</p>
    </div>
  </div>
</template>

<style scoped>
.loading-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  z-index: 9999;
  user-select: none;
}

.loading-screen.is-dark {
  background-color: #1a1a1a;
  color: #ffffff;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 400px;
  width: 80%;
}

.app-logo-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
}

.app-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
  z-index: 2;
}

.logo-pulse {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--el-color-primary);
  border-radius: 50%;
  opacity: 0.2;
  filter: blur(20px);
  animation: pulse 2s infinite ease-in-out;
  z-index: 1;
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.3;
  }
  100% {
    transform: scale(0.8);
    opacity: 0.1;
  }
}

.app-name {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 48px 0;
  letter-spacing: 1px;
}

.progress-container {
  width: 100%;
  text-align: center;
}

.loading-progress {
  margin-bottom: 12px;
}

.status-text {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.is-dark .status-text {
  color: #aaa;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.error-icon {
  font-size: 48px;
  color: var(--el-color-danger);
  margin-bottom: 16px;
}

.error-message {
  font-size: 14px;
  color: var(--el-color-danger);
  margin: 0 0 24px 0;
}

.loading-footer {
  position: absolute;
  bottom: 48px;
  font-size: 12px;
  color: #999;
}

.is-dark .loading-footer {
  color: #666;
}
</style>
