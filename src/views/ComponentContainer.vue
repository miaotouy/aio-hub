<script setup lang="ts">
import { shallowRef, onMounted, computed, defineAsyncComponent, Component } from 'vue';
import { useRoute } from 'vue-router';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('ComponentContainer');
const route = useRoute();
const componentToRender = shallowRef<Component | null>(null);

// 从路由查询中提取组件 props，排除保留的键
const componentProps = computed(() => {
  const { componentId, ...props } = route.query;
  return props;
});

// 组件注册表：将组件 ID 映射到其动态导入函数
// 这是可拖拽组件的安全注册中心
const componentRegistry: Record<string, () => Promise<Component>> = {
  'chat-input': () => import('../tools/llm-chat/components/MessageInput.vue'),
  // 未来可以在此添加其他可拖拽的组件
  // 'message-list': () => import('../tools/llm-chat/components/MessageList.vue'),
};

onMounted(() => {
  const componentId = route.query.componentId as string;
  if (componentId && componentRegistry[componentId]) {
    logger.info('正在加载组件', { componentId, props: componentProps.value });
    componentToRender.value = defineAsyncComponent(componentRegistry[componentId]);
  } else {
    logger.error('未找到或未注册可分离的组件', { componentId });
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
      <p v-if="route.query.componentId">
        无法找到ID为 "<strong>{{ route.query.componentId }}</strong>" 的组件。
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