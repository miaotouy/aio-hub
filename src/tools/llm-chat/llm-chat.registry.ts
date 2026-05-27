/**
 * LLM Chat 外观服务 (Registry)
 *
 * 轻量级外观服务，为外部调用（尤其是 Agent）提供对 llm-chat 的编程接口。
 * 本文件主要负责工具注册、UI 配置和元数据定义。
 * 核心业务逻辑已迁移至 services/llmChatService.ts。
 *
 * 采用多实例注册模式（类似 knowledge-base）：
 * - llmChatMain: 输入管理、会话查询、分离组件（核心编程接口）
 * - agentManagement: 智能体管理（Agent Callable，可独立开关）
 */

import type {
  ToolRegistry,
  ToolConfig,
  ServiceMetadata,
} from "@/services/types";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { markRaw, computed, type Ref } from "vue";
import { ChatDotRound } from "@element-plus/icons-vue";
import { useDetachedChatArea } from "./composables/ui/useDetachedChatArea";
import { useDetachedChatInput } from "./composables/ui/useDetachedChatInput";
import { useLlmChatStateConsumer } from "./composables/ui/useLlmChatStateConsumer";
import { resolveAvatarPath } from "./composables/ui/useResolvedAvatar";
import {
  llmChatService,
  type InputOperationResult,
  type AddContentOptions,
} from "./services/llmChatService";
import type { Asset } from "@/types/asset-management";
import type {
  ChatSessionIndex,
  ChatSessionDetail,
  ChatAgent,
  UserProfile,
} from "./types";
import * as agentManagementService from "./services/agentManagementService";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "LLM 对话",
  path: "/llm-chat",
  icon: markRaw(ChatDotRound),
  component: () => import("./LlmChat.vue"),
  description:
    "树状分支对话工具，支持智能体管理、附件上传、多会话系统和上下文分析",
  category: ["AI 工具"],
};

// ==================== 主服务实例：输入管理 + 分离组件 ====================

/**
 * useDetachedChatArea 的适配器
 * 将旧的返回结构转换为新的 { props, listeners } 格式
 */
function useDetachedChatAreaAdapter(): {
  props: Ref<any>;
  listeners: Record<string, Function>;
} {
  const chatArea = useDetachedChatArea();

  return {
    props: computed(() => ({
      isDetached: true,
      messages: chatArea.messages.value,
      isSending: chatArea.isSending.value,
      disabled: chatArea.disabled.value,
      currentAgentId: chatArea.currentAgentId.value,
      currentModelId: chatArea.currentModelId.value,
    })),
    listeners: {
      send: chatArea.sendMessage,
      abort: chatArea.abortSending,
      "delete-message": chatArea.deleteMessage,
      regenerate: chatArea.regenerateLastMessage,
      "switch-sibling": chatArea.switchSibling,
      "toggle-enabled": chatArea.toggleEnabled,
      "edit-message": chatArea.editMessage,
      "abort-node": chatArea.abortNode,
      "create-branch": chatArea.createBranch,
      "analyze-context": chatArea.analyzeContext,
    },
  };
}

/**
 * LLM Chat 主服务 - 输入管理与分离组件
 *
 * 提供对 llm-chat 输入框、附件、会话的编程接口，
 * 以及可分离组件的注册配置。
 */
class LlmChatRegistry implements ToolRegistry {
  public readonly id = "llm-chat";
  public readonly name = "LLM 聊天输入管理";
  public readonly description =
    "管理 LLM 聊天输入框的内容和附件，支持跨窗口和工具间协同";

  // ==================== 核心业务方法 (委托给 Service) ====================

  /** 向输入框添加内容 */
  public addContentToInput(
    content: string,
    options: AddContentOptions = {}
  ): InputOperationResult {
    return llmChatService.addContentToInput(content, options);
  }

  /** 获取当前输入框内容 */
  public getInputContent(): string {
    return llmChatService.getInputContent();
  }

  /** 设置输入框内容（完全覆盖） */
  public setInputContent(content: string): InputOperationResult {
    return llmChatService.setInputContent(content);
  }

  /** 获取当前附件列表 */
  public getAttachments(): readonly Asset[] {
    return llmChatService.getAttachments();
  }

  /** 批量添加附件（来自 Asset 对象） */
  public addAssets(assets: Asset[]): number {
    return llmChatService.addAssets(assets);
  }

  /** 批量添加附件（从文件路径） */
  public async addAttachmentsFromPaths(paths: string[]): Promise<void> {
    return llmChatService.addAttachmentsFromPaths(paths);
  }

  /** 移除单个附件 */
  public removeAttachment(assetId: string): boolean {
    return llmChatService.removeAttachment(assetId);
  }

