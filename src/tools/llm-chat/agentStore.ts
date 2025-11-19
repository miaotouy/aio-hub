/**
 * 智能体管理 Store
 */

import { defineStore } from 'pinia';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useAgentStorageSeparated as useAgentStorage } from './composables/useAgentStorageSeparated';
import { useLlmChatUiState } from './composables/useLlmChatUiState';
import type { ChatAgent, ChatMessageNode, LlmParameters } from './types';
import type { LlmThinkRule, RichTextRendererStyleOptions } from '@/tools/rich-text-renderer/types';
import { createModuleLogger } from '@utils/logger';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { customMessage } from '@/utils/customMessage';

const logger = createModuleLogger('llm-chat/agentStore');

// ===== 导入导出相关类型定义 =====

/**
 * 可导出的 Agent 数据结构（不包含本地元数据）
 */
export interface ExportableAgent {
  name: string;
  description?: string;
  icon?: string;
  modelId: string;
  userProfileId?: string | null;
  presetMessages?: ChatMessageNode[];
  displayPresetCount?: number;
  parameters: LlmParameters;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;
}

/**
 * 导出文件格式
 */
export interface AgentExportFile {
  version: number;
  type: 'AIO_Agent_Export';
  agents: ExportableAgent[];
}

/**
 * 导入预检结果
 */
export interface AgentImportPreflightResult {
  /** 解析出的可导出 Agent 列表 */
  agents: ExportableAgent[];
  /** 资源文件映射 { relativePath: ArrayBuffer } */
  assets: Record<string, ArrayBuffer>;
  /** 模型不匹配的 Agent { agentIndex: number, agentName: string, modelId: string } */
  unmatchedModels: Array<{ agentIndex: number; agentName: string; modelId: string }>;
  /** 名称冲突的 Agent { agentIndex: number, agentName: string } */
  nameConflicts: Array<{ agentIndex: number; agentName: string }>;
}

/**
 * 确认导入时的 Agent 解决方案
 */
export interface ResolvedAgentToImport extends ExportableAgent {
  /** 最终选择的 profileId */
  finalProfileId: string;
  /** 最终选择的 modelId */
  finalModelId: string;
  /** 是否覆盖同名 Agent */
  overwriteExisting: boolean;
  /** 新的名称（如果重命名） */
  newName?: string;
}

/**
 * 确认导入的参数
 */
