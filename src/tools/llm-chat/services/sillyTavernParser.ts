/**
 * SillyTavern 格式解析器
 *
 * 负责解析 SillyTavern 的角色卡 (Character Card v2/v3) 和场景/提示文件，
 * 并将它们转换为本应用的 Agent 和 ChatMessageNode 格式。
 */

import { createModuleLogger } from '@/utils/logger';
import type { ChatAgent } from '../types/agent';
import type { ChatMessageNode, InjectionStrategy } from '../types/message';
import type { MessageRole } from '../types/common';
import { SYSTEM_ANCHORS } from '../types/context';
import type { LlmParameters } from '../types/llm';
import { pick } from 'lodash-es';
import type { ChatRegexConfig } from '../types/chatRegex';
import { convertSillyTavernArrayToPreset, type SillyTavernRegexScript } from '../utils/chatRegexUtils';

const logger = createModuleLogger('llm-chat/sillyTavernParser');

// ==================== SillyTavern 类型定义 ====================

/**
 * SillyTavern 角色卡 v2/v3 格式
 * 参考: https://github.com/malfoyslastname/character-card-spec-v2
 */
export interface SillyTavernCharacterCard {
  // v2 顶层字段
  name: string;
  description: string;
  first_mes: string;
  mes_example?: string;
  scenario?: string;
  personality?: string;
  tags?: string[];
  avatar?: string;
  creatorcomment?: string; // v2 creator notes
  regex_scripts?: SillyTavernRegexScript[]; // v2 regex scripts
  // v3 spec 标识
  spec?: 'chara_card_v2' | 'chara_card_v3';
  spec_version?: string;
  // v3 data 对象 (包含所有核心数据)
  data?: {
    name: string;
    description: string;
    first_mes: string;
    mes_example?: string;
    scenario?: string;
    personality?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    creator_notes?: string; // v3 creator notes
    tags?: string[];
    creator?: string;
    character_version?: string;
    alternate_greetings?: string[];
    extensions?: {
      talkativeness?: string;
      fav?: boolean;
      world?: string;
      depth_prompt?: {
        prompt: string;
        depth: number;
        role: MessageRole;
      };
      regex_scripts?: SillyTavernRegexScript[];
    };
    regex_scripts?: SillyTavernRegexScript[]; // v3 regex scripts
  };
}

/**
 * SillyTavern 场景/提示文件格式 (通常是 settings.json 或导出的 preset)
 */
export interface SillyTavernPromptFile {
  prompts: SillyTavernPrompt[];
  prompt_order: {
    character_id: number;
    order: {
      identifier: string;
      enabled: boolean;
    }[];
  }[];
  // 其他可能存在的字段
  [key: string]: any;
}

export interface SillyTavernPrompt {
  identifier: string;
  name: string;
  role?: MessageRole;
  content?: string;
  system_prompt?: boolean;
  injection_depth?: number;
  injection_position?: number; // 0: main, 1: before history, 2: after history, 4: at depth
  marker?: boolean;
  enabled?: boolean;
  forbid_overrides?: boolean;
}

// ==================== 解析结果类型 ====================

/**
 * 标准化后的角色卡数据，用于统一处理 v2 和 v3 格式
 */
interface NormalizedCardData {
  name: string;
  description: string;
  first_mes: string;
  mes_example?: string;
  scenario?: string;
  personality?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  alternate_greetings?: string[];
  tags?: string[];
  extensions?: NonNullable<SillyTavernCharacterCard['data']>['extensions'];
  regex_scripts?: SillyTavernRegexScript[];
}

export interface ParsedCharacterCard {
  agent: Partial<ChatAgent>;
  presetMessages: ChatMessageNode[];
}

export interface ParsedPromptFile {
  /** 前置消息 (在 chatHistory 之前) */
  systemPrompts: ChatMessageNode[];
  /** 注入消息 (在 chatHistory 之后) */
  injectionPrompts: ChatMessageNode[];
  /** 未在 order 中配置的消息 (可选导入) */
  unorderedPrompts: ChatMessageNode[];
  /** 提取的模型参数 */
  parameters: Partial<LlmParameters>;
}

// ==================== 解析器实现 ====================

/**
 * 解析 SillyTavern 角色卡
 * @param card 角色卡 JSON 对象
 * @returns 解析后的 Agent 部分数据和预设消息
 */
