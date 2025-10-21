/**
 * LLM Chat 智能体数据文件存储
 * 使用 ConfigManager 实现持久化
 */

import { createConfigManager } from '@/utils/configManager';
import type { ChatAgent } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/agent-storage');

/**
 * 智能体存储配置
 */
interface AgentsConfig {
  version: string;
  agents: ChatAgent[];
}

/**
 * 创建默认智能体配置
 */
function createDefaultAgentsConfig(): AgentsConfig {
  return {
    version: '1.0.0',
    agents: [],
  };
}

/**
 * 智能体配置管理器
 */
const agentsManager = createConfigManager<AgentsConfig>({
  moduleName: 'llm-chat',
  fileName: 'agents.json',
  version: '1.0.0',
  createDefault: createDefaultAgentsConfig,
});

/**
 * 智能体存储 composable
 */
export function useAgentStorage() {
  /**
   * 加载所有智能体
   */
  const loadAgents = async (): Promise<ChatAgent[]> => {
    try {
      logger.debug('开始加载智能体数据');
      const config = await agentsManager.load();
      
      logger.info('智能体数据加载成功', { 
        agentCount: config.agents.length
      });
      
      return config.agents;
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
      logger.debug('开始保存智能体数据', { agentCount: agents.length });
      
      await agentsManager.save({
        version: '1.0.0',
        agents,
      });
      
      logger.info('智能体数据保存成功', { 
        agentCount: agents.length
      });
    } catch (error) {
      logger.error('保存智能体数据失败', error as Error, {
        agentCount: agents.length,
      });
      throw error;
    }
  };

  /**
   * 创建防抖保存函数
   */
  const createDebouncedSave = (delay: number = 500) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    return (agents: ChatAgent[]) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        try {
          await saveAgents(agents);
          logger.debug('防抖保存完成', { delay });
        } catch (error) {
          logger.error('防抖保存失败', error as Error);
        }
      }, delay);
    };
  };

  return {
    loadAgents,
    saveAgents,
    createDebouncedSave,
  };
}