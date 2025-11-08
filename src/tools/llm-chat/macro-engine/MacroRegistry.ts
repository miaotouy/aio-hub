/**
 * 宏注册中心
 * 管理所有可用宏的注册、查询和元数据
 */

import { reactive } from 'vue';
import type { MacroContext } from './MacroContext';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/macro-registry');

/**
 * 宏执行阶段
 */
export enum MacroPhase {
  /** 预处理阶段：处理状态变更宏（如 setvar, incvar） */
  PRE_PROCESS = 'pre-process',
  /** 替换阶段：替换静态值（如 {{user}}, {{char}}） */
  SUBSTITUTE = 'substitute',
  /** 后处理阶段：执行动态函数（如 {{time}}, {{random}}） */
  POST_PROCESS = 'post-process',
}

/**
 * 宏类型
 */
export enum MacroType {
  /** 简单值替换 */
  VALUE = 'value',
  /** 需要执行的函数 */
  FUNCTION = 'function',
  /** 变量操作 */
  VARIABLE = 'variable',
}

/**
 * 宏定义
 */
export interface MacroDefinition {
  /** 宏名称（不带 {{}}） */
  name: string;
  /** 宏类型 */
  type: MacroType;
  /** 执行阶段 */
  phase: MacroPhase;
  /** 宏描述（用于文档和提示） */
  description: string;
  /** 使用示例 */
  example?: string;
  /** 是否接受参数 */
  acceptsArgs: boolean;
  /** 参数数量（undefined 表示可变参数） */
  argCount?: number;
  /** 优先级（用于自动补全排序） */
  priority?: number;
  /** 执行函数 */
  execute: (context: MacroContext, args?: string[]) => string | Promise<string>;
}

/**
 * 宏注册中心（单例）
 */
export class MacroRegistry {
  private static instance: MacroRegistry;
  private macros: Map<string, MacroDefinition> = reactive(new Map());

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): MacroRegistry {
    if (!MacroRegistry.instance) {
      MacroRegistry.instance = new MacroRegistry();
    }
    return MacroRegistry.instance;
  }

  /**
   * 注册宏
   */
  register(macro: MacroDefinition): void {
    if (this.macros.has(macro.name)) {
      logger.warn('宏已存在，将被覆盖', { name: macro.name });
    }
    this.macros.set(macro.name, macro);
    logger.debug('注册宏', { name: macro.name, type: macro.type, phase: macro.phase });
  }

  /**
   * 批量注册宏
   */
  registerMany(macros: MacroDefinition[]): void {
    macros.forEach(macro => this.register(macro));
  }

  /**
   * 获取宏定义
   */
  getMacro(name: string): MacroDefinition | undefined {
    return this.macros.get(name);
  }

  /**
   * 获取所有宏
   */
  getAllMacros(): MacroDefinition[] {
    return Array.from(this.macros.values());
  }

  /**
   * 按阶段获取宏
   */
  getMacrosByPhase(phase: MacroPhase): MacroDefinition[] {
    return Array.from(this.macros.values()).filter(m => m.phase === phase);
  }

  /**
   * 按类型获取宏
   */
  getMacrosByType(type: MacroType): MacroDefinition[] {
    return Array.from(this.macros.values()).filter(m => m.type === type);
  }

  /**
   * 检查宏是否存在
   */
  hasMacro(name: string): boolean {
    return this.macros.has(name);
  }

  /**
   * 取消注册宏
   */
  unregister(name: string): boolean {
    const existed = this.macros.has(name);
    if (existed) {
      this.macros.delete(name);
      logger.debug('取消注册宏', { name });
    }
    return existed;
  }

  /**
   * 清空所有宏
   */
  clear(): void {
    this.macros.clear();
    logger.info('清空所有宏注册');
  }

  /**
   * 获取宏数量
   */
  get count(): number {
    return this.macros.size;
  }
}

/**
 * 获取全局宏注册中心实例
 */
export function getMacroRegistry(): MacroRegistry {
  return MacroRegistry.getInstance();
}