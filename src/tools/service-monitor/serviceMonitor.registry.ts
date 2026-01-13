import type { ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { Menu } from '@element-plus/icons-vue';

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '服务注册表浏览器',
  path: '/service-monitor',
  icon: markRaw(Menu),
  component: () => import('./ServiceMonitor.vue'),
  description: '可视化查看和浏览所有已注册的工具服务及其元数据',
  category: '开发工具'
};