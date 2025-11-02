/**
 * 话题命名 Composable
 * 负责自动或手动为会话生成标题
 */

import { ref } from 'vue';
import type { ChatSession, ChatMessageNode } from '../types';
import { useChatSettings } from './useChatSettings';
import { useSessionManager } from './useSessionManager';
import { useNodeManager } from './useNodeManager';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('llm-chat/topic-namer');
const errorHandler = createModuleErrorHandler('llm-chat/topic-namer');

export function useTopicNamer() {
  // 正在生成标题的会话 ID 集合
  const generatingSessionIds = ref<Set<string>>(new Set());

  /**
   * 检查会话是否正在生成标题
   */
  const isGenerating = (sessionId: string): boolean => {
    return generatingSessionIds.value.has(sessionId);
  };

  /**
   * 为指定会话生成标题
   * @param session 目标会话
   * @param persistSession 持久化回调函数（可选，用于自动保存）
   * @returns 生成的标题，失败时返回 null
   */
  const generateTopicName = async (
    session: ChatSession,
    persistSession?: (session: ChatSession, currentSessionId: string | null) => void
  ): Promise<string | null> => {
    // 防止重复生成
    if (generatingSessionIds.value.has(session.id)) {
      logger.warn('会话正在生成标题，跳过重复请求', { sessionId: session.id });
      return null;
    }

    try {
      // 标记开始生成
      generatingSessionIds.value.add(session.id);

      // 获取设置
      const { settings, loadSettings, isLoaded } = useChatSettings();
      if (!isLoaded.value) {
        await loadSettings();
      }

      const namingConfig = settings.value.topicNaming;

      // 检查是否启用
      if (!namingConfig.enabled) {
        logger.warn('话题命名功能未启用', { sessionId: session.id });
        return null;
      }

      // 检查模型配置
      if (!namingConfig.modelIdentifier) {
        logger.error('未配置话题命名模型', new Error('Model not configured'));
        throw new Error('请先在设置中配置话题命名模型');
      }

      // 解析模型标识符
      const [profileId, modelId] = namingConfig.modelIdentifier.split(':');
      if (!profileId || !modelId) {
        logger.error('无效的模型标识符', new Error('Invalid model identifier'), {
          modelIdentifier: namingConfig.modelIdentifier,
        });
        throw new Error('模型标识符格式错误');
      }

      // 获取会话的最新消息作为上下文
      const nodeManager = useNodeManager();
      const activePath = nodeManager.getNodePath(session, session.activeLeafId);
      
      // 过滤掉系统消息和禁用消息，只保留用户和助手的消息
      const validMessages = activePath
        .filter((node: ChatMessageNode) => node.role !== 'system' && node.isEnabled !== false)
        .filter((node: ChatMessageNode) => node.role === 'user' || node.role === 'assistant');

      // 取最新的 N 条消息
      const contextMessages = validMessages.slice(-namingConfig.contextMessageCount);

      if (contextMessages.length === 0) {
        logger.warn('会话中没有可用的消息', { sessionId: session.id });
        return null;
      }

      // 构建上下文文本
      const contextText = contextMessages
        .map((node: ChatMessageNode) => {
          const role = node.role === 'user' ? '用户' : '助手';
          return `${role}: ${node.content}`;
        })
        .join('\n\n');

      logger.info('开始生成会话标题', {
        sessionId: session.id,
        sessionName: session.name,
        profileId,
        modelId,
        contextMessageCount: contextMessages.length,
        contextLength: contextText.length,
      });

      // 构建最终的提示词
      // 如果提示词中包含 {context} 占位符，则替换；否则追加到末尾（向后兼容）
      let finalPrompt: string;
      if (namingConfig.prompt.includes('{context}')) {
        finalPrompt = namingConfig.prompt.replace('{context}', contextText);
        logger.debug('使用占位符模式构建提示词');
      } else {
        finalPrompt = `${namingConfig.prompt}\n\n${contextText}`;
        logger.debug('使用追加模式构建提示词（向后兼容）');
      }

      // 发送请求生成标题
      const { sendRequest } = useLlmRequest();
      const response = await sendRequest({
        profileId,
        modelId,
        messages: [
          {
            role: 'user',
            content: finalPrompt,
          },
        ],
        temperature: namingConfig.temperature,
        maxTokens: namingConfig.maxTokens,
        stream: false, // 话题命名不使用流式响应
      });

      // 清理生成的标题（去除首尾空白、引号等）
      let generatedTitle = response.content.trim();
      
      // 移除可能的引号包裹
      if ((generatedTitle.startsWith('"') && generatedTitle.endsWith('"')) ||
          (generatedTitle.startsWith("'") && generatedTitle.endsWith("'"))) {
        generatedTitle = generatedTitle.slice(1, -1).trim();
      }

      // 移除可能的标点符号
      generatedTitle = generatedTitle.replace(/[。！？，、；：""''（）《》【】…—·\.,!?;:\(\)\[\]<>]$/g, '').trim();

      // 限制长度（防止过长）
      const maxTitleLength = 50;
      if (generatedTitle.length > maxTitleLength) {
        generatedTitle = generatedTitle.substring(0, maxTitleLength) + '...';
      }

      // 确保标题不为空
      if (!generatedTitle) {
        logger.warn('生成的标题为空，使用默认标题');
        // 使用与 createSession 相同的默认命名格式
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        generatedTitle = `会话 ${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }

      logger.info('会话标题生成成功', {
        sessionId: session.id,
        oldName: session.name,
        newName: generatedTitle,
        usage: response.usage,
      });

      // 更新会话名称
      const sessionManager = useSessionManager();
      sessionManager.updateSession(session, { name: generatedTitle });

      // 如果提供了持久化回调，执行持久化
      if (persistSession) {
        persistSession(session, session.id);
      }

      return generatedTitle;
    } catch (error) {
      errorHandler.error(error, '生成会话标题失败', {
        sessionId: session.id,
        sessionName: session.name,
      });
      return null;
    } finally {
      // 清除生成标记
      generatingSessionIds.value.delete(session.id);
    }
  };

  /**
   * 检查会话是否需要自动命名
   * @param session 目标会话
   * @returns 是否需要自动命名
   */
  const shouldAutoName = (session: ChatSession): boolean => {
    const { settings } = useChatSettings();
    const namingConfig = settings.value.topicNaming;

    // 检查是否启用
    if (!namingConfig.enabled) {
      return false;
    }

    // 检查模型是否配置
    if (!namingConfig.modelIdentifier) {
      return false;
    }

    // 检查会话名称是否为默认名称（以"会话"开头的认为是默认名称）
    if (!session.name.startsWith('会话')) {
      logger.debug('会话已有自定义名称，跳过自动命名', {
        sessionId: session.id,
        sessionName: session.name,
      });
      return false;
    }

    // 统计用户消息数量
    const nodeManager = useNodeManager();
    const activePath = nodeManager.getNodePath(session, session.activeLeafId);
    const userMessageCount = activePath.filter(
      (node: ChatMessageNode) => node.role === 'user' && node.isEnabled !== false
    ).length;

    // 检查是否达到阈值
    const shouldTrigger = userMessageCount >= namingConfig.autoTriggerThreshold;

    if (shouldTrigger) {
      logger.debug('会话满足自动命名条件', {
        sessionId: session.id,
        userMessageCount,
        threshold: namingConfig.autoTriggerThreshold,
      });
    }

    return shouldTrigger;
  };

  return {
    generateTopicName,
    shouldAutoName,
    isGenerating,
  };
}