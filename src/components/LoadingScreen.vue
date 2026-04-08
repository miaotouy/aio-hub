<script setup lang="ts">
import { computed } from "vue";
import { useDark } from "@vueuse/core";
import { useAppInitStore } from "@/stores/appInitStore";
import iconBlack from "@/assets/aio-icon-black.svg";
import iconWhite from "@/assets/aio-icon-white.svg";
import { RefreshRight, Warning, CopyDocument, ChatLineRound, Link } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { open } from "@tauri-apps/plugin-shell";

const isDark = useDark();
const appInitStore = useAppInitStore();

const appIcon = computed(() => (isDark.value ? iconWhite : iconBlack));

const progress = computed(() => appInitStore.progress);
const statusText = computed(() => appInitStore.statusText);
const error = computed(() => appInitStore.error);

const handleRetry = () => {
  appInitStore.retry();
};

const copyError = async () => {
  if (!error.value) return;
  const text = `Error: ${error.value.message}\n\nStack:\n${error.value.stack || "No stack trace available"}`;
  try {
    await navigator.clipboard.writeText(text);
    customMessage.success("错误信息已复制到剪贴板");
  } catch (e) {
    customMessage.error("复制失败");
  }
};

const openUrl = async (url: string) => {
  try {
    await open(url);
  } catch (e) {
    customMessage.error("无法打开链接");
  }
};
</script>

<template>
  <div class="loading-screen" :class="{ 'is-dark': isDark }">
    <div class="loading-content" :class="{ 'has-error': !!error }">
      <template v-if="!error">
        <!-- 正常启动时的 Logo -->
        <div class="app-logo-container">
          <img :src="appIcon" alt="AIO Hub" class="app-logo" />
          <div class="logo-pulse"></div>
        </div>
        <h1 class="app-name">AIO Hub</h1>

        <!-- 进度条和状态 -->
        <div class="progress-container">
          <el-progress :percentage="progress" :stroke-width="4" :show-text="false" class="loading-progress" />
          <p class="status-text">{{ statusText }}</p>
        </div>
      </template>

      <!-- 错误显示 -->
      <div v-else class="error-container">
        <div class="error-header">
          <div class="error-brand">
            <img :src="appIcon" alt="AIO Hub" class="error-logo" />
            <span class="error-app-name">AIO Hub</span>
          </div>
          <div class="error-info">
            <el-icon class="error-icon"><Warning /></el-icon>
            <h2 class="error-title">启动失败</h2>
          </div>
          <p class="error-message">{{ error.message || "启动过程中发生错误" }}</p>
        </div>

        <div class="error-actions">
          <el-button type="primary" :icon="RefreshRight" class="retry-button" @click="handleRetry"> 重试 </el-button>
          <div class="secondary-actions">
            <el-button :icon="CopyDocument" @click="copyError"> 复制错误 </el-button>
            <el-button :icon="ChatLineRound" @click="openUrl('https://github.com/miaotouy/aio-hub/issues')">
              提交反馈
            </el-button>
            <el-button :icon="Link" @click="openUrl('https://www.doubao.com/chat')"> 豆包支持 </el-button>
          </div>
        </div>

        <div class="error-details-wrapper">
          <div class="details-header">详细错误信息</div>
          <div class="details-content">
            <pre class="stack-trace">{{ error.stack || "无堆栈信息" }}</pre>
          </div>
        </div>
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
  z-index: 9999;
  user-select: none;
  background-color: var(--bg-color);
}

.loading-screen.is-dark {
  color: #ffffff;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 400px;
  width: 80%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.loading-content.has-error {
  max-width: 640px;
}

.app-logo-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.app-logo {
  width: 100px;
  height: 100px;
  object-fit: contain;
  position: relative;
  z-index: 2;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(180deg);
  }
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
  width: 100%;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 16px;
  padding: 32px;
  box-sizing: border-box;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  user-select: text;
}

.error-header {
  width: 100%;
  text-align: center;
  margin-bottom: 28px;
}

.error-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
  opacity: 0.8;
}

.error-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.error-app-name {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.error-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.error-icon {
  font-size: 48px;
  color: var(--el-color-danger);
}

.error-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
}

.error-message {
  font-size: 15px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  margin: 0;
  max-width: 480px;
  word-break: break-all;
}

.error-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  margin-bottom: 24px;
}

.retry-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 500;
}

.secondary-actions {
  display: flex;
  gap: 8px;
}

.secondary-actions .el-button {
  flex: 1;
  margin: 0;
  height: 36px;
  padding: 0 8px;
  font-size: 13px;
}

.error-details-wrapper {
  width: 100%;
  border-top: 1px solid var(--border-color);
  padding-top: 24px;
  text-align: left;
}

.details-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  padding-left: 4px;
}

.details-content {
  background: rgba(var(--el-color-info-rgb), 0.05);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  max-height: 240px;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

/* 自定义滚动条样式，使其更优雅 */
.details-content::-webkit-scrollbar {
  width: 6px;
}

.details-content::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 3px;
}

.details-content::-webkit-scrollbar-track {
  background: transparent;
}

.stack-trace {
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
  background: transparent;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-primary);
  opacity: 0.9;
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
