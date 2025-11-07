/**
 * 功能性宏集合
 * 提供随机选择、掷骰子、文本处理等功能
 */

import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';

/**
 * 简单的哈希函数（用于 pick 宏的稳定选择）
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash);
}

/**
 * 注册功能性宏
 */
export function registerFunctionMacros(registry: MacroRegistry): void {
  const functionMacros: MacroDefinition[] = [
    // 随机选择
    {
      name: 'random',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '从提供的选项中随机选择一个',
      example: '{{random::选项A::选项B::选项C}}',
      acceptsArgs: true,
      priority: 85,
      execute: (_context, args) => {
        if (!args || args.length === 0) {
          return '[错误: random 需要至少1个参数]';
        }
        const randomIndex = Math.floor(Math.random() * args.length);
        return args[randomIndex];
      },
    },

    // 稳定选择（基于会话内容的哈希）
    {
      name: 'pick',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '基于当前会话内容稳定地选择一个选项（同一会话始终返回相同结果）',
      example: '{{pick::选项A::选项B::选项C}}',
      acceptsArgs: true,
      priority: 80,
      execute: (context, args) => {
        if (!args || args.length === 0) {
          return '[错误: pick 需要至少1个参数]';
        }
        // 使用会话ID或最后一条消息作为种子
        const seed = context.session?.id || context.lastMessage || '';
        const hash = simpleHash(seed);
        const index = hash % args.length;
        return args[index];
      },
    },

    // 掷骰子
    {
      name: 'roll',
      type: MacroType.FUNCTION,
      phase: MacroPhase.PRE_PROCESS,
      description: '掷骰子（格式：NdM，如 1d20 表示掷1个20面骰子）',
      example: '{{roll::1d20}}',
      acceptsArgs: true,
      argCount: 1,
      priority: 75,
      execute: (_context, args) => {
        if (!args || args.length === 0) {
          return '[错误: roll 需要1个参数]';
        }
        
        const diceNotation = args[0].toLowerCase();
        const match = diceNotation.match(/^(\d+)d(\d+)$/);
        
        if (!match) {
          return '[错误: 无效的骰子格式，应为 NdM]';
        }
        
        const count = parseInt(match[1], 10);
        const sides = parseInt(match[2], 10);
        
        if (count <= 0 || count > 100) {
          return '[错误: 骰子数量必须在 1-100 之间]';
        }
        
        if (sides <= 0 || sides > 1000) {
          return '[错误: 骰子面数必须在 1-1000 之间]';
        }
        
        let total = 0;
        const rolls: number[] = [];
        
        for (let i = 0; i < count; i++) {
          const roll = Math.floor(Math.random() * sides) + 1;
          rolls.push(roll);
          total += roll;
        }
        
        // 如果只掷一个骰子，直接返回结果
        if (count === 1) {
          return total.toString();
        }
        
        // 多个骰子时，返回详细结果
        return `${total} (${rolls.join(', ')})`;
      },
    },

    // 换行符
    {
      name: 'newline',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '插入换行符',
      example: '第一行{{newline}}第二行',
      acceptsArgs: false,
      priority: 100,
      execute: () => '\n',
    },

    // 移除换行符
    {
      name: 'trim',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '移除此宏所在位置前后的所有换行符，用于清理格式',
      example: '文本{{trim}}文本',
      acceptsArgs: false,
      priority: 95,
      execute: () => {
        // trim 的实际处理需要在后处理阶段特殊处理
        // 这里返回一个特殊标记，由后处理器识别并处理
        return '__TRIM__';
      },
    },

    // 随机数
    {
      name: 'randomInt',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '生成指定范围内的随机整数',
      example: '{{randomInt::1::100}}',
      acceptsArgs: true,
      argCount: 2,
      priority: 70,
      execute: (_context, args) => {
        if (!args || args.length < 2) {
          return '[错误: randomInt 需要2个参数]';
        }
        
        const min = parseInt(args[0], 10);
        const max = parseInt(args[1], 10);
        
        if (isNaN(min) || isNaN(max)) {
          return '[错误: 参数必须是有效的整数]';
        }
        
        if (min >= max) {
          return '[错误: 最小值必须小于最大值]';
        }
        
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return result.toString();
      },
    },

    // 重复文本
    {
      name: 'repeat',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '重复指定的文本N次',
      example: '{{repeat::Hello::3}}',
      acceptsArgs: true,
      argCount: 2,
      priority: 65,
      execute: (_context, args) => {
        if (!args || args.length < 2) {
          return '[错误: repeat 需要2个参数]';
        }
        
        const text = args[0];
        const count = parseInt(args[1], 10);
        
        if (isNaN(count) || count < 0) {
          return '[错误: 重复次数必须是非负整数]';
        }
        
        if (count > 1000) {
          return '[错误: 重复次数不能超过1000]';
        }
        
        return text.repeat(count);
      },
    },
  ];

  registry.registerMany(functionMacros);
}