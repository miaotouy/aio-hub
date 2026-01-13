import type { ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { FlaskConical } from 'lucide-vue-next';

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '组件测试器',
  path: '/component-tester',
  icon: markRaw(FlaskConical),
  component: () => import('./ComponentTester.vue'),
  description: '测试和展示各种 UI 组件、Element Plus 元素、消息提示和主题色板',
  category: '开发工具'
};