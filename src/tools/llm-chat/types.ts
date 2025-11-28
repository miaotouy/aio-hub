/**
 * @file LLM Chat 模块的类型定义 - 统一导出
 * @description
 * 该文件作为类型定义的入口点，将 `types` 目录下的所有类型模块统一导出。
 * 这样做的好处是：
 * 1. 保持了原有 `import ... from '@/tools/llm-chat/types'` 路径的兼容性。
 * 2. 内部类型文件可以按逻辑拆分，提高了可维护性。
 *
 * @see src/tools/llm-chat/types/index.ts
 */
export * from './types/index';
