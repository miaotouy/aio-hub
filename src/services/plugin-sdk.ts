/**
 * AIO Hub Plugin SDK
 * 
 * 这个文件汇总并导出了所有插件可以使用的公共服务和工具。
 * 它是主应用与插件之间的正式契约。
 */

// 导出执行器
export * from './executor';

// 导出核心类型定义
export type {
  ServiceMetadata,
  MethodMetadata,
  MethodParameter,
  ToolConfig,
  ToolRegistry,
  ToolContext,
  StartupConfig
} from './types';

export type {
  PluginContext,
  PluginProxy,
  PluginManifest,
  PluginSettingsAPI
} from './plugin-types';

// 导出配置服务
export { pluginConfigService } from './plugin-config.service';

// 导出常用工具
export { customMessage } from '@/utils/customMessage';
export { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
export { createModuleLogger, logger } from '@/utils/logger';

// 导出类型定义
export * from './plugin-types';

// 导出 UI 组件
export * as ui from './plugin-ui';

// 你可以在这里添加更多想要暴露给插件的内部服务