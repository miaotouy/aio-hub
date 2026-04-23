<script setup lang="ts">
import { computed, onMounted, shallowRef, defineAsyncComponent, type Component, watch } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { useRoute } from "vue-router";
import { useTheme } from "../composables/useTheme";
import { createModuleLogger } from "../utils/logger";
import { useToolsStore } from "../stores/tools";
import { useAppInitStore } from "../stores/appInitStore";
import { useRootInit } from "../composables/useRootInit";
import { useDetachedPreview } from "../composables/useDetachedPreview";
import TitleBar from "../components/TitleBar.vue";
import DetachPreviewHint from "../components/common/DetachPreviewHint.vue";
import GlobalProviders from "../components/GlobalProviders.vue";
import { createModuleErrorHandler } from "../utils/errorHandler";

const logger = createModuleLogger("DetachedWindowContainer");
const errorHandler = createModuleErrorHandler("DetachedWindowContainer");

const route = useRoute();
const { currentTheme } = useTheme();
const toolsStore = useToolsStore();
const appInitStore = useAppInitStore();

defineOptions({
  name: "DetachedWindowContainer",
});

// 初始化根组件逻辑
useRootInit();

// 初始化预览/固定模式逻辑
const { isPreview } = useDetachedPreview();

// 从路由参数获取工具路径
const toolPath = computed(() => `/${route.params.toolPath as string}`);

// 从工具配置中查找对应的工具
const toolConfig = computed(() => toolsStore.tools.find((t) => t.path === toolPath.value));

// 工具标题
const toolTitle = computed(() => toolConfig.value?.name || "工具窗口");

// 工具图标
const toolIcon = computed(() => toolConfig.value?.icon);

// 动态加载的工具组件
const toolComponent = shallowRef<Component | null>(null);

// 判断是否需要显示标题栏
const showTitleBar = computed(() => true);

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

  // 监听 tools store 的就绪状态
  watch(
    () => toolsStore.isReady,
    (isReady) => {
      if (isReady) {
        logger.info("Tools store 已就绪，开始加载工具组件");
        const config = toolConfig.value;
        if (config) {
          try {
            logger.info("加载工具组件", { toolPath: toolPath.value, toolName: config.name });
            toolComponent.value = defineAsyncComponent(config.component);
          } catch (error) {
            errorHandler.handle(error, {
              userMessage: "加载工具组件失败",
              context: { toolPath: toolPath.value },
              showToUser: false,
            });
          }
        } else {
          errorHandler.handle(new Error(`未找到工具配置: ${toolPath.value}`), {
            userMessage: "未找到工具配置",
            context: { toolPath: toolPath.value },
            showToUser: false,
          });
        }
      }
    },
    { immediate: true },
  );

  logger.info("DetachedWindowContainer 初始化完成");
});
</script>

<template>
  <div
    class="detached-container"
    :class="[`theme-${currentTheme}`, { 'preview-mode': isPreview, 'final-mode': !isPreview }]"
  >
    <!-- 预览模式提示 -->
    <DetachPreviewHint :visible="isPreview" />
    <GlobalProviders>
      <template v-if="appInitStore.isReady">
        <TitleBar v-if="showTitleBar" :title="toolTitle" :icon="toolIcon" />

        <div class="tool-content" :class="{ 'no-titlebar': !showTitleBar }">
          <Suspense v-if="toolComponent">
            <component :is="toolComponent" />
            <template #fallback>
              <div class="loading-message">
                <el-icon class="is-loading"><Loading /></el-icon>
                <p>组件加载中...</p>
              </div>
            </template>
          </Suspense>
          <div v-else class="loading-message">
            <p>加载中...</p>
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
  padding-top: var(--titlebar-height);
}

.tool-content.no-titlebar {
  padding-top: 0;
}

.preview-mode {
  opacity: 0.5;
}

.final-mode {
  opacity: 1;
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
</style>
