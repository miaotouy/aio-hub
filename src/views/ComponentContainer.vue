<script setup lang="ts">
import { shallowRef, onMounted, computed, defineAsyncComponent, Component } from "vue";
import { useRoute } from "vue-router";
import { createModuleLogger } from "../utils/logger";

const logger = createModuleLogger("ComponentContainer");
const route = useRoute();
const componentToRender = shallowRef<Component | null>(null);

// 从路由参数获取组件 ID
const componentId = computed(() => route.params.componentId as string);

// 从查询参数获取组件配置
const componentConfig = computed(() => {
  const configStr = route.query.config as string;
  if (configStr) {
    try {
      return JSON.parse(decodeURIComponent(configStr));
    } catch (error) {
      logger.error("解析组件配置失败", { error, configStr });
      return {};
    }
  }
  return {};
});

// 从配置中提取组件 props（排除系统字段）
const componentProps = computed(() => {
  const {
    id,
    displayName,
    type,
    width,
    height,
    mouseX,
    mouseY,
    handleOffsetX,
    handleOffsetY,
    ...props
  } = componentConfig.value;
  return props;
});

// 组件注册表：将组件 ID 映射到其动态导入函数
// 这是可拖拽组件的安全注册中心
const componentRegistry: Record<string, () => Promise<Component>> = {
  "chat-input": () => import("../tools/llm-chat/components/MessageInput.vue"),
  // 未来可以在此添加其他可拖拽的组件
  // 'message-list': () => import('../tools/llm-chat/components/MessageList.vue'),
};

onMounted(() => {
  const id = componentId.value;
  if (id && componentRegistry[id]) {
    logger.info("正在加载组件", { componentId: id, props: componentProps.value });
    componentToRender.value = defineAsyncComponent(componentRegistry[id]);
  } else {
    logger.error("未找到或未注册可分离的组件", { componentId: id });
  }
});
</script>

<template>
  <div class="component-container">
    <component
      v-if="componentToRender"
      :is="componentToRender"
      v-bind="componentProps"
      :is-detached="true"
    />
    <div v-else class="error-message">
      <h2>组件加载失败</h2>
      <p v-if="componentId">
        无法找到ID为 "<strong>{{ componentId }}</strong
        >" 的组件。
      </p>
      <p v-else>未指定要加载的组件ID。</p>
    </div>
  </div>
</template>

<style scoped>
.component-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
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
</style>
