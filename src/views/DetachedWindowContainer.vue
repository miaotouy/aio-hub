<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useTheme } from '../composables/useTheme';
import { createModuleLogger } from '../utils/logger';
import TitleBar from '../components/TitleBar.vue';
import DetachPreviewHint from '../components/common/DetachPreviewHint.vue';

const logger = createModuleLogger('DetachedWindowContainer');
const route = useRoute();
const router = useRouter();
const { currentTheme } = useTheme();

const toolTitle = computed(() => route.query.title as string || '工具窗口');
const isPreview = ref(true);

// 判断是否需要显示标题栏（拖拽指示器不需要）
const showTitleBar = computed(() => route.path !== '/drag-indicator');

onMounted(async () => {
  // 如果有 toolPath 参数，导航到对应的工具页面
  const toolPath = route.query.toolPath as string;
  if (toolPath) {
    router.replace(toolPath);
  }

  // 检查窗口是否已经固定（用于刷新时恢复状态）
  const checkIfFinalized = async () => {
    try {
      const currentWindow = getCurrentWebviewWindow();
      const label = currentWindow.label;
      logger.info('检查窗口固定状态', { label });

      const windows = await invoke<Array<{ id: string; label: string }>>("get_all_detached_windows");
      const isFinalized = windows.some(w => w.label === label);
      
      logger.info('窗口固定状态检查结果', { label, isFinalized });

      if (isFinalized) {
        isPreview.value = false;
        logger.info('窗口已固定，设置为最终模式');
      } else {
        isPreview.value = true;
        logger.info('窗口未固定，保持预览模式');
      }
    } catch (error) {
      logger.error('检查窗口固定状态失败，默认使用预览模式', { error });
      isPreview.value = true;
    }
  };

  // 检查窗口是否已固定
  await checkIfFinalized();

  // 监听固定事件（用于拖拽后的固定）
  await listen("finalize-component-view", () => {
    logger.info("收到固定事件，切换到最终模式");
    isPreview.value = false;
  });

  logger.info("DetachedWindowContainer 初始化完成");
});
</script>

<template>
  <div class="detached-container" :class="[`theme-${currentTheme}`, { 'preview-mode': isPreview, 'final-mode': !isPreview }]">
    <TitleBar v-if="showTitleBar" :title="toolTitle" />
    
    <div class="tool-content" :class="{ 'no-titlebar': !showTitleBar }">
      <router-view />
    </div>

    <!-- 预览模式提示 -->
    <DetachPreviewHint :visible="isPreview" />
  </div>
</template>

<style scoped>
.detached-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

.tool-content {
  flex: 1;
  overflow: auto;
  padding-top: 32px;
}

.tool-content.no-titlebar {
  padding-top: 0;
}

/* 预览模式样式 - 半透明提示 */
.preview-mode {
  opacity: 0.5;
}

/* 最终模式样式 - 完全不透明 */
.final-mode {
  opacity: 1;
}

</style>