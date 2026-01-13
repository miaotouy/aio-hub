import type { ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import RichTextRendererIcon from '@/components/icons/RichTextRendererIcon.vue';

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '富文本渲染测试',
  path: '/rich-text-renderer-tester',
  icon: markRaw(RichTextRendererIcon),
  component: () => import('./components/RichTextRendererTester.vue'),
  description: '测试 Markdown 富文本渲染，支持流式输出模拟',
  category: '开发工具'
};