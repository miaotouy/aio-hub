<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, defineAsyncComponent, type Component } from "vue";
import { useRoute } from "vue-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTheme } from "../composables/useTheme";
import { useDetachedManager } from "../composables/useDetachedManager";
import { useWindowSyncBus } from "../composables/useWindowSyncBus";
import { useLlmChatStateConsumer } from "../tools/llm-chat/composables/useLlmChatStateConsumer";
import { createModuleLogger } from "../utils/logger";
import { loadAppSettingsAsync } from "../utils/appSettings";
import { applyThemeColors } from "../utils/themeColors";
import { useToolsStore } from "../stores/tools";
import TitleBar from "../components/TitleBar.vue";
import DetachPreviewHint from "../components/common/DetachPreviewHint.vue";
import SyncServiceProvider from "../components/SyncServiceProvider.vue";
import ImageViewer from "../components/common/ImageViewer.vue";
import { useImageViewer } from "../composables/useImageViewer";

const logger = createModuleLogger("DetachedWindowContainer");

// 全局图片查看器
const imageViewer = useImageViewer();
const route = useRoute();
const { currentTheme } = useTheme();
const { initialize: initializeDetachedManager } = useDetachedManager();
const toolsStore = useToolsStore();

// 从路由参数获取工具路径
const toolPath = computed(() => `/${route.params.toolPath as string}`);

// 从工具配置中查找对应的工具（支持内置工具和插件工具）
const toolConfig = computed(() => toolsStore.tools.find((t) => t.path === toolPath.value));

// 工具标题
const toolTitle = computed(() => toolConfig.value?.name || "工具窗口");

// 工具图标
const toolIcon = computed(() => toolConfig.value?.icon);

// 动态加载的工具组件
const toolComponent = shallowRef<Component | null>(null);

const isPreview = ref(true);

// 判断是否需要显示标题栏
const showTitleBar = computed(() => true);

onMounted(async () => {
  // 初始化跨窗口通信总线
  const { initializeSyncBus } = useWindowSyncBus();
  initializeSyncBus();
  
  // 初始化统一的分离窗口管理器
  await initializeDetachedManager();
  
  // 加载并应用主题色系统
  try {
    const settings = await loadAppSettingsAsync();
    applyThemeColors({
      primary: settings.themeColor,
      success: settings.successColor,
      warning: settings.warningColor,
      danger: settings.dangerColor,
      info: settings.infoColor,
    });
    logger.info('分离窗口主题色已应用', {
      themeColor: settings.themeColor,
      successColor: settings.successColor,
      warningColor: settings.warningColor,
      dangerColor: settings.dangerColor,
      infoColor: settings.infoColor,
    });
  } catch (error) {
    logger.warn('应用分离窗口主题色失败', { error });
  }
  
  // 如果是 llm-chat 工具窗口，启动状态消费者
  // 这确保分离的工具窗口能从主窗口接收完整状态，成为主窗口的副本
  if (toolPath.value === '/llm-chat') {
    logger.info('启动 LLM Chat 状态消费者（作为主窗口的副本）');
    useLlmChatStateConsumer();
  }
  
  const config = toolConfig.value;

  if (config) {
    try {
      logger.info("加载工具组件", { toolPath: toolPath.value, toolName: config.name });
      // 使用 toolsConfig 中定义的组件导入函数
      toolComponent.value = defineAsyncComponent(config.component);
    } catch (error) {
      logger.error("加载工具组件失败", { error, toolPath: toolPath.value });
    }
  } else {
    logger.error("未找到工具配置", { toolPath: toolPath.value });
  }

  // 检查窗口是否已经固定（用于刷新时恢复状态）
  const checkIfFinalized = async () => {
    try {
      const currentWindow = getCurrentWebviewWindow();
      const label = currentWindow.label;
      logger.info("检查窗口固定状态", { label });

      const windows = await invoke<Array<{ id: string; label: string }>>(
        "get_all_detached_windows"
      );
      const isFinalized = windows.some((w) => w.label === label);

      logger.info("窗口固定状态检查结果", { label, isFinalized });

      if (isFinalized) {
        isPreview.value = false;
        logger.info("窗口已固定，设置为最终模式");
      } else {
        isPreview.value = true;
        logger.info("窗口未固定，保持预览模式");
      }
    } catch (error) {
      logger.error("检查窗口固定状态失败，默认使用预览模式", { error });
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
  <div
    class="detached-container"
    :class="[`theme-${currentTheme}`, { 'preview-mode': isPreview, 'final-mode': !isPreview }]"
  >
    <!-- 全局同步服务提供者 - 分离的工具窗口也需要同步服务 -->
    <SyncServiceProvider />
    
    <!-- 全局图片查看器 - 分离窗口也需要独立的图片查看功能 -->
    <ImageViewer
      v-if="imageViewer.state.value.visible"
      :images="imageViewer.state.value.images"
      :initial-index="imageViewer.state.value.currentIndex"
      :options="imageViewer.state.value.options"
      @close="imageViewer.hide()"
      @change="(index) => imageViewer.state.value.currentIndex = index"
    />
    
    <TitleBar v-if="showTitleBar" :title="toolTitle" :icon="toolIcon" />

    <div class="tool-content" :class="{ 'no-titlebar': !showTitleBar }">
      <component v-if="toolComponent" :is="toolComponent" />
      <div v-else class="loading-message">
        <p>加载中...</p>
      </div>
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
  background: transparent;
  overflow: visible;
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

.loading-message {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-color);
}
</style>
