<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { useTheme } from "@/composables/useTheme";
import { createModuleLogger } from "@/utils/logger";
import { useAppInitStore } from "@/stores/appInitStore";
import { useRootInit } from "@/composables/useRootInit";
import GlobalProviders from "@/components/GlobalProviders.vue";
import { useCanvasStateConsumer } from "../../composables/useCanvasStateConsumer";
import CanvasWindow from "./CanvasWindow.vue";

const logger = createModuleLogger("CanvasWindowContainer");
const { currentTheme } = useTheme();
const appInitStore = useAppInitStore();

defineOptions({
  name: "CanvasWindowContainer",
});

// 初始化根组件逻辑（画布窗口作为独立根组件挂载，需要初始化主题外观等）
useRootInit({ isDetachedComponent: true });

const canvasId = ref<string>("");

onMounted(async () => {
  // 从 URL 路径直接获取 canvasId（因为作为根组件挂载时 route.params 为空）
  const pathParts = window.location.pathname.split("/");
  canvasId.value = pathParts[pathParts.length - 1] || "";

  // 初始化应用环境（确保 Pinia 等 Store 可用）
  // 画布属于 canvas 工具，所以传入 canvas 作为 priorityToolId
  await appInitStore.initDetachedApp("canvas");

  // 初始化画布状态同步消费者
  // 这会监听来自主窗口的同步总线事件
  useCanvasStateConsumer();

  logger.info("CanvasWindowContainer 初始化完成", { canvasId: canvasId.value });
});
</script>

<template>
  <div class="canvas-window-container" :class="[`theme-${currentTheme}`]">
    <GlobalProviders>
      <template v-if="appInitStore.isReady">
        <div class="component-wrapper">
          <CanvasWindow v-if="canvasId" :canvas-id="canvasId" />
          <div v-else class="error-message">
            <h2>参数缺失</h2>
            <p>未指定要加载的画布 ID。</p>
          </div>
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
.canvas-window-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  overflow: visible;
  box-sizing: border-box;
}

.component-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
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
</style>
