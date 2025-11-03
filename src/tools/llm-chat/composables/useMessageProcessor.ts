/**
 * 消息后处理器 Composable
 * 实现可扩展的消息处理管道，用于在发送给 LLM 前转换消息格式
 */

import type { ContextPostProcessRule } from '../types';
import type { LlmMessageContent } from '@/llm-apis/common';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/message-processor');

/**
 * 统一的消息类型（用于管道处理）
 */
export interface ProcessableMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmMessageContent[];
}

/**
 * 默认分隔符
 */
const DEFAULT_SEPARATOR = '\n\n---\n\n';

export function useMessageProcessor() {
  /**
   * 将消息内容转换为字符串（用于合并）
   */
  const contentToString = (content: string | LlmMessageContent[]): string => {
    if (typeof content === 'string') {
      return content;
    }
    
    // 多模态内容：提取所有文本部分
    return content
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('\n');
  };

  /**
   * 规则处理器 1: 合并所有 system 消息到列表头部
   */
  const handleMergeSystemToHead = (
    messages: ProcessableMessage[],
    separator: string
  ): ProcessableMessage[] => {
    const systemMessages: ProcessableMessage[] = [];
    const nonSystemMessages: ProcessableMessage[] = [];

    // 分离 system 和非 system 消息
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg);
      } else {
        nonSystemMessages.push(msg);
      }
    }

    // 如果没有 system 消息，直接返回
    if (systemMessages.length === 0) {
      return messages;
    }

    // 合并所有 system 消息
    const mergedSystemContent = systemMessages
      .map((msg) => contentToString(msg.content))
      .join(separator);

    const mergedSystemMessage: ProcessableMessage = {
      role: 'system',
      content: mergedSystemContent,
    };

    logger.debug('合并 system 消息', {
      originalCount: systemMessages.length,
      mergedLength: mergedSystemContent.length,
    });

    // 返回：合并后的 system 消息 + 其他消息
    return [mergedSystemMessage, ...nonSystemMessages];
  };

  /**
   * 规则处理器 2: 合并连续相同角色的消息
   */
  const handleMergeConsecutiveRoles = (
    messages: ProcessableMessage[],
    separator: string
  ): ProcessableMessage[] => {
    if (messages.length === 0) return messages;

    const result: ProcessableMessage[] = [];
    let currentGroup: ProcessableMessage[] = [messages[0]];

    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const previous = messages[i - 1];

      if (current.role === previous.role) {
        // 相同角色，加入当前组
        currentGroup.push(current);
      } else {
        // 角色变化，处理当前组
        if (currentGroup.length > 1) {
          // 合并组内消息
          const mergedContent = currentGroup
            .map((msg) => contentToString(msg.content))
            .join(separator);
          
          result.push({
            role: currentGroup[0].role,
            content: mergedContent,
          });

          logger.debug('合并连续角色消息', {
            role: currentGroup[0].role,
            count: currentGroup.length,
            mergedLength: mergedContent.length,
          });
        } else {
          // 只有一条消息，直接添加
          result.push(currentGroup[0]);
        }

        // 开始新组
        currentGroup = [current];
      }
    }

    // 处理最后一组
    if (currentGroup.length > 1) {
      const mergedContent = currentGroup
        .map((msg) => contentToString(msg.content))
        .join(separator);
      
      result.push({
        role: currentGroup[0].role,
        content: mergedContent,
      });

      logger.debug('合并连续角色消息（最后一组）', {
        role: currentGroup[0].role,
        count: currentGroup.length,
        mergedLength: mergedContent.length,
      });
    } else if (currentGroup.length === 1) {
      result.push(currentGroup[0]);
    }

    return result;
  };

  /**
   * 规则处理器 3: 确保 user/assistant 角色交替
   * 策略：如果检测到两个 assistant 消息连续，在它们之间插入一个简单的 user 消息
   */
  const handleEnsureAlternatingRoles = (
    messages: ProcessableMessage[]
  ): ProcessableMessage[] => {
    const result: ProcessableMessage[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      result.push(current);

      // 检查下一条消息
      if (i < messages.length - 1) {
        const next = messages[i + 1];
        
        // 如果当前和下一条都是 assistant，插入一个 user 占位符
        if (current.role === 'assistant' && next.role === 'assistant') {
          result.push({
            role: 'user',
            content: '继续',
          });

          logger.debug('插入 user 占位符以确保角色交替', {
            position: i + 1,
          });
        }
        // 如果当前和下一条都是 user，插入一个 assistant 占位符
        else if (current.role === 'user' && next.role === 'user') {
          result.push({
            role: 'assistant',
            content: '好的',
          });

          logger.debug('插入 assistant 占位符以确保角色交替', {
            position: i + 1,
          });
        }
      }
    }

    return result;
  };

  /**
   * 规则处理器 4: 将 system 角色转换为 user 角色
   * 用于不支持 system 角色的模型
   */
  const handleConvertSystemToUser = (
    messages: ProcessableMessage[]
  ): ProcessableMessage[] => {
    let convertedCount = 0;

    const result = messages.map((msg) => {
      if (msg.role === 'system') {
        convertedCount++;
        return {
          role: 'user' as const,
          content: msg.content,
        };
      }
      return msg;
    });

    if (convertedCount > 0) {
      logger.debug('转换 system 消息为 user', {
        convertedCount,
      });
    }

    return result;
  };

  /**
   * 应用处理管道
   * 按顺序执行所有启用的规则
   */
  const applyProcessingPipeline = (
    messages: ProcessableMessage[],
    rules: ContextPostProcessRule[]
  ): ProcessableMessage[] => {
    let processedMessages = [...messages];

    logger.info('🔄 开始应用上下文后处理管道', {
      initialMessageCount: messages.length,
      ruleCount: rules.filter((r) => r.enabled).length,
    });

    for (const rule of rules) {
      if (!rule.enabled) {
        logger.debug('跳过禁用的规则', { ruleType: rule.type });
        continue;
      }

      const separator = rule.separator || DEFAULT_SEPARATOR;
      const beforeCount = processedMessages.length;

      logger.debug('执行处理规则', {
        ruleType: rule.type,
        messageCount: beforeCount,
      });

      switch (rule.type) {
        case 'merge-system-to-head':
          processedMessages = handleMergeSystemToHead(processedMessages, separator);
          break;
        case 'merge-consecutive-roles':
          processedMessages = handleMergeConsecutiveRoles(processedMessages, separator);
          break;
        case 'ensure-alternating-roles':
          processedMessages = handleEnsureAlternatingRoles(processedMessages);
          break;
        case 'convert-system-to-user':
          processedMessages = handleConvertSystemToUser(processedMessages);
          break;
        default:
          logger.warn('未知的处理规则类型', { ruleType: rule.type });
      }

      const afterCount = processedMessages.length;
      if (beforeCount !== afterCount) {
        logger.debug('规则执行后消息数量变化', {
          ruleType: rule.type,
          before: beforeCount,
          after: afterCount,
        });
      }
    }

    logger.info('✅ 上下文后处理管道执行完成', {
      finalMessageCount: processedMessages.length,
    });

    return processedMessages;
  };

  return {
    applyProcessingPipeline,
  };
}