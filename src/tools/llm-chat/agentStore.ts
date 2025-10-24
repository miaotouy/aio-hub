/**
 * 智能体管理 Store
 */

import { defineStore } from 'pinia';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useAgentStorage } from './composables/useAgentStorage';
import { useLlmChatUiState } from './composables/useLlmChatUiState';
import type { ChatAgent, ChatMessageNode, LlmParameters } from './types';
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

    /**
     * 当前选中的智能体 ID（从 UI 状态获取）
     */
    currentAgentId: (): string | null => {
      const { currentAgentId } = useLlmChatUiState();
      return currentAgentId.value;
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
        presetMessages?: ChatMessageNode[];
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
        presetMessages: options?.presetMessages,
        parameters: {
          temperature: options?.parameters?.temperature ?? 0.7,
          maxTokens: options?.parameters?.maxTokens ?? 4096,
          topP: options?.parameters?.topP,
          topK: options?.parameters?.topK,
          frequencyPenalty: options?.parameters?.frequencyPenalty,
          presencePenalty: options?.parameters?.presencePenalty,
        },
        createdAt: now,
      };

      this.agents.push(agent);
      this.persistAgents();

      logger.info('创建新智能体', {
        agentId,
        name,
        profileId,
        modelId,
        hasPresetMessages: !!options?.presetMessages,
      });

      return agentId;
    },

    /**
     * 更新智能体
     */
    updateAgent(agentId: string, updates: Partial<Omit<ChatAgent, 'id' | 'createdAt'>>): void {
      const agent = this.agents.find(a => a.id === agentId);
      if (!agent) {
        logger.warn('更新智能体失败：智能体不存在', { agentId });
        return;
      }

      Object.assign(agent, updates);
      this.persistAgents();

      logger.info('更新智能体', { agentId, updates });
    },

    /**
     * 删除智能体
     */
    async deleteAgent(agentId: string): Promise<void> {
      const index = this.agents.findIndex(a => a.id === agentId);
      if (index === -1) {
        logger.warn('删除智能体失败：智能体不存在', { agentId });
        return;
      }

      const agent = this.agents[index];
      
      // 调用存储层删除（会移入回收站）
      const { deleteAgent } = useAgentStorage();
      await deleteAgent(agentId);
      
      // 从内存中移除
      this.agents.splice(index, 1);
      
      // 如果删除的是当前智能体，切换到第一个智能体
      const { currentAgentId } = useLlmChatUiState();
      if (currentAgentId.value === agentId) {
        currentAgentId.value = this.agents[0]?.id || null;
      }

      logger.info('智能体已删除', { agentId, name: agent.name });
    },

    /**
     * 选择智能体（独立于会话）
     * 注意：仅选择不更新 lastUsedAt，只有真正使用（如发送消息）时才更新
     */
    selectAgent(agentId: string): void {
      const agent = this.agents.find(a => a.id === agentId);
      if (!agent) {
        logger.warn('选择智能体失败：智能体不存在', { agentId });
        return;
      }

      const { currentAgentId } = useLlmChatUiState();
      currentAgentId.value = agentId;
      // 不在这里更新 lastUsedAt，避免选择时改变列表排序
      logger.info('选择智能体', { agentId, name: agent.name });
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
     * 持久化智能体到文件
     */
    persistAgents(): void {
      const { saveAgents } = useAgentStorage();
      saveAgents(this.agents).catch(error => {
        logger.error('持久化智能体失败', error as Error, {
          agentCount: this.agents.length,
        });
      });
    },

    /**
     * 从文件加载智能体
     */
    async loadAgents(): Promise<void> {
      try {
        const { loadAgents } = useAgentStorage();
        const agents = await loadAgents();
        
        if (agents.length > 0) {
          this.agents = agents;
          logger.info('加载智能体成功', { agentCount: this.agents.length });
          
          // 自动选择默认智能体（最近使用的）
          const { currentAgentId } = useLlmChatUiState();
          if (!currentAgentId.value && this.defaultAgent) {
            currentAgentId.value = this.defaultAgent.id;
          }
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

      // 创建默认的预设消息
      const defaultPresetMessages: ChatMessageNode[] = [
        {
          id: `preset-system-${Date.now()}`,
          parentId: null,
          childrenIds: [],
          content: '你是一个友好且乐于助人的 AI 助手。',
          role: 'system',
          status: 'complete',
          isEnabled: true,
          timestamp: new Date().toISOString(),
        },
      ];

      // 创建默认智能体（占位角色）
      const defaultAgentId = this.createAgent(
        '助手',
        firstProfile.id,
        firstModel.id,
        {
          description: '一个可以自由定制的对话伙伴',
          icon: '✨',
          presetMessages: defaultPresetMessages,
          parameters: {
            temperature: 0.7,
            maxTokens: 4096,
            topP: undefined,
            topK: undefined,
            frequencyPenalty: undefined,
            presencePenalty: undefined,
          },
        }
      );

      // 自动选中默认智能体
      const { currentAgentId } = useLlmChatUiState();
      currentAgentId.value = defaultAgentId;

      this.persistAgents();
      logger.info('创建默认智能体', { agentId: defaultAgentId });
    },

    /**
     * 从智能体获取完整配置（包括参数覆盖）
     */
    getAgentConfig(agentId: string, overrides?: {
      parameterOverrides?: Partial<LlmParameters>;
    }) {
      const agent = this.getAgentById(agentId);
      if (!agent) {
        logger.warn('获取智能体配置失败：智能体不存在', { agentId });
        return null;
      }

      return {
        profileId: agent.profileId,
        modelId: agent.modelId,
        presetMessages: agent.presetMessages ?? [],
        parameters: {
          temperature: overrides?.parameterOverrides?.temperature ?? agent.parameters.temperature,
          maxTokens: overrides?.parameterOverrides?.maxTokens ?? agent.parameters.maxTokens,
          topP: overrides?.parameterOverrides?.topP ?? agent.parameters.topP,
          topK: overrides?.parameterOverrides?.topK ?? agent.parameters.topK,
          frequencyPenalty: overrides?.parameterOverrides?.frequencyPenalty ?? agent.parameters.frequencyPenalty,
          presencePenalty: overrides?.parameterOverrides?.presencePenalty ?? agent.parameters.presencePenalty,
        },
      };
    },
  },
});