export function parseCharacterCard(card: SillyTavernCharacterCard): ParsedCharacterCard {
  // 标准化数据，统一处理 v2 和 v3
  const data: NormalizedCardData = card.data
    ? { ...card, ...card.data }
    : { ...card, creator_notes: card.creatorcomment };

  const presetMessages: ChatMessageNode[] = [];

  // 1. System Prompt (v3)
  if (data.system_prompt) {
    presetMessages.push(createPresetMessage('system', data.system_prompt, 'System Prompt'));
  }

  // 2. Description
  if (data.description) {
    presetMessages.push(createPresetMessage('system', `[角色描述]\n${data.description}`, 'Description'));
  }

  // 3. Personality
  if (data.personality) {
    presetMessages.push(createPresetMessage('system', `[角色性格]\n${data.personality}`, 'Personality'));
  }

  // 4. Scenario
  if (data.scenario) {
    presetMessages.push(createPresetMessage('system', `[场景设定]\n${data.scenario}`, 'Scenario'));
  }

  // 5. Example Messages
  if (data.mes_example) {
    presetMessages.push(createPresetMessage('system', `[对话示例]\n${data.mes_example}`, 'Example Messages'));
  }

  // 6. Post History Instructions (v3) - 通常作为深度注入
  if (data.post_history_instructions) {
    presetMessages.push(
      createPresetMessage('system', data.post_history_instructions, 'Post History Instructions', {
        depth: 0, // 紧跟最新消息
        order: 100,
      })
    );
  }

  // 7. Depth Prompt (v3 extension) - 深度注入
  const depthPrompt = data.extensions?.depth_prompt;
  if (depthPrompt && depthPrompt.prompt) {
    presetMessages.push(
      createPresetMessage(depthPrompt.role || 'system', depthPrompt.prompt, 'Depth Prompt', {
        depth: depthPrompt.depth ?? 4,
        order: 100,
      })
    );
  }

  // 8. First Message & Alternate Greetings (开场白)
  const greetings = [data.first_mes, ...(data.alternate_greetings || [])].filter(
    (g) => typeof g === 'string' && g.trim()
  );

  if (greetings.length > 0) {
    greetings.forEach((greeting, index) => {
      presetMessages.push(
        createPresetMessage(
          'assistant',
          greeting,
          index === 0 ? 'First Message' : `Alternate Greeting ${index}`,
          undefined,
          index === 0 // 只启用第一个
        )
      );
    });
  }

  // 9. Regex Scripts
  let regexConfig: ChatRegexConfig | undefined;
  // 兼容性处理：regex_scripts 可能直接位于 data 下，也可能位于 extensions 下
  const rawRegexScripts = data.regex_scripts || data.extensions?.regex_scripts;

  if (rawRegexScripts && Array.isArray(rawRegexScripts) && rawRegexScripts.length > 0) {
    try {
      // 将所有脚本合并为一个以角色名命名的预设
      const presetName = `${data.name} - 导入正则`;
      const preset = convertSillyTavernArrayToPreset(rawRegexScripts, presetName);
      regexConfig = { presets: [preset] };
    } catch (e) {
      logger.warn('解析正则脚本失败', { error: e });
    }
  }

  const agent: Partial<ChatAgent> = {
    name: data.name,
    description: data.creator_notes, // 使用 creator_notes 作为 agent 的描述
    icon: card.avatar, // 直接从原始 card 中获取，因为 data 中没有 avatar
    tags: data.tags,
    displayPresetCount: greetings.length,
    regexConfig: regexConfig, // 赋值正则配置
  };

  logger.info('角色卡解析完成', {
    name: agent.name,
    presetCount: presetMessages.length,
    hasDepthPrompt: !!depthPrompt,
    regexCount: regexConfig?.presets.length || 0,
  });

  return { agent, presetMessages };
}

/**
 * 解析 SillyTavern 场景/提示文件
 * @param file 场景文件 JSON 对象
 * @param characterId 要使用的角色配置 ID (默认使用第一个)
 * @returns 解析后的预设消息列表
 */
