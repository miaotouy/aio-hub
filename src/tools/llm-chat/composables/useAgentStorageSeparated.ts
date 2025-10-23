/**
 * LLM Chat 智能体分离式文件存储
 * 使用 ConfigManager 管理索引文件，每个智能体存储为独立文件
 */

import { exists, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { createConfigManager } from '@/utils/configManager';
import type { ChatAgent } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/agent-storage-separated');

const MODULE_NAME = 'llm-chat';
const AGENTS_SUBDIR = 'agents';

/**
 * 智能体索引项（包含显示所需的元数据）
 */
interface AgentIndexItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  profileId: string;
  modelId: string;
  lastUsedAt?: string;
  createdAt: string;
  isBuiltIn: boolean;
}

/**
 * 智能体索引配置（包含元数据以优化列表显示）
 */
interface AgentsIndex {
  version: string;
  currentAgentId: string | null;
  agents: AgentIndexItem[]; // 智能体元数据列表（用于排序和快速显示）
}

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): AgentsIndex {
  return {
    version: '1.0.0',
    currentAgentId: null,
    agents: [],
  };
}

/**
 * 索引文件管理器（使用 ConfigManager）
 */
const indexManager = createConfigManager<AgentsIndex>({
  moduleName: MODULE_NAME,
  fileName: 'agents-index.json',
  version: '1.0.0',
  createDefault: createDefaultIndex,
});

/**
 * 分离式智能体存储 composable
 */
