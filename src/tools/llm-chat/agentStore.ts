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
import { createModuleErrorHandler } from '@utils/errorHandler';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile, mkdir, readFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { customMessage } from '@/utils/customMessage';

const logger = createModuleLogger('llm-chat/agentStore');
const errorHandler = createModuleErrorHandler('llm-chat/agentStore');

// ===== 导入导出相关类型定义 =====

/**
 * 可导出的 Agent 数据结构（不包含本地元数据）
 */
export interface ExportableAgent {
  name: string;
  displayName?: string;
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
        displayName?: string;
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
      const agentId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const now = new Date().toISOString();

      const agent: ChatAgent = {
        id: agentId,
        name,
        displayName: options?.displayName,
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
          maxTokens: options?.parameters?.maxTokens ?? 8192,
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
      this.persistAgent(agent);

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
      this.persistAgent(agent);

      logger.info('更新智能体', { agentId, updates });
    },

    /**
     * 复制智能体
     * @param agentId 要复制的智能体 ID
     * @returns 新智能体的 ID
     */
    duplicateAgent(agentId: string): string | null {
      const originalAgent = this.getAgentById(agentId);
      if (!originalAgent) {
        logger.warn('复制智能体失败：原始智能体不存在', { agentId });
        return null;
      }

      // 深度复制原始智能体的数据
      const newAgentData = JSON.parse(JSON.stringify(originalAgent));

      // 创建新的唯一 ID 和名称
      const newAgentId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newName = `${originalAgent.name} 副本`;
      const newDisplayName = originalAgent.displayName ? `${originalAgent.displayName} 副本` : undefined;

      // 准备新的智能体对象
      const newAgent: ChatAgent = {
        ...newAgentData,
        id: newAgentId,
        name: newName,
        displayName: newDisplayName,
        createdAt: new Date().toISOString(),
        lastUsedAt: undefined, // 复制出的智能体不应继承使用时间
      };

      this.agents.push(newAgent);
      this.persistAgent(newAgent);

      logger.info('智能体已复制', { originalAgentId: agentId, newAgentId, newName });

      return newAgentId;
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
        this.persistAgent(agent);
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
        errorHandler.error(error as Error, '持久化智能体失败', {
          showToUser: false,
          context: { agentId: agent.id },
        });
      });
    },

    /**
     * 持久化所有智能体到文件（批量操作）
     */
    persistAgents(): void {
      const { saveAgents } = useAgentStorage();
      saveAgents(this.agents).catch(error => {
        errorHandler.error(error as Error, '持久化所有智能体失败', {
          showToUser: false,
          context: { agentCount: this.agents.length },
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
        errorHandler.error(error as Error, '加载智能体失败', { showToUser: false });
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
    async exportAgents(
      agentIds: string[],
      options: {
        includeAssets: boolean;
        format?: 'json' | 'yaml';
        exportType?: 'zip' | 'folder' | 'file';
      }
    ): Promise<void> {
      try {
        logger.info('开始导出智能体', { agentIds, options });
        const agentsToExport = this.agents.filter((agent) => agentIds.includes(agent.id));
        if (agentsToExport.length === 0) {
          customMessage.warning('没有选择要导出的智能体');
          return;
        }

        const format = options.format || 'json';
        const exportType = options.exportType || 'zip';
        const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim();

        // 特殊处理：批量导出且为 file 模式 -> 分离导出到文件夹
        if (exportType === 'file' && agentsToExport.length > 1) {
          const selected = await open({
            directory: true,
            multiple: false,
            title: '选择导出目录',
          });

          if (!selected) {
            logger.info('用户取消了导出目录选择');
            return;
          }

          const targetDir = selected as string;
          let successCount = 0;

          for (const agent of agentsToExport) {
            // 构造单个 Agent 的导出对象
            const exportableAgent: ExportableAgent = {
              name: agent.name,
              displayName: agent.displayName,
              description: agent.description,
              icon: agent.icon, // 仅配置文件模式不处理资产，保持原样
              modelId: agent.modelId,
              userProfileId: agent.userProfileId,
              presetMessages: agent.presetMessages,
              displayPresetCount: agent.displayPresetCount,
              parameters: agent.parameters,
              llmThinkRules: agent.llmThinkRules,
              richTextStyleOptions: agent.richTextStyleOptions,
            };

            const exportData: AgentExportFile = {
              version: 1,
              type: 'AIO_Agent_Export',
              agents: [exportableAgent],
            };

            const contentString = format === 'yaml'
              ? yaml.dump(exportData)
              : JSON.stringify(exportData, null, 2);

            const safeName = sanitizeFilename(agent.name);
            const fileName = `${safeName}.agent.${format}`;
            const filePath = await join(targetDir, fileName);

            await writeTextFile(filePath, contentString);
            successCount++;
          }

          customMessage.success(`成功导出 ${successCount} 个配置文件`);
          return;
        }

        // 下面是常规导出逻辑（ZIP, Folder, 或单文件）

        // 只有 zip 和 folder 模式才支持包含资产，file 模式强制不包含
        const shouldIncludeAssets = options.includeAssets && exportType !== 'file';

        // 生成基础名称（用于文件名或文件夹名）
        let baseName = 'agents_export';
        const count = agentsToExport.length;

        if (count === 1) {
          baseName = sanitizeFilename(agentsToExport[0].name);
        } else if (count > 1 && count <= 3) {
          baseName = agentsToExport.map(a => sanitizeFilename(a.name)).join(' & ');
        } else if (count > 3) {
          baseName = `${agentsToExport.slice(0, 2).map(a => sanitizeFilename(a.name)).join(' & ')}_等${count}个智能体`;
        }

        // 准备导出环境
        const zip = exportType === 'zip' ? new JSZip() : null;
        let targetDir = '';
        let assetsDir = '';

        if (exportType === 'folder') {
          // 选择目标目录
          const selected = await open({
            directory: true,
            multiple: false,
            title: '选择导出目录',
          });

          if (!selected) {
            logger.info('用户取消了导出目录选择');
            return;
          }

          // 创建导出子目录
          targetDir = await join(selected as string, baseName);
          await mkdir(targetDir, { recursive: true });

          if (shouldIncludeAssets) {
            assetsDir = await join(targetDir, 'assets');
            await mkdir(assetsDir, { recursive: true });
          }
        } else if (exportType === 'zip') {
          // ZIP 模式下，assets 文件夹在内存中创建
          if (shouldIncludeAssets) {
            zip?.folder('assets');
          }
        }

        const exportableAgents: ExportableAgent[] = [];

        for (const agent of agentsToExport) {
          const exportableAgent: ExportableAgent = {
            name: agent.name,
            displayName: agent.displayName,
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
          if (shouldIncludeAssets && agent.icon) {
            if (agent.icon.startsWith('appdata://')) {
              const relativePath = agent.icon.replace('appdata://', '');
              try {
                const iconBinary = await assetManagerEngine.getAssetBinary(relativePath);
                const originalName = relativePath.split('/').pop() || 'icon.png';
                const uniqueFileName = `icon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

                if (exportType === 'zip' && zip) {
                  zip.folder('assets')?.file(uniqueFileName, iconBinary);
                } else if (exportType === 'folder' && assetsDir) {
                  const assetPath = await join(assetsDir, uniqueFileName);
                  await writeFile(assetPath, new Uint8Array(iconBinary));
                }

                exportableAgent.icon = `assets/${uniqueFileName}`;
              } catch (error) {
                logger.warn('导出图标失败，将使用原始路径', {
                  agentId: agent.id,
                  iconPath: agent.icon,
                  error,
                });
                // 如果失败，保留原始路径，但记录错误
              }
            } else if (agent.icon.startsWith('/')) {
              // 处理内置资产（如 /agent-icons/...）
              try {
                // 使用 fetch 获取 Web 资源（兼容开发环境和生产环境）
                const response = await fetch(agent.icon);
                if (!response.ok) {
                  throw new Error(`Fetch failed: ${response.statusText}`);
                }
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const iconBinary = new Uint8Array(arrayBuffer);

                const originalName = agent.icon.split('/').pop() || 'icon.png';
                const uniqueFileName = `builtin_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

                if (exportType === 'zip' && zip) {
                  zip.folder('assets')?.file(uniqueFileName, iconBinary);
                } else if (exportType === 'folder' && assetsDir) {
                  const assetPath = await join(assetsDir, uniqueFileName);
                  await writeFile(assetPath, iconBinary);
                }

                exportableAgent.icon = `assets/${uniqueFileName}`;
              } catch (error) {
                logger.warn('导出内置图标失败，将使用原始路径', {
                  agentId: agent.id,
                  iconPath: agent.icon,
                  error,
                });
              }
            } else if (/^[A-Za-z]:[\/\\]/.test(agent.icon) || agent.icon.startsWith('\\\\')) {
              // 处理本地绝对路径（Windows 盘符路径或 UNC 路径）
              try {
                const iconBinary = await readFile(agent.icon);

                // 从路径中提取文件名，处理正反斜杠
                const originalName = agent.icon.split(/[/\\]/).pop() || 'icon.png';
                const uniqueFileName = `local_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

                if (exportType === 'zip' && zip) {
                  zip.folder('assets')?.file(uniqueFileName, iconBinary);
                } else if (exportType === 'folder' && assetsDir) {
                  const assetPath = await join(assetsDir, uniqueFileName);
                  await writeFile(assetPath, iconBinary);
                }

                exportableAgent.icon = `assets/${uniqueFileName}`;
              } catch (error) {
                logger.warn('导出本地图标失败，将使用原始路径', {
                  agentId: agent.id,
                  iconPath: agent.icon,
                  error,
                });
              }
            }
            // 网络图片或 Emoji 不需要处理
          }
          exportableAgents.push(exportableAgent);
        }

        // 创建导出数据对象
        const exportData: AgentExportFile = {
          version: 1,
          type: 'AIO_Agent_Export',
          agents: exportableAgents,
        };

        const contentString = format === 'yaml'
          ? yaml.dump(exportData)
          : JSON.stringify(exportData, null, 2);

        const configFileName = `agent.${format}`;

        if (exportType === 'zip' && zip) {
          zip.file(configFileName, contentString);

          // 生成 ZIP 文件数据
          const content = await zip.generateAsync({ type: 'uint8array' });
          const fileName = `${baseName}.agent.zip`;

          // 使用系统对话框保存文件
          const savePath = await save({
            defaultPath: fileName,
            filters: [{
              name: 'Agent Export Zip',
              extensions: ['zip']
            }]
          });

          if (savePath) {
            await writeFile(savePath, content);
            logger.info('智能体导出成功 (ZIP)', { count: agentsToExport.length, fileName: savePath });
          } else {
            logger.info('用户取消了 ZIP 导出');
            return; // 用户取消，不显示成功消息
          }
        } else if (exportType === 'folder' && targetDir) {
          // 写入配置文件
          const configPath = await join(targetDir, configFileName);
          await writeTextFile(configPath, contentString);

          logger.info('智能体导出成功 (Folder)', { count: agentsToExport.length, targetDir });
        } else if (exportType === 'file') {
          // 直接导出单个配置文件
          const fileName = `${baseName}.agent.${format}`;

          const savePath = await save({
            defaultPath: fileName,
            filters: [{
              name: `Agent Export ${format.toUpperCase()}`,
              extensions: [format]
            }]
          });

          if (savePath) {
            await writeTextFile(savePath, contentString);
            logger.info('智能体导出成功 (File)', { count: agentsToExport.length, fileName: savePath });
          } else {
            logger.info('用户取消了文件导出');
            return;
          }
        }

        customMessage.success(`成功导出 ${agentsToExport.length} 个智能体`);
      } catch (error) {
        errorHandler.error(error as Error, '导出智能体失败', { context: { agentIds } });
      }
    },

    /**
     * 预检导入文件（支持单个或批量）
     * @param files 导入的文件或文件数组
     * @returns 预检结果
     */
    async preflightImportAgents(files: File | File[]): Promise<AgentImportPreflightResult> {
      try {
        const fileList = Array.isArray(files) ? files : [files];
        logger.info('开始预检导入文件', { count: fileList.length });

        const combinedAgents: ExportableAgent[] = [];
        const combinedAssets: Record<string, ArrayBuffer> = {};

        // 辅助函数：解析单个文件
        const parseFile = async (file: File, fileIndex: number) => {
          let agentExportFile: AgentExportFile;
          const fileAssets: Record<string, ArrayBuffer> = {};

          if (file.name.endsWith('.zip')) {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            const agentJsonFile = zipContent.file('agent.json');
            const agentYamlFile = zipContent.file('agent.yaml') || zipContent.file('agent.yml');

            if (agentJsonFile) {
              const agentJsonText = await agentJsonFile.async('text');
              agentExportFile = JSON.parse(agentJsonText);
            } else if (agentYamlFile) {
              const agentYamlText = await agentYamlFile.async('text');
              agentExportFile = yaml.load(agentYamlText) as AgentExportFile;
            } else {
              throw new Error(`ZIP 文件 ${file.name} 中未找到 agent.json 或 agent.yaml`);
            }

            const assetFiles = zipContent.file(/^assets\/.*/);
            for (const assetFile of assetFiles) {
              if (!assetFile.dir) {
                const binary = await assetFile.async('arraybuffer');
                fileAssets[assetFile.name] = binary;
              }
            }
          } else if (file.name.endsWith('.json')) {
            const jsonText = await file.text();
            agentExportFile = JSON.parse(jsonText);
          } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
            const yamlText = await file.text();
            agentExportFile = yaml.load(yamlText) as AgentExportFile;
          } else {
            throw new Error(
              `不支持的文件格式: ${file.name}，请选择 .agent.zip, .agent.json, .agent.yaml 或 .agent.yml 文件`
            );
          }

          if (agentExportFile.type !== 'AIO_Agent_Export') {
            throw new Error(`无效的智能体导出文件: ${file.name}`);
          }

          // 处理资产合并（避免多文件导入时的资产冲突）
          // 如果有资产，给资产路径加上前缀，并更新 agent 中的引用
          const assetPrefix = fileList.length > 1 ? `file_${fileIndex}_` : '';

          for (const [path, content] of Object.entries(fileAssets)) {
            // path 类似 "assets/icon.png"
            const fileName = path.split('/').pop() || 'unknown';
            const newPath = `assets/${assetPrefix}${fileName}`;
            combinedAssets[newPath] = content;
          }

          // 将 agent 加入总列表，并更新图标引用
          agentExportFile.agents.forEach(agent => {
            if (agent.icon && agent.icon.startsWith('assets/') && assetPrefix) {
              const fileName = agent.icon.split('/').pop() || 'unknown';
              agent.icon = `assets/${assetPrefix}${fileName}`;
            }
            combinedAgents.push(agent);
          });
        };

        // 并行处理所有文件
        await Promise.all(fileList.map((file, index) => parseFile(file, index)));

        // 检测冲突和模型匹配情况
        const { enabledProfiles } = useLlmProfiles();
        const allModelIds = enabledProfiles.value.flatMap(p => p.models.map(m => m.id));
        const existingAgentNames = this.agents.map(a => a.name);

        const nameConflicts: AgentImportPreflightResult['nameConflicts'] = [];
        const unmatchedModels: AgentImportPreflightResult['unmatchedModels'] = [];

        combinedAgents.forEach((agent, index) => {
          if (existingAgentNames.includes(agent.name)) {
            nameConflicts.push({ agentIndex: index, agentName: agent.name });
          }
          if (!allModelIds.includes(agent.modelId)) {
            unmatchedModels.push({ agentIndex: index, agentName: agent.name, modelId: agent.modelId });
          }
        });

        const result: AgentImportPreflightResult = {
          agents: combinedAgents,
          assets: combinedAssets,
          nameConflicts,
          unmatchedModels,
        };

        logger.info('预检导入完成', {
          fileCount: fileList.length,
          totalAgents: result.agents.length,
          conflicts: result.nameConflicts.length,
          unmatched: result.unmatchedModels.length,
        });

        return result;
      } catch (error) {
        errorHandler.error(error as Error, '预检导入失败');
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
              displayName: resolvedAgent.displayName,
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
        errorHandler.error(error as Error, '确认导入失败');
      }
    },
  },
});