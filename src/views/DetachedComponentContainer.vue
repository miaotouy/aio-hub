<script setup lang="ts">
import { ref, shallowRef, onMounted, type Component, watch } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { useRoute } from "vue-router";
import { useTheme } from "../composables/useTheme";
import { createModuleLogger } from "../utils/logger";
import { getDetachableComponentConfig, loadDetachableComponent } from "../config/detachable-components";
import { useAppInitStore } from "../stores/appInitStore";
import { useRootInit } from "../composables/useRootInit";
import { useDetachedPreview } from "../composables/useDetachedPreview";
import DetachPreviewHint from "../components/common/DetachPreviewHint.vue";
import GlobalProviders from "../components/GlobalProviders.vue";
import { createModuleErrorHandler, ErrorLevel } from "../utils/errorHandler";

const logger = createModuleLogger("DetachedComponentContainer");
const errorHandler = createModuleErrorHandler("DetachedComponentContainer");

const route = useRoute();
const { currentTheme } = useTheme();
const appInitStore = useAppInitStore();

defineOptions({
  name: "DetachedComponentContainer",
});

// 初始化根组件逻辑
useRootInit({ isDetachedComponent: true });

// 初始化预览/固定模式逻辑
const { isPreview } = useDetachedPreview();

// 组件状态
const componentToRender = shallowRef<Component | null>(null);

// 从逻辑钩子获取的 props 和 listeners
const componentProps = ref<Record<string, any>>({});
const componentEventListeners = ref<Record<string, any>>({});

// 当前组件 ID
const currentComponentId = ref<string>("");

onMounted(async () => {
  // 解析优先级工具 ID
  const parts = window.location.pathname.split("/");
  const lastPart = parts[parts.length - 1];
  let priorityToolId: string | undefined;
  if (lastPart && lastPart.includes(":")) {
    priorityToolId = lastPart.split(":")[0];
  } else if (lastPart) {
    priorityToolId = lastPart;
  }

  // 初始化分离应用
  await appInitStore.initDetachedApp(priorityToolId);

  // 从 URL 查询参数加载组件配置
  const loadComponentFromRoute = () => {
    if (route.query.config && typeof route.query.config === "string") {
      try {
        const config = JSON.parse(route.query.config);
        logger.info("从路由参数解析到组件配置", { config });

        const { id } = config;
        currentComponentId.value = id;

        const componentConfig = getDetachableComponentConfig(id);

        if (componentConfig) {
          if (componentConfig.initializeEnvironment) {
            componentConfig.initializeEnvironment();
          }

          componentToRender.value = loadDetachableComponent(id);

          const logicResult = componentConfig.logicHook();
          componentProps.value = logicResult.props.value;
          componentEventListeners.value = logicResult.listeners;

          watch(
            logicResult.props,
            (newProps) => {
              componentProps.value = newProps;
            },
            { deep: true },
          );

          logger.info("组件加载成功", { id });
        } else {
          errorHandler.handle(new Error(`未找到或未注册可分离的组件: ${id}`), {
            userMessage: "未找到或未注册可分离的组件",
            context: { id },
            showToUser: false,
            level: ErrorLevel.ERROR,
          });
        }
      } catch (error) {
        errorHandler.handle(error, {
          userMessage: "解析路由中的组件配置失败",
          context: { config: route.query.config },
          showToUser: false,
          level: ErrorLevel.ERROR,
        });
      }
    }
  };

  // 初始加载组件
  loadComponentFromRoute();

  logger.info("DetachedComponentContainer 初始化完成");
});
</script>

<template>
  <div
    class="detached-component-container"
    :class="[`theme-${currentTheme}`, { 'preview-mode': isPreview, 'final-mode': !isPreview }]"
  >
    <GlobalProviders>
      <template v-if="appInitStore.isReady">
        <!-- 组件渲染区域 -->
        <div class="component-wrapper">
          <Suspense v-if="componentToRender">
            <component :is="componentToRender" v-bind="componentProps" v-on="componentEventListeners" />
            <template #fallback>
              <div class="loading-message">
                <el-icon class="is-loading"><Loading /></el-icon>
                <p>组件加载中...</p>
              </div>
            </template>
          </Suspense>
          <div v-else class="error-message">
            <h2>组件加载失败</h2>
            <p v-if="currentComponentId">
              无法找到ID为 "<strong>{{ currentComponentId }}</strong
              >" 的组件。
            </p>
            <p v-else>未指定要加载的组件ID。</p>
          </div>

          <!-- 预览模式提示 -->
          <DetachPreviewHint :visible="isPreview" />
        </div>
      </template>
      <div v-else class="loading-message">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>{{ appInitStore.statusText }}</p>
      </div>
    </GlobalProviders>
  </div>
</template>

<style scoped>
.detached-component-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  overflow: visible;
  pointer-events: none;
  gap: 8px;
  padding: 32px;
  box-sizing: border-box;
}

.preview-mode {
  opacity: 0.5;
}

.final-mode {
  opacity: 1;
}

.component-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.loading-message {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  height: 100%;
  color: var(--text-color);
}

.loading-message .el-icon {
  font-size: 32px;
}

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
