<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useLlmChatSync } from '@/tools/llm-chat/composables/useLlmChatSync';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('SyncServiceProvider');
const { windowType } = useWindowSyncBus();
const route = useRoute();

onMounted(() => {
  // 检查是否应该启动同步服务
  //
  // 架构说明：
  // 1. 主窗口 (main) 和 分离的工具窗口 (detached-tool): 启动同步服务作为"状态源头"和"业务处理器"
  //    - 拥有完整的业务逻辑
  //    - 向所有下游窗口（如分离的组件）广播状态
  //    - 处理所有操作请求
  //
  // 2. 分离的组件窗口 (detached-component): 不启动同步服务
  //    - 只接收状态，不广播
  //    - 所有操作代理回父窗口（main 或 detached-tool）
  const shouldStartSync =
    windowType === 'main' ||
    (windowType === 'detached-tool' && route.path.includes('/llm-chat'));

  if (shouldStartSync) {
    logger.info('启动全局同步服务', {
      windowType,
      path: route.path,
      role: '状态源头+业务处理器'
    });
    
    // 启动 LLM Chat 同步服务
    // 该服务现在会自动根据是否存在下游窗口来初始化或清理引擎
    useLlmChatSync();
    
    // 未来可以在这里添加其他工具的同步服务
    // if (route.path.includes('/another-tool')) {
    //   useAnotherToolSync();
    // }
    
    logger.info('全局同步服务已启动');
  } else {
    logger.info(`跳过同步服务启动`, { windowType, path: route.path });
  }
});
</script>

<template>
  <!-- 无渲染组件 - 仅提供服务 -->
</template>