export function useAgentStorageSeparated() {
  /**
   * 获取智能体文件路径
   */
  async function getAgentPath(agentId: string): Promise<string> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const agentsDir = await join(moduleDir, AGENTS_SUBDIR);
    return join(agentsDir, `${agentId}.json`);
  }

  /**
   * 加载智能体索引（使用 ConfigManager）
   */
  async function loadIndex(): Promise<AgentsIndex> {
    return await indexManager.load();
  }

  /**
   * 保存智能体索引（使用 ConfigManager）
   */
  async function saveIndex(index: AgentsIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个智能体
   */
  async function loadAgent(agentId: string): Promise<ChatAgent | null> {
    try {
      const agentPath = await getAgentPath(agentId);
      const agentExists = await exists(agentPath);
      
      if (!agentExists) {
        logger.warn('智能体文件不存在', { agentId });
        return null;
      }

      const content = await readTextFile(agentPath);
      const agent: ChatAgent = JSON.parse(content);
      
      logger.debug('智能体加载成功', { agentId, name: agent.name });
      return agent;
    } catch (error) {
      logger.error('加载智能体失败', error as Error, { agentId });
      return null;
    }
  }

  /**
   * 确保 agents 子目录存在
   */
  async function ensureAgentsDir(): Promise<void> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const agentsDir = await join(moduleDir, AGENTS_SUBDIR);
    
    if (!await exists(agentsDir)) {
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(agentsDir, { recursive: true });
      logger.debug('创建 agents 目录', { agentsDir });
    }
  }

  /**
   * 保存单个智能体
   */
  async function saveAgent(agent: ChatAgent): Promise<void> {
    try {
      await indexManager.ensureModuleDir(); // 使用 ConfigManager 确保模块目录存在
      await ensureAgentsDir(); // 确保 agents 子目录存在
      const agentPath = await getAgentPath(agent.id);
      const content = JSON.stringify(agent, null, 2);
      await writeTextFile(agentPath, content);
      
      logger.debug('智能体保存成功', {
        agentId: agent.id,
        name: agent.name
      });
    } catch (error) {
      logger.error('保存智能体失败', error as Error, { agentId: agent.id });
      throw error;
    }
  }

  /**
   * 删除单个智能体文件
   */
  async function deleteAgentFile(agentId: string): Promise<void> {
    try {
      const agentPath = await getAgentPath(agentId);
      const agentExists = await exists(agentPath);
      if (agentExists) {
        await remove(agentPath);
        logger.info('智能体文件已删除', { agentId });
      }
    } catch (error) {
      logger.error('删除智能体文件失败', error as Error, { agentId });
      throw error;
    }
  }

  /**
   * 扫描 agents 目录，获取所有智能体文件的 ID
   */
  async function scanAgentDirectory(): Promise<string[]> {
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const appDir = await appDataDir();
      const moduleDir = await join(appDir, MODULE_NAME);
      const agentsDir = await join(moduleDir, AGENTS_SUBDIR);
      
      const dirExists = await exists(agentsDir);
      if (!dirExists) {
        return [];
      }

      const entries = await readDir(agentsDir);
      const agentIds = entries
        .filter(entry => entry.name?.endsWith('.json'))
        .map(entry => entry.name!.replace('.json', ''));
      
      logger.debug('扫描智能体目录完成', { count: agentIds.length });
      return agentIds;
    } catch (error) {
      logger.error('扫描智能体目录失败', error as Error);
      return [];
    }
  }

  /**
   * 从智能体创建索引项
   */
  function createIndexItem(agent: ChatAgent): AgentIndexItem {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      icon: agent.icon,
      profileId: agent.profileId,
      modelId: agent.modelId,
      lastUsedAt: agent.lastUsedAt,
      createdAt: agent.createdAt,
      isBuiltIn: agent.isBuiltIn ?? false,
    };
  }

  /**
   * 同步索引：合并索引中的 ID 和目录中的文件，加载新文件的元数据
   */
  async function syncIndex(index: AgentsIndex): Promise<AgentIndexItem[]> {
    // 1. 扫描目录获取所有智能体文件 ID
    const fileIds = await scanAgentDirectory();
    
    // 2. 创建 ID 映射
    const fileIdSet = new Set(fileIds);
    const indexMap = new Map(index.agents.map(item => [item.id, item]));
    
    // 3. 找出新增的文件 ID
    const newIds = fileIds.filter(id => !indexMap.has(id));
    
    // 4. 加载新文件的元数据
    const newItems: AgentIndexItem[] = [];
    for (const id of newIds) {
      const agent = await loadAgent(id);
      if (agent) {
        newItems.push(createIndexItem(agent));
      }
    }
    
    // 5. 过滤掉已删除的文件，保持原有顺序
    const validItems = index.agents.filter(item => fileIdSet.has(item.id));
    
    // 6. 合并：保持原有顺序，新文件追加在后面
    const syncedItems = [...validItems, ...newItems];
    
    if (newItems.length > 0 || validItems.length !== index.agents.length) {
      logger.info('索引已同步', {
        total: syncedItems.length,
        new: newItems.length,
        removed: index.agents.length - validItems.length
      });
    }
    
    return syncedItems;
  }

  /**
   * 加载所有智能体（兼容接口）
   */
  async function loadAgents(): Promise<ChatAgent[]> {
    try {
      logger.debug('开始加载所有智能体');
      
      // 1. 加载索引
      let index = await loadIndex();
      
      // 2. 同步索引（自动发现新文件并加载其元数据）
      const syncedItems = await syncIndex(index);
      
      // 3. 并行加载所有智能体的完整数据
      const agentPromises = syncedItems.map(item => loadAgent(item.id));
      const agentResults = await Promise.all(agentPromises);
      
      // 4. 过滤掉加载失败的智能体
      const agents = agentResults.filter((a): a is ChatAgent => a !== null);
      
      // 5. 如果索引被同步过，保存更新后的索引
      const validItems = agents.map(a => createIndexItem(a));
      if (syncedItems.length !== index.agents.length ||
          !syncedItems.every((item, i) => item.id === index.agents[i]?.id)) {
        index.agents = validItems;
        await saveIndex(index);
      }

      logger.info('所有智能体加载成功', {
        agentCount: agents.length,
        currentAgentId: index.currentAgentId
      });
      
      return agents;
    } catch (error) {
      logger.error('加载所有智能体失败', error as Error);
      return [];
    }
  }

  /**
   * 保存所有智能体（兼容接口）
   */
  async function saveAgents(agents: ChatAgent[]): Promise<void> {
    try {
      logger.debug('开始保存所有智能体', { agentCount: agents.length });
      
      // 1. 并行保存所有智能体文件
      await Promise.all(agents.map(agent => saveAgent(agent)));
      
      // 2. 更新索引（保存元数据）
      const index = await loadIndex();
      index.agents = agents.map(a => createIndexItem(a));
      await saveIndex(index);
      
      logger.info('所有智能体保存成功', {
        agentCount: agents.length
      });
    } catch (error) {
      logger.error('保存所有智能体失败', error as Error, {
        agentCount: agents.length,
      });
      throw error;
    }
  }

  /**
   * 删除智能体（同时删除文件和索引）
   */
  async function deleteAgent(agentId: string): Promise<void> {
    try {
      // 1. 删除智能体文件
      await deleteAgentFile(agentId);
      
      // 2. 从索引中移除
      const index = await loadIndex();
      index.agents = index.agents.filter(item => item.id !== agentId);
      
      // 3. 如果删除的是当前智能体，切换到第一个智能体
      if (index.currentAgentId === agentId) {
        index.currentAgentId = index.agents[0]?.id || null;
      }
      
      await saveIndex(index);
      
      logger.info('智能体已删除', { agentId });
    } catch (error) {
      logger.error('删除智能体失败', error as Error, { agentId });
      throw error;
    }
  }

  /**
   * 更新当前智能体 ID
   */
  async function setCurrentAgentId(agentId: string | null): Promise<void> {
    try {
      const index = await loadIndex();
      index.currentAgentId = agentId;
      await saveIndex(index);
      logger.debug('更新当前智能体', { agentId });
    } catch (error) {
      logger.error('更新当前智能体失败', error as Error, { agentId });
      throw error;
    }
  }

  /**
   * 获取当前智能体 ID
   */
  async function getCurrentAgentId(): Promise<string | null> {
    try {
      const index = await loadIndex();
      return index.currentAgentId;
    } catch (error) {
      logger.error('获取当前智能体失败', error as Error);
      return null;
    }
  }

  /**
   * 创建防抖保存函数
   */
  function createDebouncedSave(delay: number = 500) {
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
  }

  return {
    loadAgents,
    saveAgents,
    deleteAgent,
    loadAgent,
    saveAgent,
    setCurrentAgentId,
    getCurrentAgentId,
    createDebouncedSave,
  };
}