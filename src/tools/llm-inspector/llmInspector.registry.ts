import type { ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { Monitor } from '@element-plus/icons-vue';

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: 'LLM 检查器',
  path: '/llm-inspector',
  icon: markRaw(Monitor),
  component: () => import('./LlmInspector.vue'),
  description: '监听和分析 LLM API 请求，捕获客户端与服务器之间的通信',
  category: '开发工具'
};