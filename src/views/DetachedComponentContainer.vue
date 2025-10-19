<script setup lang="ts">
import { ref, shallowRef, onMounted, defineAsyncComponent, type Component, watch } from "vue";
import { useRoute } from "vue-router";
import { useWindowSyncBus } from "../composables/useWindowSyncBus";
import { useDetachedManager } from "../composables/useDetachedManager";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTheme } from "../composables/useTheme";
import { createModuleLogger } from "../utils/logger";
import { useAgentStore } from "../tools/llm-chat/agentStore";
import DetachPreviewHint from "../components/common/DetachPreviewHint.vue";

const logger = createModuleLogger("DetachedComponentContainer");
const agentStore = useAgentStore();
const route = useRoute();
const { currentTheme } = useTheme();

// 组件状态
const isPreview = ref(true);
const componentToRender = shallowRef<Component | null>(null);

// 从事件载荷中提取的 props
const componentProps = ref<Record<string, any>>({ isDetached: true });

// 当前组件 ID
const currentComponentId = ref<string>('');

// 组件注册表
const componentRegistry: Record<string, () => Promise<Component>> = {
  "chat-input": () => import("../tools/llm-chat/components/MessageInput.vue"),
  "chat-area": () => import("../tools/llm-chat/components/ChatArea.vue"),
  // 未来可添加其他可分离的组件
};

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
  const { initializeSyncBus, requestInitialState } = useWindowSyncBus();
  initializeSyncBus();

  // 初始化分离窗口管理器，以便能正确检测其他组件的分离状态
  const { initialize } = useDetachedManager();
  await initialize();

  logger.info("DetachedComponentContainer 挂载", {
    currentPath: route.path,
  });
  
  // 加载智能体数据（用于 ChatArea 显示智能体信息）
  agentStore.loadAgents();
  logger.info("智能体数据已加载", { agentCount: agentStore.agents.length });

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
        const { id, ...props } = config;
        currentComponentId.value = id;
        
        // 为不同组件提供默认 props
        const defaultProps: Record<string, any> = { isDetached: true };
        
        if (id === 'chat-input') {
          // MessageInput 需要的默认 props
          defaultProps.disabled = false;
          defaultProps.isSending = false;
        } else if (id === 'chat-area') {
          // ChatArea 需要的默认 props（这些会被同步引擎覆盖）
          defaultProps.messages = [];
          defaultProps.isSending = false;
          defaultProps.disabled = true;
        }
        
        componentProps.value = { ...defaultProps, ...props };
        
        logger.info('组件 props 已初始化', {
          id,
          props: componentProps.value
        });

        // 加载组件
        logger.info("准备加载组件", {
          id,
          availableComponents: Object.keys(componentRegistry),
        });
        if (id && componentRegistry[id]) {
          logger.info("正在加载组件", { id });
          componentToRender.value = defineAsyncComponent(componentRegistry[id]);
          logger.info("组件加载成功", { id });
        } else {
          logger.error("未找到或未注册可分离的组件", {
            id,
            registered: Object.keys(componentRegistry),
            });
          }
 
         // 在组件被赋值后，请求初始状态，确保同步引擎已准备好接收
         requestInitialState();
         logger.info("已发送初始状态请求");
 
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
    <!-- 组件渲染区域 -->
    <div class="component-wrapper">
      <component
        v-if="componentToRender"
        :is="componentToRender"
        v-bind="componentProps"
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
/* 参考 DragIndicator 的透明实现 */
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
