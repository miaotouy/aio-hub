import type { ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { BookMarked } from 'lucide-vue-next';

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: 'ST 世界书编辑器',
  path: '/st-worldbook-editor',
  icon: markRaw(BookMarked),
  component: () => import('./StWorldbookEditor.vue'),
  description: 'SillyTavern 格式世界书编辑器',
  category: 'AI 工具'
};