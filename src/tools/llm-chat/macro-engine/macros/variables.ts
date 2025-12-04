/**
 * 变量操作宏集合
 * 提供局部和全局变量的读写操作
 */

import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';

/**
 * 注册变量操作宏
 */
export function registerVariableMacros(registry: MacroRegistry): void {
  const variableMacros: MacroDefinition[] = [
    // 设置局部变量
    {
      name: 'setvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.PRE_PROCESS,
      description: '设置会话级别的局部变量',
      example: '{{setvar::counter::0}}',
      acceptsArgs: true,
      argCount: 2,
      priority: 95,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 2) {
          return '[错误: setvar 需要2个参数]';
        }
        const [varName, value] = args;
        // 尝试将值转换为数字
        const numValue = Number(value);
        context.variables.set(varName, isNaN(numValue) ? value : numValue);
        return ''; // 状态变更宏不返回可见内容
      },
    },

    // 获取局部变量
    {
      name: 'getvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.SUBSTITUTE,
      description: '获取会话级别的局部变量值',
      example: '{{getvar::counter}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return '[错误: getvar 需要1个参数]';
        }
        const varName = args[0];
        const value = context.variables.get(varName);
        return value !== undefined ? String(value) : '';
      },
    },

    // 增加局部变量（自增）
    {
      name: 'incvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.PRE_PROCESS,
      description: '将局部变量的值加1',
      example: '{{incvar::counter}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return '[错误: incvar 需要1个参数]';
        }
        const varName = args[0];
        const currentValue = context.variables.get(varName);
        const numValue = typeof currentValue === 'number' ? currentValue : Number(currentValue) || 0;
        context.variables.set(varName, numValue + 1);
        return ''; // 状态变更宏不返回可见内容
      },
    },

    // 减少局部变量（自减）
    {
      name: 'decvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.PRE_PROCESS,
      description: '将局部变量的值减1',
      example: '{{decvar::counter}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return '[错误: decvar 需要1个参数]';
        }
        const varName = args[0];
        const currentValue = context.variables.get(varName);
        const numValue = typeof currentValue === 'number' ? currentValue : Number(currentValue) || 0;
        context.variables.set(varName, numValue - 1);
        return ''; // 状态变更宏不返回可见内容
      },
    },

    // 设置全局变量
    {
      name: 'setglobalvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.PRE_PROCESS,
      description: '设置应用级别的全局变量',
      example: '{{setglobalvar::theme::dark}}',
      acceptsArgs: true,
      argCount: 2,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 2) {
          return '[错误: setglobalvar 需要2个参数]';
        }
        const [varName, value] = args;
        // 尝试将值转换为数字
        const numValue = Number(value);
        context.globalVariables.set(varName, isNaN(numValue) ? value : numValue);
        return ''; // 状态变更宏不返回可见内容
      },
    },

    // 获取全局变量
    {
      name: 'getglobalvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.SUBSTITUTE,
      description: '获取应用级别的全局变量值',
      example: '{{getglobalvar::theme}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return '[错误: getglobalvar 需要1个参数]';
        }
        const varName = args[0];
        const value = context.globalVariables.get(varName);
        return value !== undefined ? String(value) : '';
      },
    },

    // 增加全局变量
    {
      name: 'incglobalvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.PRE_PROCESS,
      description: '将全局变量的值加1',
      example: '{{incglobalvar::counter}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 80,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return '[错误: incglobalvar 需要1个参数]';
        }
        const varName = args[0];
        const currentValue = context.globalVariables.get(varName);
        const numValue = typeof currentValue === 'number' ? currentValue : Number(currentValue) || 0;
        context.globalVariables.set(varName, numValue + 1);
        return ''; // 状态变更宏不返回可见内容
      },
    },

    // 减少全局变量
    {
      name: 'decglobalvar',
      type: MacroType.VARIABLE,
      phase: MacroPhase.PRE_PROCESS,
      description: '将全局变量的值减1',
      example: '{{decglobalvar::counter}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 80,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return '[错误: decglobalvar 需要1个参数]';
        }
        const varName = args[0];
        const currentValue = context.globalVariables.get(varName);
        const numValue = typeof currentValue === 'number' ? currentValue : Number(currentValue) || 0;
        context.globalVariables.set(varName, numValue - 1);
        return ''; // 状态变更宏不返回可见内容
      },
    },
  ];

  registry.registerMany(variableMacros);
}
