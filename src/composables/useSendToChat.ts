/**
 * 发送内容到聊天输入框 Composable
 * 
 * 功能：
 * - 统一的内容发送接口
 * - 自动格式化（代码块、引用等）
 * - 统一的错误处理和用户提示
 * 
 * 使用场景：
 * - JsonFormatter - 发送格式化后的 JSON
 * - CodeFormatter - 发送格式化后的代码
 * - RegexApplier - 发送处理后的文本
 * - DirectoryTree - 发送目录树
 * - GitAnalyzer - 发送分析报告
 * - SmartOcr - 发送识别文本
 * - TextDiff - 发送 diff 结果
 */

import { serviceRegistry } from '@/services/registry';
import type LlmChatService from '@/tools/llm-chat/llmChat.registry';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('useSendToChat');
const errorHandler = createModuleErrorHandler('useSendToChat');

/**
 * 发送选项
 */
export interface SendToChatOptions {
  /** 
   * 内容格式化方式
   * - 'plain': 纯文本，不做任何格式化
   * - 'code': 使用代码块包裹 (```language\n内容\n```)
   * - 'quote': 使用引用格式 (> 内容)
   */
  format?: 'plain' | 'code' | 'quote';
  
  /**
   * 代码块语言（仅在 format='code' 时有效）
   */
  language?: string;
  
  /**
   * 添加位置
   * - 'append': 追加到末尾（默认）
   * - 'prepend': 添加到开头
   */
  position?: 'append' | 'prepend';
  
  /**
   * 自定义成功提示消息
   */
  successMessage?: string;
  
  /**
   * 自定义错误提示消息
   */
  errorMessage?: string;
}

/**
 * 使用发送到聊天功能
 */
export function useSendToChat() {
  /**
   * 延迟获取 llmChat 服务
   * 确保在组件上下文中调用，避免生命周期钩子警告
   */
  const getLlmChatService = () => {
    return serviceRegistry.getService<LlmChatService>('llm-chat');
  };
  
  /**
   * 格式化内容
   */
  const formatContent = (content: string, options: SendToChatOptions): string => {
    const { format = 'plain', language = '' } = options;
    
    switch (format) {
      case 'code':
        return `\`\`\`${language}\n${content}\n\`\`\``;
      case 'quote':
        return content.split('\n').map(line => `> ${line}`).join('\n');
      case 'plain':
      default:
        return content;
    }
  };
  
  /**
   * 发送内容到聊天输入框
   * 
   * @param content 要发送的内容
   * @param options 发送选项
   * @returns 是否发送成功
   */
  const sendToChat = (content: string, options: SendToChatOptions = {}): boolean => {
    // 检查内容是否为空
    if (!content || !content.trim()) {
      const errorMsg = options.errorMessage || '没有可发送的内容';
      customMessage.warning(errorMsg);
      logger.warn('发送内容为空', { options });
      return false;
    }
    
    try {
      // 格式化内容
      const formattedContent = formatContent(content, options);
      
      // 发送到聊天输入框
      const { position = 'append' } = options;
      const llmChatService = getLlmChatService();
      llmChatService.addContentToInput(formattedContent, { position });
      
      // 显示成功提示
      const successMsg = options.successMessage || '已发送到聊天输入框';
      customMessage.success(successMsg);
      
      logger.info('发送内容到聊天成功', {
        contentLength: content.length,
        format: options.format,
        position,
      });
      
      return true;
    } catch (error: any) {
      errorHandler.error(error, options.errorMessage || '发送内容到聊天失败');
      return false;
    }
  };
  
  /**
   * 便捷方法：发送代码到聊天
   */
  const sendCodeToChat = (code: string, language: string = '', options: Omit<SendToChatOptions, 'format' | 'language'> = {}): boolean => {
    return sendToChat(code, {
      ...options,
      format: 'code',
      language,
    });
  };
  
  /**
   * 便捷方法：发送引用到聊天
   */
  const sendQuoteToChat = (text: string, options: Omit<SendToChatOptions, 'format'> = {}): boolean => {
    return sendToChat(text, {
      ...options,
      format: 'quote',
    });
  };
  
  return {
    /**
     * 发送内容到聊天输入框
     */
    sendToChat,
    
    /**
     * 发送代码到聊天（自动添加代码块格式）
     */
    sendCodeToChat,
    
    /**
     * 发送引用到聊天（自动添加引用格式）
     */
    sendQuoteToChat,
  };
}