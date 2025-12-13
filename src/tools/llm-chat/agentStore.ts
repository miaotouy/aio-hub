/**
 * 智能体管理 Store
 */

import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatSettings } from "./composables/useChatSettings";
import { useAgentStorageSeparated as useAgentStorage } from "./composables/useAgentStorageSeparated";
import { useLlmChatUiState } from "./composables/useLlmChatUiState";
import type {
  ChatAgent,
  ChatMessageNode,
  LlmParameters,
  AgentCategory,
} from "./types";
import type {
  LlmThinkRule,
  RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { getLocalISOString } from "@/utils/time";
import { exportAgents } from "./services/agentExportService";
import {
  preflightImportAgents,
  commitImportAgents,
} from "./services/agentImportService";
import type { ConfirmImportParams } from "./types/agentImportExport";

const logger = createModuleLogger("llm-chat/agentStore");
const errorHandler = createModuleErrorHandler("llm-chat/agentStore");

// 重新导出类型，保持向后兼容
export type {
  ExportableAgent,
  AgentExportFile,
  AgentImportPreflightResult,
  ResolvedAgentToImport,
  ConfirmImportParams,
} from "./types/agentImportExport";

interface AgentStoreState {
  /** 所有智能体列表 */
  agents: ChatAgent[];
}

export const useAgentStore = defineStore("llmChatAgent", {
  state: (): AgentStoreState => ({
    agents: [],
  }),

  getters: {
    /**
     * 根据 ID 获取智能体
     */
    getAgentById:
      (state) =>
      (id: string): ChatAgent | undefined => {
        return state.agents.find((agent) => agent.id === id);
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
        tags?: string[];
        category?: AgentCategory;
        regexConfig?: import("./types").ChatRegexConfig;
      },
    ): string {
      const agentId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const now = getLocalISOString();

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
        tags: options?.tags,
        category: options?.category,
        regexConfig: options?.regexConfig,
        parameters: {
          // 默认值
          temperature: 0.7,
          maxTokens: 8192,
          // 传入的标准参数会覆盖默认值
          ...(options?.parameters || {}),
          // 单独处理自定义参数容器，确保它不会被上面的展开覆盖掉
          custom: options?.parameters?.custom || undefined,
        },
        createdAt: now,
      };

      this.agents.push(agent);
      this.persistAgent(agent);

      logger.info("创建新智能体", {
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
    updateAgent(
      agentId: string,
      updates: Partial<Omit<ChatAgent, "id" | "createdAt">>,
    ): void {
      const agent = this.agents.find((a) => a.id === agentId);
      if (!agent) {
        logger.warn("更新智能体失败：智能体不存在", { agentId });
        return;
      }

      Object.assign(agent, updates);
      this.persistAgent(agent);

      logger.info("更新智能体", { agentId, updates });
    },
    /**
     * 复制智能体
     * @param agentId 要复制的智能体 ID
     * @returns 新智能体的 ID
     */
    async duplicateAgent(agentId: string): Promise<string | null> {
      const originalAgent = this.getAgentById(agentId);
      if (!originalAgent) {
        logger.warn("复制智能体失败：原始智能体不存在", { agentId });
        return null;
      }

      // 深度复制智能体的数据
      const newAgentData = JSON.parse(JSON.stringify(originalAgent));

      // 创建新的唯一 ID
      const newAgentId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      // 保持 name 不变，因为这可能被宏引用（如 {{char}}）使用
      const newName = originalAgent.name;

      // 生成唯一的显示名称
      // 逻辑：优先使用 displayName，没有则使用 name，然后加上“副本”后缀并自动编号
      const baseDisplayName = originalAgent.displayName || originalAgent.name;

      // 获取所有现有的“显示名称”（用于冲突检查）
      // 如果 agent 有 displayName 则取之，否则取 name
      const existingVisibleNames = this.agents.map(
        (a) => a.displayName || a.name,
      );

      const generateUniqueDisplayName = (base: string, existing: string[]) => {
        let name = `${base} 副本`;
        let counter = 1;
        while (existing.includes(name)) {
          name = `${base} 副本 (${counter})`;
          counter++;
        }
        return name;
      };

      const newDisplayName = generateUniqueDisplayName(
        baseDisplayName,
        existingVisibleNames,
      );

      // 如果 icon 是一个私有资产（纯文件名），则复制它
      const icon = originalAgent.icon;
      // 修正判断逻辑：
      // 1. 必须存在
      // 2. 不包含路径分隔符 (\ 或 /)
      // 3. 不包含冒号 (排除 http:, https:, appdata: 等协议)
      // 4. 包含点号 (文件名通常有扩展名，而 Emoji 没有)
      // 之前的 /\p{Emoji}/u 会错误地匹配数字，导致文件名被误判为 Emoji
      const isAssetIcon = icon && !/[\\/:]/.test(icon) && icon.includes(".");

      logger.debug("尝试复制智能体头像", {
        agentId,
        icon,
        isAssetIcon,
        hasPathOrProtocol: icon ? /[\\/:]/.test(icon) : "N/A",
        hasDot: icon ? icon.includes(".") : "N/A",
      });

      if (isAssetIcon) {
        try {
          // 1. 构建源文件相对路径
          const sourceRelativePath = `llm-chat/agents/${originalAgent.id}/${icon}`;
          logger.debug("读取源头像文件", { path: sourceRelativePath });

          // 2. 读取源文件二进制数据
          const fileData: number[] = await invoke("read_app_data_file_binary", {
            relativePath: sourceRelativePath,
          });

          // 3. 构建目标子目录
          const targetSubdirectory = `llm-chat/agents/${newAgentId}`;
          logger.debug("写入新头像文件", {
            dir: targetSubdirectory,
            filename: icon,
          });

          // 4. 写入新文件
          await invoke("save_uploaded_file", {
            fileData,
            subdirectory: targetSubdirectory,
            filename: icon,
          });

          logger.info("成功复制智能体头像", {
            from: sourceRelativePath,
            to: targetSubdirectory,
          });
        } catch (error) {
          logger.error("复制智能体头像过程中出错", error as Error, {
            agentId: originalAgent.id,
            icon,
          });
          // 即使头像复制失败，也继续创建智能体，只是没有头像
        }
      } else {
        logger.debug("跳过头像复制：不是私有资产", { icon });
      }

      // 准备新的智能体对象
      const newAgent: ChatAgent = {
        ...newAgentData,
        id: newAgentId,
        name: newName,
        displayName: newDisplayName,
        createdAt: getLocalISOString(),
        lastUsedAt: undefined, // 复制出的智能体不应继承使用时间
      };

      this.agents.push(newAgent);
      this.persistAgent(newAgent);

      logger.info("智能体已复制", {
        originalAgentId: agentId,
        newAgentId,
        newName,
      });

      return newAgentId;
    },

    /**
     * 删除智能体
     */
    async deleteAgent(agentId: string): Promise<void> {
      const index = this.agents.findIndex((a) => a.id === agentId);
      if (index === -1) {
        logger.warn("删除智能体失败：智能体不存在", { agentId });
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

      logger.info("智能体已删除", { agentId, name: agent.name });
    },

    /**
     * 选择智能体（独立于会话）
     * 注意：仅选择不更新 lastUsedAt，只有真正使用（如发送消息）时才更新
     */
    selectAgent(agentId: string): void {
      const agent = this.agents.find((a) => a.id === agentId);
      if (!agent) {
        logger.warn("选择智能体失败：智能体不存在", { agentId });
        return;
      }

      const { currentAgentId } = useLlmChatUiState();
      currentAgentId.value = agentId;
      // 不在这里更新 lastUsedAt，避免选择时改变列表排序
      logger.info("选择智能体", { agentId, name: agent.name });
    },

    /**
     * 更新智能体的最后使用时间
     */
    updateLastUsed(agentId: string): void {
      const agent = this.agents.find((a) => a.id === agentId);
      if (agent) {
        agent.lastUsedAt = getLocalISOString();
        this.persistAgent(agent);
      }
    },

    /**
     * 更新智能体的预设消息内容
     */
    updatePresetMessage(
      agentId: string,
      presetNodeId: string,
      newContent: string,
    ): boolean {
      const agent = this.agents.find((a) => a.id === agentId);
      if (!agent || !agent.presetMessages) {
        logger.warn("更新预设消息失败：智能体或预设消息不存在", {
          agentId,
          presetNodeId,
        });
        return false;
      }

      // 查找并更新预设消息
      const presetMessage = agent.presetMessages.find(
        (msg) => msg.id === presetNodeId,
      );
      if (!presetMessage) {
        logger.warn("更新预设消息失败：预设节点不存在", {
          agentId,
          presetNodeId,
        });
        return false;
      }

      // 更新内容
      presetMessage.content = newContent;

      // 持久化智能体
      this.persistAgent(agent);

      logger.info("预设消息已更新", {
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
      const agent = this.agents.find((a) => a.id === agentId);
      if (!agent || !agent.presetMessages) {
        logger.warn("切换预设消息状态失败：智能体或预设消息不存在", {
          agentId,
          presetNodeId,
        });
        return false;
      }

      // 查找预设消息
      const presetMessage = agent.presetMessages.find(
        (msg) => msg.id === presetNodeId,
      );
      if (!presetMessage) {
        logger.warn("切换预设消息状态失败：预设节点不存在", {
          agentId,
          presetNodeId,
        });
        return false;
      }

      // 切换启用状态
      presetMessage.isEnabled = !(presetMessage.isEnabled ?? true);

      // 持久化智能体
      this.persistAgent(agent);

      logger.info("预设消息启用状态已切换", {
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
      persistAgentToStorage(agent).catch((error) =>
        errorHandler.handle(error as Error, {
          userMessage: "持久化智能体失败",
          showToUser: false,
          context: { agentId: agent.id },
        }),
      );
    },

    /**
     * 持久化所有智能体到文件（批量操作）
     */
    persistAgents(): void {
      const { saveAgents } = useAgentStorage();
      saveAgents(this.agents).catch((error) =>
        errorHandler.handle(error as Error, {
          userMessage: "持久化所有智能体失败",
          showToUser: false,
          context: { agentCount: this.agents.length },
        }),
      );
    },

    /**
     * 从文件加载智能体
     */
    async loadAgents(): Promise<void> {
      try {
        const { loadAgents } = useAgentStorage();
        const agents = await loadAgents();

        if (agents.length > 0) {
          // 在加载后立即进行数据迁移
          for (const agent of agents) {
            if (agent.parameters?.custom) {
              const custom = agent.parameters.custom as any;
              // 检查是否为旧格式（是对象，但没有 enabled 和 params 属性）
              if (
                typeof custom === "object" &&
                custom !== null &&
                !("enabled" in custom) &&
                !("params" in custom)
              ) {
                logger.info("迁移旧版 custom 参数格式", { agentId: agent.id });
                agent.parameters.custom = {
                  enabled: Object.keys(custom).length > 0, // 如果旧对象有内容，则默认启用
                  params: custom,
                };
              }
            }
          }

          this.agents = agents;
          logger.info("加载智能体成功", { agentCount: this.agents.length });

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
        errorHandler.handle(error as Error, {
          userMessage: "加载智能体失败",
          showToUser: false,
        });
        this.agents = [];
        this.createDefaultAgents();
      }
    },

    /**
     * 创建默认智能体
     */
    createDefaultAgents(): void {
      const { enabledProfiles } = useLlmProfiles();
      const { settings } = useChatSettings();

      if (enabledProfiles.value.length === 0) {
        logger.warn("无法创建默认智能体：没有可用的 Profile");
        return;
      }

      const firstProfile = enabledProfiles.value[0];

      // 确定使用的模型：优先使用全局默认模型，否则回退到第一个 Profile 的第一个模型
      let targetModelId = settings.value.modelPreferences.defaultModel;

      // 验证默认模型是否有效（存在于当前启用的 Profile 中）
      const isDefaultModelValid = enabledProfiles.value.some((p) =>
        p.models.some((m) => m.id === targetModelId),
      );

      if (!targetModelId || !isDefaultModelValid) {
        if (firstProfile.models.length === 0) {
          logger.warn("无法创建默认智能体：Profile 没有可用模型");
          return;
        }
        targetModelId = firstProfile.models[0].id;
        logger.info("全局默认模型未设置或无效，回退使用第一个可用模型", {
          targetModelId,
        });
      }

      // 创建默认的预设消息
      const defaultPresetMessages: ChatMessageNode[] = [
        {
          id: `preset-system-${Date.now()}`,
          parentId: null,
          childrenIds: [],
          content: "你是一个友好且乐于助人的 AI 助手。",
          role: "system",
          status: "complete",
          isEnabled: true,
          timestamp: getLocalISOString(),
        },
      ];

      // 创建默认智能体（占位角色）
      const defaultAgentId = this.createAgent(
        "助手",
        firstProfile.id,
        targetModelId,
        {
          description: "一个可以自由定制的对话伙伴",
          icon: "✨",
          presetMessages: defaultPresetMessages,
          parameters: {
            temperature: 0.7,
            maxTokens: 4096,
            topP: undefined,
            topK: undefined,
            frequencyPenalty: undefined,
            presencePenalty: undefined,
          },
        },
      );

      // 自动选中默认智能体
      const { currentAgentId } = useLlmChatUiState();
      currentAgentId.value = defaultAgentId;

      this.persistAgents();
      logger.info("创建默认智能体", { agentId: defaultAgentId });
    },

    /**
     * 从智能体获取完整配置（包括参数覆盖）
     */
    getAgentConfig(
      agentId: string,
      overrides?: {
        parameterOverrides?: Partial<LlmParameters>;
      },
    ) {
      const agent = this.getAgentById(agentId);
      if (!agent) {
        logger.warn("获取智能体配置失败：智能体不存在", { agentId });
        return null;
      }

      // 分别合并基础参数和自定义参数容器
      // 合并参数时需要更智能地处理 custom 结构
      const baseParams = agent.parameters;
      const overrideParams = overrides?.parameterOverrides || {};

      const parameters: LlmParameters = {
        ...baseParams,
        ...overrideParams,
        // 智能合并 custom
        custom: {
          enabled:
            overrideParams.custom?.enabled ?? baseParams.custom?.enabled ?? false,
          params: {
            ...(baseParams.custom?.params || {}),
            ...(overrideParams.custom?.params || {}),
          },
        },
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
        format?: "json" | "yaml";
        exportType?: "zip" | "folder" | "file";
        separateFolders?: boolean;
      },
    ): Promise<void> {
      const agentsToExport = this.agents.filter((agent) =>
        agentIds.includes(agent.id),
      );
      await exportAgents(agentsToExport, options);
    },

    /**
     * 预检导入文件（支持单个或批量）
     * @param files 导入的文件或文件数组
     * @returns 预检结果
     */
    async preflightImportAgents(files: File | File[]) {
      const { enabledProfiles } = useLlmProfiles();
      const availableModelIds = enabledProfiles.value.flatMap((p) =>
        p.models.map((m) => m.id),
      );
      // 收集所有现有的显示名称（用于冲突检测，避免 UI 上混淆）
      const existingDisplayNames = this.agents.map(
        (a) => a.displayName || a.name,
      );

      return await preflightImportAgents(files, {
        existingAgentNames: existingDisplayNames, // 这里传递的是显示名称列表
        availableModelIds,
      });
    },

    /**
     * 确认导入智能体
     * @param params 导入参数，包含已解决冲突的 Agent 列表和资产
     */
    async confirmImportAgents(params: ConfirmImportParams): Promise<void> {
      try {
        logger.info("开始确认导入智能体", {
          agentCount: params.resolvedAgents.length,
        });

        // 将所有复杂的处理逻辑委托给 agentImportService
        await commitImportAgents(params);

        customMessage.success(
          `成功导入 ${params.resolvedAgents.length} 个智能体`,
        );
      } catch (error) {
        // commitImportAgents 内部已经处理了错误，这里只记录顶层失败
        errorHandler.handle(error as Error, { userMessage: "确认导入失败" });
      }
    },
  },
});
