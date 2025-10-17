<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent, type Component, watch } from 'vue';
import { useRoute } from 'vue-router';
import { listen } from '@tauri-apps/api/event';
import { useTheme } from '../composables/useTheme';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('DetachedComponentContainer');
const route = useRoute();
const { currentTheme } = useTheme();

// 组件状态
const isPreview = ref(true);
const componentToRender = ref<Component | null>(null);

// 从事件载荷中提取的 props
const componentProps = ref<Record<string, any>>({ isDetached: true });


// 组件注册表
const componentRegistry: Record<string, () => Promise<Component>> = {
  'chat-input': () => import('../tools/llm-chat/components/MessageInput.vue'),
  // 未来可添加其他可分离的组件
};

// 路由变化监听
watch(() => route.path, (newPath, oldPath) => {
  logger.info('路由发生变化', { from: oldPath, to: newPath, query: route.query });
}, { immediate: true });

watch(() => route.query, (newQuery, oldQuery) => {
  logger.info('路由查询参数发生变化', {
    from: oldQuery,
    to: newQuery,
    componentId: newQuery.componentId,
    mode: newQuery.mode
  });
}, { immediate: true, deep: true });

onMounted(async () => {
  logger.info('DetachedComponentContainer 挂载', {
    currentPath: route.path,
  });

  // 从 URL 查询参数加载组件配置
  const loadComponentFromRoute = () => {
    if (route.query.config && typeof route.query.config === 'string') {
      try {
        const config = JSON.parse(route.query.config);
        logger.info('从路由参数解析到组件配置', { config });

        const { componentId, ...props } = config;
        componentProps.value = { ...props, isDetached: true };

        // 初始模式总是 preview
        isPreview.value = true;
        logger.info('设置预览模式', { isPreview: isPreview.value });

        // 加载组件
        logger.info('准备加载组件', { componentId, availableComponents: Object.keys(componentRegistry) });
        if (componentId && componentRegistry[componentId]) {
          logger.info('正在加载组件', { componentId, mode: 'preview' });
          componentToRender.value = defineAsyncComponent(componentRegistry[componentId]);
          logger.info('组件加载成功', { componentId });
        } else {
          logger.error('未找到或未注册可分离的组件', {
            componentId,
            registered: Object.keys(componentRegistry),
          });
        }
      } catch (error) {
        logger.error('解析路由中的组件配置失败', { error, config: route.query.config });
      }
    } else {
      logger.warn('路由参数中未找到组件配置', { query: route.query });
    }
  };

  // 初始加载
  loadComponentFromRoute();

  // 监听固定事件
  await listen('finalize-component-view', () => {
    logger.info('收到固定事件，切换到最终模式');
    isPreview.value = false;
  });
  
  logger.info('DetachedComponentContainer 初始化完成，等待事件...');
});
</script>

<template>
  <div class="detached-component-container" :class="[`theme-${currentTheme}`, { 'preview-mode': isPreview, 'final-mode': !isPreview }]">
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
          无法找到ID为 "<strong>{{ route.query.componentId }}</strong>" 的组件。
        </p>
        <p v-else>未指定要加载的组件ID。</p>
      </div>
      
      <!-- 预览模式提示 -->
      <div v-if="isPreview" class="preview-hint">
        <div class="hint-content">
          📌 松手即可创建独立窗口
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detached-component-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

/* 预览模式样式 */
.preview-mode {
  opacity: 0.85;
  background: var(--bg-color);
  border: 2px dashed var(--primary-color);
  border-radius: 8px;
}

/* 最终模式样式 */
.final-mode {
  opacity: 1;
  border: none;
}

.component-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.component-wrapper.with-titlebar {
  padding-top: 32px;
}

/* 预览提示 */
.preview-hint {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
}

.hint-content {
  background: var(--primary-color);
  color: white;
  padding: 6px 16px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
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