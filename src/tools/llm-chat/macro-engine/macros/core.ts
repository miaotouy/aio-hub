/**
 * 核心宏集合
 * 提供基础的值替换宏（如 {{user}}, {{char}} 等）
 */

import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';

/**
 * 注册核心宏
 */
export function registerCoreMacros(registry: MacroRegistry): void {
  const coreMacros: MacroDefinition[] = [
    // 用户名称
    {
      name: 'user',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '当前用户的名称',
      example: '{{user}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context) => context.userName || 'User',
    },

    // 角色名称
    {
      name: 'char',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '当前角色（智能体）的名称',
      example: '{{char}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context) => context.charName || 'Assistant',
    },

    // 用户档案
    {
      name: 'persona',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '当前用户档案的内容',
      example: '{{persona}}',
      acceptsArgs: false,
      priority: 80,
      supported: true,
      contextFree: false,
      execute: (context) => context.userProfile || '',
    },

    // 角色描述
    {
      name: 'description',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '角色的描述信息',
      example: '{{description}}',
      acceptsArgs: false,
      priority: 70,
      supported: true,
      contextFree: false,
      execute: (context) => context.charDescription || '',
    },

    // 角色性格（未实现）
    {
      name: 'personality',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '角色的性格特征（尚未实现）',
      example: '{{personality}}',
      acceptsArgs: false,
      priority: 70,
      supported: false,
      contextFree: false,
      execute: (context) => context.charPersonality || '',
    },

    // 场景（未实现）
    {
      name: 'scenario',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '当前对话场景（尚未实现）',
      example: '{{scenario}}',
      acceptsArgs: false,
      priority: 60,
      supported: false,
      contextFree: false,
      execute: (context) => context.scenario || '',
    },

    // 对话示例（未实现）
    {
      name: 'mesExamples',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '角色的对话示例（尚未实现）',
      example: '{{mesExamples}}',
      acceptsArgs: false,
      priority: 50,
      supported: false,
      contextFree: false,
      execute: (context) => context.mesExamples || '',
    },

    // 最后一条消息
    {
      name: 'lastMessage',
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: '会话中的最后一条消息',
      example: '{{lastMessage}}',
      acceptsArgs: false,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context) => context.lastMessage || '',
    },

    // 最后一条用户消息
    {
      name: 'lastUserMessage',
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: '会话中的最后一条用户消息',
      example: '{{lastUserMessage}}',
      acceptsArgs: false,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context) => context.lastUserMessage || '',
    },

    // 最后一条角色消息
    {
      name: 'lastCharMessage',
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: '会话中的最后一条角色消息',
      example: '{{lastCharMessage}}',
      acceptsArgs: false,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context) => context.lastCharMessage || '',
    },

    // 当前输入（未实现）
    {
      name: 'input',
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: '当前输入框中的内容（尚未实现）',
      example: '{{input}}',
      acceptsArgs: false,
      priority: 75,
      supported: false,
      contextFree: false,
      execute: (context) => context.input || '',
    },
  ];

  registry.registerMany(coreMacros);
}