  /** 清空所有附件 */
  public clearAttachments(): void {
    llmChatService.clearAttachments();
  }

  /** 清空输入框和附件 */
  public clearInput(): InputOperationResult {
    return llmChatService.clearInput();
  }

  /** 获取输入框的完整状态（推荐 Agent 使用） */
  public getInputState() {
    return llmChatService.getInputState();
  }

  /** 预处理工作流：获取内容 -> 处理 -> 写回 */
  public async processContent(
    processor: (content: string) => string | Promise<string>
  ): Promise<InputOperationResult> {
    return llmChatService.processContent(processor);
  }

  /** 确保所有相关的 Store 已初始化并加载数据 */
  public async ensureInitialized(): Promise<void> {
    return llmChatService.ensureInitialized();
  }

  /** 获取所有会话索引 */
  public getSessions(): ChatSessionIndex[] {
    return llmChatService.getSessions();
  }

  /** 获取当前活跃会话索引 */
  public getCurrentSession(): ChatSessionIndex | null {
    return llmChatService.getCurrentSession();
  }

  /** 获取当前活跃会话详情 */
  public getCurrentSessionDetail(): ChatSessionDetail | null {
    return llmChatService.getCurrentSessionDetail();
  }

  /** 获取所有智能体 */
  public getAgents(): ChatAgent[] {
    return llmChatService.getAgents();
  }

  /** 获取当前选中的智能体 */
  public getCurrentAgent(): ChatAgent | null {
    return llmChatService.getCurrentAgent();
  }

  /** 获取所有用户档案 */
  public getUserProfiles(): UserProfile[] {
    return llmChatService.getUserProfiles();
  }

  /** 获取全局选中的用户档案 */
  public getGlobalUserProfile(): UserProfile | null {
    return llmChatService.getGlobalUserProfile();
  }

  /** 发送消息 */
  public async sendMessage(
    content: string,
    options?: { parentId?: string }
  ): Promise<void> {
    return llmChatService.sendMessage(content, options);
  }

  // ==================== 分离组件配置 ====================

  public readonly detachableComponents: Record<
    string,
    DetachableComponentRegistration
  > = {
    // LLM Chat: 对话区域
    "llm-chat:chat-area": {
      component: () => import("./components/ChatArea.vue"),
      logicHook: () => useDetachedChatAreaAdapter(),
      initializeEnvironment: () =>
        useLlmChatStateConsumer({ syncAllSessions: true }),
      disableNativeResize: true, // 禁用原生窗口边缘缩放，使用组件自带的缩放逻辑
    },
    // LLM Chat: 消息输入框
    "llm-chat:chat-input": {
      component: () => import("./components/message-input/MessageInput.vue"),
      logicHook: useDetachedChatInput,
      initializeEnvironment: () =>
        useLlmChatStateConsumer({ syncAllSessions: true }),
      disableNativeResize: true, // 禁用原生窗口边缘缩放，使用组件自带的缩放逻辑
    },
  };
}

// ==================== 智能体管理实例（独立注册，可单独开关） ====================

/**
 * 智能体管理服务
 *
 * 提供智能体的 CRUD、配置读写、预设消息管理等 Agent Callable 方法。
 * 独立注册为单独的工具实例，方便分组开关。
 */
