<script setup lang="ts">
import { ref, shallowRef, onMounted, type Component, watch } from "vue";
import { useRoute } from "vue-router";
import { useWindowSyncBus } from "../composables/useWindowSyncBus";
import { useDetachedManager } from "../composables/useDetachedManager";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTheme } from "../composables/useTheme";
import { createModuleLogger } from "../utils/logger";
import { getDetachableComponentConfig, loadDetachableComponent } from "../config/detachable-components";
import { loadAppSettingsAsync } from "../utils/appSettings";
import { applyThemeColors } from "../utils/themeColors";
import DetachPreviewHint from "../components/common/DetachPreviewHint.vue";
import ImageViewer from "../components/common/ImageViewer.vue";
import { useImageViewer } from "../composables/useImageViewer";

const logger = createModuleLogger("DetachedComponentContainer");

// 全局图片查看器
const imageViewer = useImageViewer();
const route = useRoute();
const { currentTheme } = useTheme();

// 组件状态
const isPreview = ref(true);
const componentToRender = shallowRef<Component | null>(null);

// 从逻辑钩子获取的 props 和 listeners
const componentProps = ref<Record<string, any>>({});
const componentEventListeners = ref<Record<string, any>>({});

// 当前组件 ID
const currentComponentId = ref<string>('');

// 路由变化监听
watch(
  () => route.path,
  (newPath, oldPath) => {
    logger.info("路由发生变化", { from: oldPath, to: newPath, query: route.query });
  },
  { immediate: true }
);

watch(
  () => route.query,
  (newQuery, oldQuery) => {
    logger.info("路由查询参数发生变化", {
      from: oldQuery,
      to: newQuery,
      componentId: newQuery.componentId,
      mode: newQuery.mode,
    });
  },
  { immediate: true, deep: true }
);
onMounted(async () => {
  // 初始化此窗口的通信总线
  const { initializeSyncBus } = useWindowSyncBus();
  initializeSyncBus();

  // 初始化分离窗口管理器，以便能正确检测其他组件的分离状态
  const { initialize } = useDetachedManager();
  await initialize();

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
    logger.info('分离组件窗口主题色已应用', {
      themeColor: settings.themeColor,
      successColor: settings.successColor,
      warningColor: settings.warningColor,
      dangerColor: settings.dangerColor,
      infoColor: settings.infoColor,
    });
  } catch (error) {
    logger.warn('应用分离组件窗口主题色失败', { error });
  }

  logger.info("DetachedComponentContainer 挂载", {
    currentPath: route.path,
  });

  // 检查窗口是否已经固定（用于刷新时恢复状态）
  const checkIfFinalized = async () => {
    try {
      const currentWindow = getCurrentWebviewWindow();
      const label = currentWindow.label;
      logger.info("检查窗口固定状态", { label });

      // 使用新的统一命令检查窗口是否已固定
      const windows = await invoke<Array<{ id: string; label: string }>>("get_all_detached_windows");
      const isFinalized = windows.some(w => w.label === label);
      
      logger.info("窗口固定状态检查结果", { label, isFinalized });

      if (isFinalized) {
        // 窗口已固定，直接进入最终模式
        isPreview.value = false;
        logger.info("窗口已固定，设置为最终模式");
      } else {
        // 窗口未固定，保持预览模式
        isPreview.value = true;
        logger.info("窗口未固定，保持预览模式");
      }
    } catch (error) {
      logger.error("检查窗口固定状态失败，默认使用预览模式", { error });
      isPreview.value = true;
    }
  };

  // 从 URL 查询参数加载组件配置
  const loadComponentFromRoute = () => {
    if (route.query.config && typeof route.query.config === "string") {
      try {
        const config = JSON.parse(route.query.config);
        logger.info("从路由参数解析到组件配置", { config });

        // 新系统使用 id 而不是 componentId
        const { id } = config;
        currentComponentId.value = id;

        // 从注册表获取组件配置
        const componentConfig = getDetachableComponentConfig(id);
        
        if (componentConfig) {
          logger.info("正在加载组件", { id });
          
          // 加载组件
          componentToRender.value = loadDetachableComponent(id);
          
          // 执行逻辑钩子获取 props 和 listeners
          const logicResult = componentConfig.logicHook();
          componentProps.value = logicResult.props.value;
          componentEventListeners.value = logicResult.listeners;
          
          // 监听 props 的变化（因为 logicResult.props 是响应式的）
          watch(logicResult.props, (newProps) => {
            componentProps.value = newProps;
          }, { deep: true });
          
          logger.info("组件加载成功", {
            id,
            propsKeys: Object.keys(componentProps.value),
            listenersKeys: Object.keys(componentEventListeners.value)
          });
        } else {
          logger.error("未找到或未注册可分离的组件", { id });
        }
      } catch (error) {
        logger.error("解析路由中的组件配置失败", { error, config: route.query.config });
      }
    } else {
      logger.warn("路由参数中未找到组件配置", { query: route.query });
    }
  };

  // 初始加载组件
  loadComponentFromRoute();

  // 检查窗口是否已固定
  await checkIfFinalized();

  // 监听固定事件（用于拖拽后的固定）
  await listen("finalize-component-view", () => {
    logger.info("收到固定事件，切换到最终模式");
    isPreview.value = false;
  });

  logger.info("DetachedComponentContainer 初始化完成");
});
</script>

<template>
  <div
    class="detached-component-container"
    :class="[`theme-${currentTheme}`, { 'preview-mode': isPreview, 'final-mode': !isPreview }]"
  >
    <!-- 全局图片查看器 - 分离组件窗口也需要独立的图片查看功能 -->
    <ImageViewer
      v-if="imageViewer.state.value.visible"
      :images="imageViewer.state.value.images"
      :initial-index="imageViewer.state.value.currentIndex"
      :options="imageViewer.state.value.options"
      @close="imageViewer.hide()"
      @change="(index) => imageViewer.state.value.currentIndex = index"
    />
    
    <!-- 组件渲染区域 -->
    <div class="component-wrapper">
      <component
        v-if="componentToRender"
        :is="componentToRender"
        v-bind="componentProps"
        v-on="componentEventListeners"
      />
      <div v-else class="error-message">
        <h2>组件加载失败</h2>
        <p v-if="route.query.componentId">
          无法找到ID为 "<strong>{{ route.query.componentId }}</strong
          >" 的组件。
        </p>
        <p v-else>未指定要加载的组件ID。</p>
      </div>

      <!-- 预览模式提示 -->
      <DetachPreviewHint :visible="isPreview" />
    </div>
  </div>
</template>

<style scoped>
/* 分离组件容器 - 透明背景实现 */
.detached-component-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  overflow: visible;
  pointer-events: none;
  /* 让鼠标事件穿透容器 */
  gap: 8px;
  padding: 32px;
  /* 添加内边距，让组件不会紧贴窗口边缘 */
  box-sizing: border-box;
}

/* 预览模式样式 - 半透明提示 */
.preview-mode {
  opacity: 0.5;
}

/* 最终模式样式 - 完全不透明 */
.final-mode {
  opacity: 1;
}

.component-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible;
  /* 允许组件的阴影效果溢出 */
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  /* 组件本身可以接收鼠标事件 */
}

/* 错误消息 */
.error-message {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--el-color-danger);
  padding: 20px;
  text-align: center;
}

.error-message h2 {
  margin: 0 0 12px 0;
  font-size: 18px;
}

.error-message p {
  margin: 8px 0;
  font-size: 14px;
}
</style>
