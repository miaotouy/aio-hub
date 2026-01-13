import type { ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { Layers } from 'lucide-vue-next';

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: 'Embedding 测试',
  path: '/embedding-playground',
  icon: markRaw(Layers),
  component: () => import('./EmbeddingPlayground.vue'),
  description: 'Embedding API 调试工具，支持相似度对比和语义检索模拟',
  category: '开发工具'
};