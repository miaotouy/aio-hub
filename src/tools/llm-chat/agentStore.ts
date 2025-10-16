/**
 * 智能体管理 Store
 */

import { defineStore } from 'pinia';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import type { ChatAgent, LlmParameters } from './types';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('llm-chat/agentStore');

interface AgentStoreState {
  /** 所有智能体列表 */
  agents: ChatAgent[];
}

export const useAgentStore = defineStore('llmChatAgent', {
  state: (): AgentStoreState => ({
    agents: [],
  }),

  getters: {
    /**
     * 根据 ID 获取智能体
     */
    getAgentById: (state) => (id: string): ChatAgent | undefined => {
      return state.agents.find(agent => agent.id === id);
    },

    /**
     * 按最后使用时间排序的智能体列表
     */
    sortedAgents: (state): ChatAgent[] => {
      return [...state.agents].sort((a, b) => {
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      });
    },

    /**
     * 默认智能体（最近使用的或第一个）
     */
    defaultAgent: (state): ChatAgent | null => {
      if (state.agents.length === 0) return null;
      
      // 返回最近使用的智能体
      const sorted = [...state.agents].sort((a, b) => {
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      });
      
      return sorted[0];
    },
  },

  actions: {
    /**
     * 创建新智能体
     */
    createAgent(
      name: string,
      profileId: string,
      modelId: string,
      options?: {
        description?: string;
        icon?: string;
        systemPrompt?: string;
        parameters?: Partial<LlmParameters>;
      }
    ): string {
      const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const agent: ChatAgent = {
        id: agentId,
        name,
        description: options?.description,
        icon: options?.icon,
        profileId,
        modelId,
        systemPrompt: options?.systemPrompt,
        parameters: {
          temperature: options?.parameters?.temperature ?? 0.7,
          maxTokens: options?.parameters?.maxTokens ?? 4096,
        },
        createdAt: now,
        isBuiltIn: false,
      };

      this.agents.push(agent);
      this.persistAgents();

      logger.info('创建新智能体', {
        agentId,
        name,
        profileId,
        modelId,
      });

      return agentId;
    },

    /**
     * 更新智能体
     */
    updateAgent(agentId: string, updates: Partial<Omit<ChatAgent, 'id' | 'createdAt' | 'isBuiltIn'>>): void {
      const agent = this.agents.find(a => a.id === agentId);
      if (!agent) {
        logger.warn('更新智能体失败：智能体不存在', { agentId });
        return;
      }

      if (agent.isBuiltIn) {
        logger.warn('更新智能体失败：不能修改内置智能体', { agentId });
        return;
      }

      Object.assign(agent, updates);
      this.persistAgents();

      logger.info('更新智能体', { agentId, updates });
    },

    /**
     * 删除智能体
     */
    deleteAgent(agentId: string): void {
      const index = this.agents.findIndex(a => a.id === agentId);
      if (index === -1) {
        logger.warn('删除智能体失败：智能体不存在', { agentId });
        return;
      }

      const agent = this.agents[index];
      if (agent.isBuiltIn) {
        logger.warn('删除智能体失败：不能删除内置智能体', { agentId });
        return;
      }

      this.agents.splice(index, 1);
      this.persistAgents();

      logger.info('删除智能体', { agentId, name: agent.name });
    },

    /**
     * 更新智能体的最后使用时间
     */
    updateLastUsed(agentId: string): void {
      const agent = this.agents.find(a => a.id === agentId);
      if (agent) {
        agent.lastUsedAt = new Date().toISOString();
        this.persistAgents();
      }
    },

    /**
     * 持久化智能体到 localStorage
     */
    persistAgents(): void {
      try {
        localStorage.setItem('llm-chat-agents', JSON.stringify(this.agents));
      } catch (error) {
        logger.error('持久化智能体失败', error as Error, {
          agentCount: this.agents.length,
        });
      }
    },

    /**
     * 从 localStorage 加载智能体
     */
    loadAgents(): void {
      try {
        const stored = localStorage.getItem('llm-chat-agents');
        if (stored) {
          this.agents = JSON.parse(stored) as ChatAgent[];
          logger.info('加载智能体成功', { agentCount: this.agents.length });
        } else {
          // 首次加载，创建默认智能体
          this.createDefaultAgents();
        }
      } catch (error) {
        logger.error('加载智能体失败', error as Error);
        this.agents = [];
        this.createDefaultAgents();
      }
    },

    /**
     * 创建默认智能体
     */
    createDefaultAgents(): void {
      const { enabledProfiles } = useLlmProfiles();
      
      if (enabledProfiles.value.length === 0) {
        logger.warn('无法创建默认智能体：没有可用的 Profile');
        return;
      }

      const firstProfile = enabledProfiles.value[0];
      if (firstProfile.models.length === 0) {
        logger.warn('无法创建默认智能体：Profile 没有可用模型');
        return;
      }

      const firstModel = firstProfile.models[0];

      // 创建默认的通用助手
      const defaultAgentId = this.createAgent(
        '默认助手',
        firstProfile.id,
        firstModel.id,
        {
          description: '通用对话助手',
          icon: '🤖',
          systemPrompt: '',
          parameters: {
            temperature: 0.7,
            maxTokens: 4096,
          },
        }
      );

      // 标记为内置
      const defaultAgent = this.agents.find(a => a.id === defaultAgentId);
      if (defaultAgent) {
        defaultAgent.isBuiltIn = true;
      }

      this.persistAgents();
      logger.info('创建默认智能体', { agentId: defaultAgentId });
    },

    /**
     * 从智能体获取完整配置（包括参数覆盖）
     */
    getAgentConfig(agentId: string, overrides?: {
      parameterOverrides?: Partial<LlmParameters>;
      systemPromptOverride?: string;
    }) {
      const agent = this.getAgentById(agentId);
      if (!agent) {
        logger.warn('获取智能体配置失败：智能体不存在', { agentId });
        return null;
      }

      return {
        profileId: agent.profileId,
        modelId: agent.modelId,
        systemPrompt: overrides?.systemPromptOverride ?? agent.systemPrompt ?? '',
        parameters: {
          temperature: overrides?.parameterOverrides?.temperature ?? agent.parameters.temperature,
          maxTokens: overrides?.parameterOverrides?.maxTokens ?? agent.parameters.maxTokens,
        },
      };
    },
  },
});