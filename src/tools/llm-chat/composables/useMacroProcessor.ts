/**
 * 宏处理器 Composable
 * 负责创建宏上下文、实例化处理器，并提供统一的宏处理接口
 */

import { useAgentStore } from '../agentStore';
import { useUserProfileStore } from '../userProfileStore';
import type { ChatSession, ChatAgent } from '../types';
import type { UserProfile } from '../types';
import { createMacroContext, extractContextFromSession } from '../macro-engine/MacroContext';
import { MacroProcessor } from '../macro-engine/MacroProcessor';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/use-macro-processor');

/**
 * 上下文覆盖选项
 * 用于在特定场景下提供额外的或覆盖默认的上下文信息
 */
export interface MacroContextOverrides {
  /** 会话对象（用于提取历史消息等） */
  session?: ChatSession;
  /** 智能体对象（用于获取角色信息） */
  agent?: ChatAgent;
  /** 用户档案对象 */
  userProfile?: UserProfile;
  /** 当前输入框内容（用于 {{input}} 宏） */
  input?: string;
  /** 强制覆盖用户名 */
  userName?: string;
  /** 强制覆盖角色名 */
  charName?: string;
}

export function useMacroProcessor() {
  const agentStore = useAgentStore();
  const userProfileStore = useUserProfileStore();
  const processor = new MacroProcessor();

  /**
   * 处理文本中的宏
   * @param text 待处理的文本
   * @param contextOverrides 可选的上下文覆盖信息
   * @returns 处理后的文本
   */
  const processMacros = async (
    text: string,
    contextOverrides?: MacroContextOverrides
  ): Promise<string> => {
    // 快速检查：如果文本中不包含宏，直接返回
    if (!text.includes('{{')) {
      return text;
    }

    // 获取当前智能体信息（优先使用传入的，否则使用当前选中的）
    const agent = contextOverrides?.agent || 
      (agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : undefined);

    // 获取用户档案（优先使用传入的，否则根据智能体绑定或全局配置）
    let userProfile = contextOverrides?.userProfile;
    if (!userProfile) {
      // 如果智能体有绑定的用户档案，使用它
      if (agent?.userProfileId) {
        userProfile = userProfileStore.getProfileById(agent.userProfileId);
      } 
      // 否则使用全局用户档案
      else if (userProfileStore.globalProfileId) {
        userProfile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      }
    }

    // 确定用户名和角色名
    const userName = contextOverrides?.userName || userProfile?.name || 'User';
    const charName = contextOverrides?.charName || agent?.name || 'Assistant';

    // 构建基础上下文
    const baseContext = createMacroContext({
      userName,
      charName,
      agent,
      userProfile,
      session: contextOverrides?.session,
    });

    // 如果提供了 session，从中提取额外的上下文信息
    if (contextOverrides?.session) {
      const extractedContext = extractContextFromSession(
        contextOverrides.session,
        agent,
        userProfile
      );
      Object.assign(baseContext, extractedContext);
    }

    // 如果提供了 input，添加到上下文
    if (contextOverrides?.input !== undefined) {
      baseContext.input = contextOverrides.input;
    }

    logger.debug('构建宏上下文', {
      userName,
      charName,
      hasAgent: !!agent,
      hasUserProfile: !!userProfile,
      hasSession: !!contextOverrides?.session,
      hasInput: !!baseContext.input,
      textLength: text.length,
    });

    // 执行宏处理
    try {
      const result = await processor.process(text, baseContext);
      
      if (result.hasMacros) {
        logger.info('宏处理完成', {
          originalLength: text.length,
          processedLength: result.output.length,
          macroCount: result.macroCount,
        });
      }

      return result.output;
    } catch (error) {
      logger.error('宏处理失败', error as Error, {
        textPreview: text.substring(0, 100),
      });
      // 处理失败时返回原文本
      return text;
    }
  };

  /**
   * 批量处理多个文本（并行处理以提高性能）
   * @param texts 待处理的文本数组
   * @param contextOverrides 可选的上下文覆盖信息
   * @returns 处理后的文本数组
   */
  const processMacrosBatch = async (
    texts: string[],
    contextOverrides?: MacroContextOverrides
  ): Promise<string[]> => {
    return Promise.all(
      texts.map(text => processMacros(text, contextOverrides))
    );
  };

  return {
    processMacros,
    processMacrosBatch,
  };
}