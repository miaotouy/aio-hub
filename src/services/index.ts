/**
 * 服务层统一导出文件
 * 
 * 此文件提供了对服务层所有核心模块的统一访问入口。
 */

// 导出类型定义
export type { ToolRegistry } from './types';
export type { ToolCall, ServiceResult } from './executor';

// 导出工具注册表单例
export { toolRegistryManager } from './registry';

// 导出自动注册函数
export { autoRegisterServices } from './auto-register';

// 导出统一执行器
export { execute, executeMany } from './executor';