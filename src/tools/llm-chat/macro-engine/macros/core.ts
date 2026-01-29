/**
 * 核心宏集合
 * 提供基础的值替换宏（如 {{user}}, {{char}} 等）
 */

import type { MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import type { MacroDefinition } from "../MacroRegistry";

/**
 * 注册核心宏
 */
export function registerCoreMacros(registry: MacroRegistry): void {
  const coreMacros: MacroDefinition[] = [
    // 用户名称
    {
      name: "user",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前用户的名称",
      example: "{{user}}",
      acceptsArgs: false,
      priority: 200,
      supported: true,
      contextFree: false,
      execute: (context) => context.userName || "User",
    },

    // 智能体名称
    {
      name: "agent",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前智能体的名称",
      example: "{{agent}}",
      acceptsArgs: false,
      priority: 200,
      supported: true,
      contextFree: false,
      execute: (context) => context.charName || "Assistant",
    },

    // 角色名称 (agent宏的酒馆兼容别名)
    {
      name: "char",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前角色（智能体）的名称 (同 {{agent}})",
      example: "{{char}}",
      acceptsArgs: false,
      priority: 200,
      supported: true,
      contextFree: false,
      execute: (context) => context.charName || "Assistant",
    },

    // 用户档案
    {
      name: "persona",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前用户档案的内容",
      example: "{{persona}}",
      acceptsArgs: false,
      priority: 80,
      supported: true,
      contextFree: false,
      execute: (context) => context.userProfile || "",
    },

    // 角色描述
    {
      name: "description",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "角色的描述信息",
      example: "{{description}}",
      acceptsArgs: false,
      priority: 70,
      supported: true,
      contextFree: false,
      execute: (context) => context.charDescription || "",
    },

    // 角色性格（未实现）
    {
      name: "personality",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "角色的性格特征（尚未实现）",
      example: "{{personality}}",
      acceptsArgs: false,
      priority: 70,
      supported: false,
      contextFree: false,
      execute: (context) => context.charPersonality || "",
    },

    // 场景（未实现）
    {
      name: "scenario",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前对话场景（尚未实现）",
      example: "{{scenario}}",
      acceptsArgs: false,
      priority: 60,
      supported: false,
      contextFree: false,
      execute: (context) => context.scenario || "",
    },

    // 对话示例（未实现）
    {
      name: "mesExamples",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "角色的对话示例（尚未实现）",
      example: "{{mesExamples}}",
      acceptsArgs: false,
      priority: 50,
      supported: false,
      contextFree: false,
      execute: (context) => context.mesExamples || "",
    },

    // 最后一条消息
    {
      name: "lastMessage",
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: "会话中的最后一条消息",
      example: "{{lastMessage}}",
      acceptsArgs: false,
      priority: 105,
      supported: true,
      contextFree: false,
      execute: (context) => context.lastMessage || "",
    },

    // 最后一条用户消息
    {
      name: "lastUserMessage",
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: "会话中的最后一条用户消息",
      example: "{{lastUserMessage}}",
      acceptsArgs: false,
      priority: 105,
      supported: true,
      contextFree: false,
      execute: (context) => context.lastUserMessage || "",
    },

    // 最后一条角色消息
    {
      name: "lastCharMessage",
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: "会话中的最后一条角色消息",
      example: "{{lastCharMessage}}",
      acceptsArgs: false,
      priority: 105,
      supported: true,
      contextFree: false,
      execute: (context) => context.lastCharMessage || "",
    },

    // 当前输入
    {
      name: "input",
      type: MacroType.VALUE,
      phase: MacroPhase.POST_PROCESS,
      description: "当前输入内容（或选中的内容）",
      example: "{{input}}",
      acceptsArgs: false,
      priority: 75,
      supported: true,
      contextFree: false,
      execute: (context) => context.input || "",
    },

    // ==================== LLM 模型元数据宏 ====================

    // 模型 ID
    {
      name: "modelId",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前使用的完整模型 ID（例如: openai:gpt-4o）",
      example: "{{modelId}}",
      acceptsArgs: false,
      priority: 150,
      supported: true,
      contextFree: false,
      execute: (context) => context.modelId || context.agent?.modelId || "",
    },

    // 模型名称（显示名称）
    {
      name: "modelName",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前使用的模型显示名称（例如: GPT-4o）",
      example: "{{modelName}}",
      acceptsArgs: false,
      priority: 150,
      supported: true,
      contextFree: false,
      execute: (context) => context.modelName || context.modelId || "",
    },

    // 配置文件 ID
    {
      name: "profileId",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前使用的 LLM 配置文件 ID",
      example: "{{profileId}}",
      acceptsArgs: false,
      priority: 150,
      supported: true,
      contextFree: false,
      execute: (context) => context.profileId || context.agent?.profileId || "",
    },

    // 配置文件名称
    {
      name: "profileName",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前使用的 LLM 配置文件名称（例如: 我的 OpenAI）",
      example: "{{profileName}}",
      acceptsArgs: false,
      priority: 150,
      supported: true,
      contextFree: false,
      execute: (context) => context.profileName || context.profileId || "",
    },

    // 模型提供商类型
    {
      name: "provider",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "当前使用的模型提供商类型（例如: openai）",
      example: "{{provider}}",
      acceptsArgs: false,
      priority: 150,
      supported: true,
      contextFree: false,
      execute: (context) => context.providerType || "",
    },
  ];

  registry.registerMany(coreMacros);
}