export function parsePromptFile(file: SillyTavernPromptFile, characterId?: number): ParsedPromptFile {
  const systemPrompts: ChatMessageNode[] = [];
  const injectionPrompts: ChatMessageNode[] = [];
  const unorderedPrompts: ChatMessageNode[] = [];
  const promptMap = new Map(file.prompts.map((p) => [p.identifier, p]));
  const processedIdentifiers = new Set<string>();

  // 查找指定的 order 配置。
  // 优先使用 characterId 查找，如果找不到或未提供，则默认使用最后一个配置
  // (根据用户反馈，最后一个通常是当前激活的)
  let orderConfig: SillyTavernPromptFile['prompt_order'][number]['order'] | undefined;

  if (characterId !== undefined) {
    orderConfig = file.prompt_order?.find((po) => po.character_id === characterId)?.order;
  }

  if (!orderConfig && file.prompt_order && file.prompt_order.length > 0) {
    orderConfig = file.prompt_order[file.prompt_order.length - 1].order;
  }

  const emptyResult: ParsedPromptFile = {
    systemPrompts: [],
    injectionPrompts: [],
    unorderedPrompts: [],
    parameters: {},
  };

  if (!orderConfig) {
    logger.warn('场景文件中没有找到有效的 prompt_order 配置');
    return emptyResult;
  }

  // 以 chatHistory 为界，分离 system 和 injection prompts
  const historyIndex = orderConfig.findIndex((item) => item.identifier === 'chatHistory');
  const splitIndex = historyIndex === -1 ? orderConfig.length : historyIndex;

  const preHistoryOrder = orderConfig.slice(0, splitIndex);
  const postHistoryOrder = orderConfig.slice(splitIndex + 1);

  // 解析前置消息
  for (const item of preHistoryOrder) {
    processedIdentifiers.add(item.identifier);
    const prompt = promptMap.get(item.identifier);
    if (!prompt || prompt.marker || !prompt.content?.trim()) {
      continue;
    }
    const message = createPresetMessage(
      prompt.role || 'system',
      prompt.content,
      prompt.name, // 传入名称
      undefined, // 前置消息不应有注入策略
      item.enabled
    );
    systemPrompts.push(message);
  }

  // 解析后置消息
  for (const item of postHistoryOrder) {
    processedIdentifiers.add(item.identifier);
    const prompt = promptMap.get(item.identifier);
    if (!prompt || prompt.marker || !prompt.content?.trim()) {
      continue;
    }
    const injectionStrategy = convertInjectionStrategy(prompt);
    const message = createPresetMessage(
      prompt.role || 'system',
      prompt.content,
      prompt.name,
      injectionStrategy,
      item.enabled
    );
    injectionPrompts.push(message);
  }

  // 解析未在 order 中配置的消息
  for (const prompt of file.prompts) {
    // 跳过已处理的、marker 类型的、或没有内容的 prompt
    if (processedIdentifiers.has(prompt.identifier) || prompt.marker || !prompt.content?.trim()) {
      continue;
    }
    const injectionStrategy = convertInjectionStrategy(prompt);
    const message = createPresetMessage(
      prompt.role || 'system',
      prompt.content,
      prompt.name,
      injectionStrategy,
      false // 默认禁用，让用户选择
    );
    unorderedPrompts.push(message);
  }

  // 提取模型参数
  const parameters = pick(file, [
    'temperature',
    'top_p',
    'top_k',
    'top_a',
    'min_p',
    'repetition_penalty',
    'presence_penalty',
    'frequency_penalty',
    'max_tokens',
  ]);

  logger.info('场景文件解析完成', {
    totalPrompts: file.prompts.length,
    systemPrompts: systemPrompts.length,
    injectionPrompts: injectionPrompts.length,
    unorderedPrompts: unorderedPrompts.length,
  });

  return { systemPrompts, injectionPrompts, unorderedPrompts, parameters };
}

/**
 * 判断一个 JSON 对象是否是 SillyTavern 角色卡
 */
export function isCharacterCard(obj: any): obj is SillyTavernCharacterCard {
  // v3 检测
  if (obj.spec === 'chara_card_v3' || obj.spec === 'chara_card_v2') {
    return true;
  }
  // v2 检测 (通过必要字段判断)
  if (obj.name && obj.description && obj.first_mes !== undefined) {
    return true;
  }
  return false;
}

/**
 * 判断一个 JSON 对象是否是 SillyTavern 场景/提示文件
 */
export function isPromptFile(obj: any): obj is SillyTavernPromptFile {
  return Array.isArray(obj.prompts) && Array.isArray(obj.prompt_order);
}

// ==================== 内部辅助函数 ====================

/**
 * 将 ST 的注入配置转换为我们的 InjectionStrategy
 */
function convertInjectionStrategy(prompt: SillyTavernPrompt): InjectionStrategy | undefined {
  // 优先使用 injection_depth (如果存在)
  if (prompt.injection_depth !== undefined && prompt.injection_depth > 0) {
    return {
      depth: prompt.injection_depth,
      order: 100,
    };
  }

  // 根据 injection_position 转换
  if (prompt.injection_position !== undefined) {
    switch (prompt.injection_position) {
      case 0: // Main prompt (system prompt area)
        // 不设置注入策略，按列表顺序排列
        return undefined;
      case 1: // Before chat history
        return {
          anchorTarget: SYSTEM_ANCHORS.CHAT_HISTORY,
          anchorPosition: 'before',
          order: 100,
        };
      case 2: // After chat history
        return {
          anchorTarget: SYSTEM_ANCHORS.CHAT_HISTORY,
          anchorPosition: 'after',
          order: 100,
        };
      case 4: // At depth (需要配合 injection_depth)
        // 如果 injection_depth 未设置，使用默认值 4
        return {
          depth: prompt.injection_depth ?? 4,
          order: 100,
        };
      default:
        return undefined;
    }
  }

  return undefined;
}

/**
 * 创建预设消息节点
 */
function createPresetMessage(
  role: MessageRole,
  content: string,
  name?: string,
  injectionStrategy?: InjectionStrategy,
  isEnabled: boolean = true
): ChatMessageNode {
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    parentId: null,
    childrenIds: [],
    content,
    role,
    status: 'complete',
    type: 'message',
    isEnabled,
    timestamp: new Date().toISOString(),
    injectionStrategy,
    metadata: name ? { stPromptName: name } : undefined,
  };
}
// 注：正则转换逻辑已移至 chatRegexUtils.ts，使用 convertSillyTavernArrayToPreset
