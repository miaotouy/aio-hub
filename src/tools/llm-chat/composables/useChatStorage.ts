/**
 * LLM Chat 会话数据文件存储
 * 使用 ConfigManager 实现持久化
 */

import { createConfigManager } from '@/utils/configManager';
import type { ChatSession } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/storage');

/**
 * 会话存储配置
 */
interface SessionsConfig {
  version: string;
  sessions: ChatSession[];
  currentSessionId: string | null;
}

/**
 * 创建默认会话配置
 */
function createDefaultSessionsConfig(): SessionsConfig {
  return {
    version: '1.0.0',
    sessions: [],
    currentSessionId: null,
  };
}

/**
 * 会话配置管理器
 */
const sessionsManager = createConfigManager<SessionsConfig>({
  moduleName: 'llm-chat',
  fileName: 'sessions.json',
  version: '1.0.0',
  createDefault: createDefaultSessionsConfig,
});

/**
 * 会话存储 composable
 */
export function useChatStorage() {
  /**
   * 加载所有会话
   */
  const loadSessions = async (): Promise<{
    sessions: ChatSession[];
    currentSessionId: string | null;
  }> => {
    try {
      logger.debug('开始加载会话数据');
      const config = await sessionsManager.load();
      
      // 验证数据格式：检查是否是新的树形结构
      const isValidFormat = config.sessions.every(
        session =>
          session.nodes !== undefined &&
          session.rootNodeId !== undefined &&
          session.activeLeafId !== undefined
      );

      if (!isValidFormat && config.sessions.length > 0) {
        // 旧格式数据，清空并提示
        logger.warn('检测到旧格式的会话数据，已清空', {
          oldSessionCount: config.sessions.length
        });
        return { sessions: [], currentSessionId: null };
      }

      logger.info('会话数据加载成功', { 
        sessionCount: config.sessions.length,
        currentSessionId: config.currentSessionId
      });
      
      return {
        sessions: config.sessions,
        currentSessionId: config.currentSessionId,
      };
    } catch (error) {
      logger.error('加载会���数据失败', error as Error);
      return { sessions: [], currentSessionId: null };
    }
  };

  /**
   * 保存所有会话
   */
  const saveSessions = async (
    sessions: ChatSession[],
    currentSessionId: string | null
  ): Promise<void> => {
    try {
      logger.debug('开始保存会话数据', { sessionCount: sessions.length });
      
      await sessionsManager.save({
        version: '1.0.0',
        sessions,
        currentSessionId,
      });
      
      logger.info('会话数据保存成功', { 
        sessionCount: sessions.length,
        currentSessionId
      });
    } catch (error) {
      logger.error('保存会话数据失败', error as Error, {
        sessionCount: sessions.length,
      });
      throw error;
    }
  };

  /**
   * 创建防抖保存函数
   */
  const createDebouncedSave = (delay: number = 500) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    return (sessions: ChatSession[], currentSessionId: string | null) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        try {
          await saveSessions(sessions, currentSessionId);
          logger.debug('防抖保存完成', { delay });
        } catch (error) {
          logger.error('防抖保存失败', error as Error);
        }
      }, delay);
    };
  };

  return {
    loadSessions,
    saveSessions,
    createDebouncedSave,
  };
}