const agentManagement: ToolRegistry = {
  id: "llm-chat-agent-mgmt",
  name: "智能体管理",
  description: "管理 LLM 聊天智能体的配置、预设消息和导入导出",

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "list_agents",
          displayName: "列出智能体",
          description: "列出所有智能体的摘要信息，支持按分类或标签过滤",
          parameters: [
            {
              name: "filter",
              type: "string",
              required: false,
              description: "过滤条件，如 'category:xxx' 或 'tag:xxx'",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "search_agents",
          displayName: "搜索智能体",
          description: "按关键词搜索智能体（匹配名称、描述、标签）",
          parameters: [
            {
              name: "query",
              type: "string",
              required: true,
              description: "搜索关键词",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "read_agent_config",
          displayName: "读取智能体配置",
          description:
            "读取智能体的配置信息（YAML 格式），支持按 section 分段读取",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "section",
              type: "string",
              required: false,
              description:
                "配置分段（metadata/presetMessages/parameters/toolCallConfig/regexConfig/knowledgeConfig/assets/advanced/all）",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "export_agent_as_text",
          displayName: "导出智能体配置",
          description: "将智能体完整配置导出为文本（YAML 或 JSON）",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "format",
              type: "string",
              required: false,
              description: "导出格式：yaml（默认）或 json",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "set_agent_field",
          displayName: "设置字段",
          description: "通过路径式定位设置智能体配置字段的值",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "path",
              type: "string",
              required: true,
              description:
                "字段路径（如 'name', 'parameters.temperature', 'presetMessages[0].content'）",
            },
            {
              name: "value",
              type: "string",
              required: true,
              description: "新值（自动推断类型：布尔/数字/JSON/字符串）",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "find_replace_in_presets",
          displayName: "查找替换",
          description: "在智能体预设消息的 content 中执行查找替换",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "search",
              type: "string",
              required: true,
              description: "要查找的文本或正则表达式",
            },
            {
              name: "replace",
              type: "string",
              required: true,
              description: "替换为的文本",
            },
            {
              name: "regex",
              type: "string",
              required: false,
              description: "是否使用正则模式（'true'/'false'）",
            },
            {
              name: "messageId",
              type: "string",
              required: false,
              description: "限定在指定消息 ID 中操作",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "add_preset_message",
          displayName: "添加预设消息",
          description: "向智能体添加一条新的预设消息",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "role",
              type: "string",
              required: true,
              description: "消息角色：system/user/assistant",
            },
            {
              name: "content",
              type: "string",
              required: true,
              description: "消息内容",
            },
            {
              name: "name",
              type: "string",
              required: false,
              description: "消息名称标识",
            },
            {
              name: "position",
              type: "string",
              required: false,
              description:
                "插入位置（start/end/before:chat_history/after:chat_history/before:id/after:id）",
            },
            {
              name: "injectionStrategy",
              type: "string",
              required: false,
              description: "注入策略 JSON",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "delete_preset_message",
          displayName: "删除预设消息",
          description: "删除智能体中指定的预设消息",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "messageId",
              type: "string",
              required: true,
              description: "要删除的预设消息 ID",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "move_preset_message",
          displayName: "移动预设消息",
          description: "移动已有预设消息到新位置（调整顺序）",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "智能体 ID",
            },
            {
              name: "messageId",
              type: "string",
              required: true,
              description: "要移动的预设消息 ID",
            },
            {
              name: "position",
              type: "string",
              required: true,
              description:
                "目标位置（start/end/before:chat_history/after:chat_history/before:id/after:id）",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "import_agent_from_text",
          displayName: "导入智能体配置",
          description: "从 YAML/JSON 文本创建新的智能体",
          parameters: [
            {
              name: "text",
              type: "string",
              required: true,
              description: "智能体配置文本（YAML 或 JSON 格式）",
            },
            {
              name: "format",
              type: "string",
              required: false,
              description: "格式提示：yaml/json/auto（默认 auto）",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  },

  // ==================== Agent Callable Methods ====================

  async list_agents(args: { filter?: string }): Promise<string> {
    return await agentManagementService.list_agents(args);
  },

  async search_agents(args: { query: string }): Promise<string> {
    return await agentManagementService.search_agents(args);
  },

  async read_agent_config(args: {
    agentId: string;
    section?: string;
  }): Promise<string> {
    return await agentManagementService.read_agent_config(args);
  },

  async export_agent_as_text(args: {
    agentId: string;
    format?: string;
  }): Promise<string> {
    return await agentManagementService.export_agent_as_text(args);
  },

  async set_agent_field(args: {
    agentId: string;
    path: string;
    value: string;
  }): Promise<string> {
    return await agentManagementService.set_agent_field(args);
  },

  async find_replace_in_presets(args: {
    agentId: string;
    search: string;
    replace: string;
    regex?: string;
    messageId?: string;
  }): Promise<string> {
    return await agentManagementService.find_replace_in_presets(args);
  },

  async add_preset_message(args: {
    agentId: string;
    role: string;
    content: string;
    name?: string;
    position?: string;
    injectionStrategy?: string;
  }): Promise<string> {
    return await agentManagementService.add_preset_message(args);
  },

  async delete_preset_message(args: {
    agentId: string;
    messageId: string;
  }): Promise<string> {
    return await agentManagementService.delete_preset_message(args);
  },

  async move_preset_message(args: {
    agentId: string;
    messageId: string;
    position: string;
  }): Promise<string> {
    return await agentManagementService.move_preset_message(args);
  },

  async import_agent_from_text(args: {
    text: string;
    format?: string;
  }): Promise<string> {
    return await agentManagementService.import_agent_from_text(args);
  },
};

// ==================== 导出 ====================

// 主实例（供直接导入使用）
const llmChatMain = new LlmChatRegistry();

// 多实例数组导出（供 auto-register 自动发现）
export default [llmChatMain, agentManagement];

// 导出单例实例供跨工具直接使用（如 ffmpeg-tools）
export { llmChatMain as llmChatRegistry };
// 导出类型供 useSendToChat 等使用
export type { LlmChatRegistry };

// 重导出工具函数供跨工具使用
export { resolveAvatarPath };
