/**
 * LLM Chat 智能体数据文件存储
 * 使用分离式存储（每个智能体独立文件）
 */

import { useAgentStorageSeparated } from './useAgentStorageSeparated';
import type { ChatAgent } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/agent-storage');

/**
 * 智能体存储 composable
 * 使用分离式存储（每个智能体独立文件）
 */
export function useAgentStorage() {
  const separatedStorage = useAgentStorageSeparated();

  /**
   * 加载所有智能体
   */
  const loadAgents = async (): Promise<ChatAgent[]> => {
    try {
      return await separatedStorage.loadAgents();
    } catch (error) {
      logger.error('加载智能体数据失败', error as Error);
      return [];
    }
  };

  /**
   * 保存所有智能体
   */
  const saveAgents = async (agents: ChatAgent[]): Promise<void> => {
    try {
      await separatedStorage.saveAgents(agents);
    } catch (error) {
      logger.error('保存智能体数据失败', error as Error, {
        agentCount: agents.length,
      });
      throw error;
    }
  };

  /**
   * 删除智能体
   */
  const deleteAgent = async (agentId: string): Promise<void> => {
    try {
      await separatedStorage.deleteAgent(agentId);
    } catch (error) {
      logger.error('删除智能体失败', error as Error, { agentId });
      throw error;
    }
  };

  /**
   * 保存单个智能体并更新索引（推荐使用）
   */
  const persistAgent = async (
    agent: ChatAgent,
    allAgents: ChatAgent[]
  ): Promise<void> => {
    try {
      await separatedStorage.persistAgent(agent, allAgents);
    } catch (error) {
      logger.error('保存单个智能体失败', error as Error, { agentId: agent.id });
      throw error;
    }
  };

  /**
   * 创建防抖保存函数
   */
  const createDebouncedSave = (delay: number = 500) => {
    return separatedStorage.createDebouncedSave(delay);
  };

  return {
    loadAgents,
    saveAgents,
    persistAgent, // 新增：单智能体保存
    deleteAgent,
    createDebouncedSave,
  };
}