export interface ConfirmImportParams {
  resolvedAgents: ResolvedAgentToImport[];
  assets: Record<string, ArrayBuffer>;
}

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
        userProfileId?: string | null;
        presetMessages?: ChatMessageNode[];
        displayPresetCount?: number;
        parameters?: Partial<LlmParameters>;
        llmThinkRules?: LlmThinkRule[];
        richTextStyleOptions?: RichTextRendererStyleOptions;
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
        userProfileId: options?.userProfileId ?? null,
        presetMessages: options?.presetMessages,
        displayPresetCount: options?.displayPresetCount,
        llmThinkRules: options?.llmThinkRules,
        richTextStyleOptions: options?.richTextStyleOptions,
        parameters: {
          // 基础采样参数
          temperature: options?.parameters?.temperature ?? 0.7,
          maxTokens: options?.parameters?.maxTokens ?? 4096,
          topP: options?.parameters?.topP,
          topK: options?.parameters?.topK,
          frequencyPenalty: options?.parameters?.frequencyPenalty,
          presencePenalty: options?.parameters?.presencePenalty,
          seed: options?.parameters?.seed,
          stop: options?.parameters?.stop,
          // 高级参数
          n: options?.parameters?.n,
          logprobs: options?.parameters?.logprobs,
          topLogprobs: options?.parameters?.topLogprobs,
          maxCompletionTokens: options?.parameters?.maxCompletionTokens,
          reasoningEffort: options?.parameters?.reasoningEffort,
          logitBias: options?.parameters?.logitBias,
          store: options?.parameters?.store,
          user: options?.parameters?.user,
          serviceTier: options?.parameters?.serviceTier,
          // 响应格式
          responseFormat: options?.parameters?.responseFormat,
          // 工具调用
          tools: options?.parameters?.tools,
          toolChoice: options?.parameters?.toolChoice,
          parallelToolCalls: options?.parameters?.parallelToolCalls,
          // 多模态输出
          modalities: options?.parameters?.modalities,
          audio: options?.parameters?.audio,
          prediction: options?.parameters?.prediction,
          // 特殊功能
          webSearchOptions: options?.parameters?.webSearchOptions,
          streamOptions: options?.parameters?.streamOptions,
          metadata: options?.parameters?.metadata,
          // Claude 特有参数
          thinking: options?.parameters?.thinking,
          stopSequences: options?.parameters?.stopSequences,
          claudeMetadata: options?.parameters?.claudeMetadata,
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
      this.persistAgent(agent); // 只保存这一个智能体

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
        this.persistAgent(agent); // 只保存这一个智能体
      }
    },

    /**
     * 更新智能体的预设消息内容
     */
    updatePresetMessage(agentId: string, presetNodeId: string, newContent: string): boolean {
      const agent = this.agents.find(a => a.id === agentId);
      if (!agent || !agent.presetMessages) {
        logger.warn('更新预设消息失败：智能体或预设消息不存在', { agentId, presetNodeId });
        return false;
      }

      // 查找并更新预设消息
      const presetMessage = agent.presetMessages.find(msg => msg.id === presetNodeId);
      if (!presetMessage) {
        logger.warn('更新预设消息失败：预设节点不存在', { agentId, presetNodeId });
        return false;
      }

      // 更新内容
      presetMessage.content = newContent;
      
      // 持久化智能体
      this.persistAgent(agent);
      
      logger.info('预设消息已更新', {
        agentId,
        presetNodeId,
        role: presetMessage.role,
        contentLength: newContent.length,
      });

      return true;
    },

    /**
     * 切换预设消息的启用状态
     */
    togglePresetMessageEnabled(agentId: string, presetNodeId: string): boolean {
      const agent = this.agents.find(a => a.id === agentId);
      if (!agent || !agent.presetMessages) {
        logger.warn('切换预设消息状态失败：智能体或预设消息不存在', { agentId, presetNodeId });
        return false;
      }

      // 查找预设消息
      const presetMessage = agent.presetMessages.find(msg => msg.id === presetNodeId);
      if (!presetMessage) {
        logger.warn('切换预设消息状态失败：预设节点不存在', { agentId, presetNodeId });
        return false;
      }

      // 切换启用状态
      presetMessage.isEnabled = !(presetMessage.isEnabled ?? true);
      
      // 持久化智能体
      this.persistAgent(agent);
      
      logger.info('预设消息启用状态已切换', {
        agentId,
        presetNodeId,
        role: presetMessage.role,
        isEnabled: presetMessage.isEnabled,
      });

      return true;
    },

    /**
     * 持久化单个智能体到文件（仅保存指定智能体）
     */
    persistAgent(agent: ChatAgent): void {
      const { persistAgent: persistAgentToStorage } = useAgentStorage();
      persistAgentToStorage(agent).catch(error => {
        logger.error('持久化智能体失败', error as Error, {
          agentId: agent.id,
        });
      });
    },

    /**
     * 持久化所有智能体到文件（批量操作）
     */
    persistAgents(): void {
      const { saveAgents } = useAgentStorage();
      saveAgents(this.agents).catch(error => {
        logger.error('持久化所有智能体失败', error as Error, {
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

      // 合并智能体参数和覆盖参数
      const parameters: LlmParameters = {
        // 基础采样参数
        temperature: overrides?.parameterOverrides?.temperature ?? agent.parameters.temperature,
        maxTokens: overrides?.parameterOverrides?.maxTokens ?? agent.parameters.maxTokens,
        topP: overrides?.parameterOverrides?.topP ?? agent.parameters.topP,
        topK: overrides?.parameterOverrides?.topK ?? agent.parameters.topK,
        frequencyPenalty: overrides?.parameterOverrides?.frequencyPenalty ?? agent.parameters.frequencyPenalty,
        presencePenalty: overrides?.parameterOverrides?.presencePenalty ?? agent.parameters.presencePenalty,
        seed: overrides?.parameterOverrides?.seed ?? agent.parameters.seed,
        stop: overrides?.parameterOverrides?.stop ?? agent.parameters.stop,
        // 高级参数
        n: overrides?.parameterOverrides?.n ?? agent.parameters.n,
        logprobs: overrides?.parameterOverrides?.logprobs ?? agent.parameters.logprobs,
        topLogprobs: overrides?.parameterOverrides?.topLogprobs ?? agent.parameters.topLogprobs,
        maxCompletionTokens: overrides?.parameterOverrides?.maxCompletionTokens ?? agent.parameters.maxCompletionTokens,
        reasoningEffort: overrides?.parameterOverrides?.reasoningEffort ?? agent.parameters.reasoningEffort,
        logitBias: overrides?.parameterOverrides?.logitBias ?? agent.parameters.logitBias,
        store: overrides?.parameterOverrides?.store ?? agent.parameters.store,
        user: overrides?.parameterOverrides?.user ?? agent.parameters.user,
        serviceTier: overrides?.parameterOverrides?.serviceTier ?? agent.parameters.serviceTier,
        // 响应格式
        responseFormat: overrides?.parameterOverrides?.responseFormat ?? agent.parameters.responseFormat,
        // 工具调用
        tools: overrides?.parameterOverrides?.tools ?? agent.parameters.tools,
        toolChoice: overrides?.parameterOverrides?.toolChoice ?? agent.parameters.toolChoice,
        parallelToolCalls: overrides?.parameterOverrides?.parallelToolCalls ?? agent.parameters.parallelToolCalls,
        // 多模态输出
        modalities: overrides?.parameterOverrides?.modalities ?? agent.parameters.modalities,
        audio: overrides?.parameterOverrides?.audio ?? agent.parameters.audio,
        prediction: overrides?.parameterOverrides?.prediction ?? agent.parameters.prediction,
        // 特殊功能
        webSearchOptions: overrides?.parameterOverrides?.webSearchOptions ?? agent.parameters.webSearchOptions,
        streamOptions: overrides?.parameterOverrides?.streamOptions ?? agent.parameters.streamOptions,
        metadata: overrides?.parameterOverrides?.metadata ?? agent.parameters.metadata,
        // Claude 特有参数
        thinking: overrides?.parameterOverrides?.thinking ?? agent.parameters.thinking,
        stopSequences: overrides?.parameterOverrides?.stopSequences ?? agent.parameters.stopSequences,
        claudeMetadata: overrides?.parameterOverrides?.claudeMetadata ?? agent.parameters.claudeMetadata,
      };

      return {
        profileId: agent.profileId,
        modelId: agent.modelId,
        presetMessages: agent.presetMessages ?? [],
        parameters,
      };
    },

    /**
     * ===== 导入导出功能 =====
     */

    /**
     * 导出选定的智能体
     * @param agentIds 要导出的智能体 ID 数组
     * @param options 导出选项
     */
    async exportAgents(agentIds: string[], options: { includeAssets: boolean }): Promise<void> {
      try {
        logger.info('开始导出智能体', { agentIds, options });
        const agentsToExport = this.agents.filter(agent => agentIds.includes(agent.id));
        if (agentsToExport.length === 0) {
          customMessage.warning('没有选择要导出的智能体');
          return;
        }

        const zip = new JSZip();
        const assetsFolder = zip.folder('assets');
        const exportableAgents: ExportableAgent[] = [];

        for (const agent of agentsToExport) {
          const exportableAgent: ExportableAgent = {
            name: agent.name,
            description: agent.description,
            icon: agent.icon, // 可能会被后续逻辑替换
            modelId: agent.modelId,
            userProfileId: agent.userProfileId,
            presetMessages: agent.presetMessages,
            displayPresetCount: agent.displayPresetCount,
            parameters: agent.parameters,
            llmThinkRules: agent.llmThinkRules,
            richTextStyleOptions: agent.richTextStyleOptions,
          };

          // 处理图标资产
          if (options.includeAssets && agent.icon) {
            if (agent.icon.startsWith('appdata://')) {
              const relativePath = agent.icon.replace('appdata://', '');
              try {
                const iconBinary = await assetManagerEngine.getAssetBinary(relativePath);
                const originalName = relativePath.split('/').pop() || 'icon.png';
                const uniqueFileName = `icon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${originalName}`;
                assetsFolder?.file(uniqueFileName, iconBinary);
                exportableAgent.icon = `assets/${uniqueFileName}`;
              } catch (error) {
                logger.warn('导出图标失败，将使用原始路径', { agentId: agent.id, iconPath: agent.icon, error });
                // 如果失败，保留原始路径，但记录错误
              }
            }
            // 网络图片或 Emoji 不需要处理
          }
          
          exportableAgents.push(exportableAgent);
        }

        // 创建 agent.json
        const exportData: AgentExportFile = {
          version: 1,
          type: 'AIO_Agent_Export',
          agents: exportableAgents,
        };
        zip.file('agent.json', JSON.stringify(exportData, null, 2));

        // 生成并下载 ZIP 文件
        const content = await zip.generateAsync({ type: 'blob' });

        // 根据导出的 Agent 数量生成更友好的文件名
        const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim();
        let baseName = 'agents_export';
        const count = agentsToExport.length;

        if (count === 1) {
          baseName = sanitizeFilename(agentsToExport[0].name);
        } else if (count > 1 && count <= 3) {
          baseName = agentsToExport.map(a => sanitizeFilename(a.name)).join(' & ');
        } else if (count > 3) {
          baseName = `${agentsToExport.slice(0, 2).map(a => sanitizeFilename(a.name)).join(' & ')}_等${count}个智能体`;
        }
        const fileName = `${baseName}.agent.zip`;
        saveAs(content, fileName);

        logger.info('智能体导出成功', { count: agentsToExport.length, fileName });
        customMessage.success(`成功导出 ${agentsToExport.length} 个智能体`);
      } catch (error) {
        logger.error('导出智能体失败', error as Error, { agentIds });
        customMessage.error(`导出失败: ${error}`);
      }
    },

    /**
     * 预检导入文件
     * @param file 导入的文件
     * @returns 预检结果
     */
    async preflightImportAgents(file: File): Promise<AgentImportPreflightResult> {
      try {
        logger.info('开始预检导入文件', { fileName: file.name, size: file.size });
        
        const assets: Record<string, ArrayBuffer> = {};
        let agentExportFile: AgentExportFile;

        if (file.name.endsWith('.zip')) {
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(file);
          
          // 读取 agent.json
          const agentJsonFile = zipContent.file('agent.json');
          if (!agentJsonFile) {
            throw new Error('ZIP 文件中未找到 agent.json');
          }
          const agentJsonText = await agentJsonFile.async('text');
          agentExportFile = JSON.parse(agentJsonText);

          // 读取所有资产文件
          const assetFiles = zipContent.file(/^assets\/.*/);
          for (const assetFile of assetFiles) {
            if (!assetFile.dir) {
              const binary = await assetFile.async('arraybuffer');
              assets[assetFile.name] = binary;
            }
          }
        } else if (file.name.endsWith('.json')) {
          const jsonText = await file.text();
          agentExportFile = JSON.parse(jsonText);
        } else {
          throw new Error('不支持的文件格式，请选择 .agent.zip 或 .agent.json 文件');
        }

        if (agentExportFile.type !== 'AIO_Agent_Export') {
          throw new Error('无效的智能体导出文件');
        }

        // 检测冲突和模型匹配情况
        const { enabledProfiles } = useLlmProfiles();
        const allModelIds = enabledProfiles.value.flatMap(p => p.models.map(m => m.id));
        const existingAgentNames = this.agents.map(a => a.name);

        const nameConflicts: AgentImportPreflightResult['nameConflicts'] = [];
        const unmatchedModels: AgentImportPreflightResult['unmatchedModels'] = [];

        agentExportFile.agents.forEach((agent, index) => {
          if (existingAgentNames.includes(agent.name)) {
            nameConflicts.push({ agentIndex: index, agentName: agent.name });
          }
          if (!allModelIds.includes(agent.modelId)) {
            unmatchedModels.push({ agentIndex: index, agentName: agent.name, modelId: agent.modelId });
          }
        });

        const result: AgentImportPreflightResult = {
          agents: agentExportFile.agents,
          assets,
          nameConflicts,
          unmatchedModels,
        };

        logger.info('预检导入完成', {
          totalAgents: result.agents.length,
          conflicts: result.nameConflicts.length,
          unmatched: result.unmatchedModels.length,
        });

        return result;
      } catch (error) {
        logger.error('预检导入失败', error as Error, { fileName: file.name });
        customMessage.error(`预检失败: ${error}`);
        throw error;
      }
    },

    /**
     * 确认导入智能体
     * @param params 导入参数，包含已解决冲突的 Agent 列表和资产
     */
    async confirmImportAgents(params: ConfirmImportParams): Promise<void> {
      try {
        logger.info('开始确认导入智能体', { agentCount: params.resolvedAgents.length });

        // 先导入所有资产，并建立映射关系
        const assetPathMapping: Record<string, string> = {};
        for (const [relativePath, binary] of Object.entries(params.assets)) {
          try {
            const originalName = relativePath.split('/').pop() || 'asset';
            const asset = await assetManagerEngine.importAssetFromBytes(binary, originalName, {
              sourceModule: 'llm-chat',
            });
            assetPathMapping[relativePath] = `appdata://${asset.path}`;
          } catch (error) {
            logger.warn('导入资产失败', { relativePath, error });
          }
        }

        // 创建智能体
        for (const resolvedAgent of params.resolvedAgents) {
          // 替换图标路径
          let finalIcon = resolvedAgent.icon;
          if (finalIcon && finalIcon.startsWith('assets/')) {
            finalIcon = assetPathMapping[finalIcon] || resolvedAgent.icon; // 回退到原始路径
          }

          // 如果是覆盖模式，先删除旧的
          if (resolvedAgent.overwriteExisting) {
            const existingAgent = this.agents.find(a => a.name === resolvedAgent.name);
            if (existingAgent) {
              await this.deleteAgent(existingAgent.id);
            }
          }
          
          const agentName = resolvedAgent.newName || resolvedAgent.name;
          const newAgentId = this.createAgent(
            agentName,
            resolvedAgent.finalProfileId,
            resolvedAgent.finalModelId,
            {
              description: resolvedAgent.description,
              icon: finalIcon,
              userProfileId: resolvedAgent.userProfileId,
              presetMessages: resolvedAgent.presetMessages,
              displayPresetCount: resolvedAgent.displayPresetCount,
              parameters: resolvedAgent.parameters,
              llmThinkRules: resolvedAgent.llmThinkRules,
              richTextStyleOptions: resolvedAgent.richTextStyleOptions,
            }
          );
          logger.info('智能体已导入', { agentId: newAgentId, agentName });
        }

        customMessage.success(`成功导入 ${params.resolvedAgents.length} 个智能体`);
      } catch (error) {
        logger.error('确认导入失败', error as Error);
        customMessage.error(`导入失败: ${error}`);
      }
    },
  },
});