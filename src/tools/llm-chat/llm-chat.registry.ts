/**
 * LLM Chat 外观服务 (Registry)
 *
 * 轻量级外观服务，为外部调用（尤其是 Agent）提供对 llm-chat 的编程接口。
 * 本文件主要负责工具注册、UI 配置和元数据定义。
 * 核心业务逻辑已迁移至 services/llmChatService.ts。
 */

import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { markRaw, computed, type Ref } from "vue";
import { ChatDotRound } from "@element-plus/icons-vue";
import { useDetachedChatArea } from "./composables/ui/useDetachedChatArea";
import { useDetachedChatInput } from "./composables/ui/useDetachedChatInput";
import { useLlmChatStateConsumer } from "./composables/ui/useLlmChatStateConsumer";
import { resolveAvatarPath } from "./composables/ui/useResolvedAvatar";
import { llmChatService, type InputOperationResult, type AddContentOptions } from "./services/llmChatService";
import type { Asset } from "@/types/asset-management";
import type { ChatSessionIndex, ChatSessionDetail, ChatAgent, UserProfile } from "./types";

// ==================== 服务类 ====================

export default class LlmChatRegistry implements ToolRegistry {
  public readonly id = "llm-chat";
  public readonly name = "LLM 聊天输入管理";
  public readonly description = "管理 LLM 聊天输入框的内容和附件，支持跨窗口和工具间协同";

  // ==================== 核心业务方法 (委托给 Service) ====================

  /**
   * 向输入框添加内容
   */
  public addContentToInput(content: string, options: AddContentOptions = {}): InputOperationResult {
    return llmChatService.addContentToInput(content, options);
  }

  /**
   * 获取当前输入框内容
   */
  public getInputContent(): string {
    return llmChatService.getInputContent();
  }

  /**
   * 设置输入框内容（完全覆盖）
   */
  public setInputContent(content: string): InputOperationResult {
    return llmChatService.setInputContent(content);
  }

  /**
   * 获取当前附件列表
   */
  public getAttachments(): readonly Asset[] {
    return llmChatService.getAttachments();
  }

  /**
   * 批量添加附件（来自 Asset 对象）
   */
  public addAssets(assets: Asset[]): number {
    return llmChatService.addAssets(assets);
  }

  /**
   * 批量添加附件（从文件路径）
   */
  public async addAttachmentsFromPaths(paths: string[]): Promise<void> {
    return llmChatService.addAttachmentsFromPaths(paths);
  }

  /**
   * 移除单个附件
   */
  public removeAttachment(assetId: string): boolean {
    return llmChatService.removeAttachment(assetId);
  }

  /**
   * 清空所有附件
   */
  public clearAttachments(): void {
    llmChatService.clearAttachments();
  }

  /**
   * 清空输入框和附件
   */
  public clearInput(): InputOperationResult {
    return llmChatService.clearInput();
  }

  /**
   * 获取输入框的完整状态（推荐 Agent 使用）
   */
  public getInputState() {
    return llmChatService.getInputState();
  }

  /**
   * 预处理工作流：获取内容 -> 处理 -> 写回
   */
  public async processContent(processor: (content: string) => string | Promise<string>): Promise<InputOperationResult> {
    return llmChatService.processContent(processor);
  }

  /**
   * 确保所有相关的 Store 已初始化并加载数据
   */
  public async ensureInitialized(): Promise<void> {
    return llmChatService.ensureInitialized();
  }

  /**
   * 获取所有会话索引
   */
  public getSessions(): ChatSessionIndex[] {
    return llmChatService.getSessions();
  }

  /**
   * 获取当前活跃会话索引
   */
  public getCurrentSession(): ChatSessionIndex | null {
    return llmChatService.getCurrentSession();
  }

  /**
   * 获取当前活跃会话详情
   */
  public getCurrentSessionDetail(): ChatSessionDetail | null {
    return llmChatService.getCurrentSessionDetail();
  }

  /**
   * 获取所有智能体
   */
  public getAgents(): ChatAgent[] {
    return llmChatService.getAgents();
  }

  /**
   * 获取当前选中的智能体
   */
  public getCurrentAgent(): ChatAgent | null {
    return llmChatService.getCurrentAgent();
  }

  /**
   * 获取所有用户档案
   */
  public getUserProfiles(): UserProfile[] {
    return llmChatService.getUserProfiles();
  }

  /**
   * 获取全局选中的用户档案
   */
  public getGlobalUserProfile(): UserProfile | null {
    return llmChatService.getGlobalUserProfile();
  }

  /**
   * 发送消息
   */
  public async sendMessage(content: string, options?: { parentId?: string }): Promise<void> {
    return llmChatService.sendMessage(content, options);
  }

  // ==================== 分离组件配置 ====================

  /**
   * useDetachedChatArea 的适配器
   * 将旧的返回结构转换为新的 { props, listeners } 格式
   */
  private useDetachedChatAreaAdapter(): { props: Ref<any>; listeners: Record<string, Function> } {
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
   * 工具提供的可分离组件配置
   */
  public readonly detachableComponents: Record<string, DetachableComponentRegistration> = {
    // LLM Chat: 对话区域
    "llm-chat:chat-area": {
      component: () => import("./components/ChatArea.vue"),
      logicHook: () => this.useDetachedChatAreaAdapter(),
      initializeEnvironment: () => useLlmChatStateConsumer({ syncAllSessions: true }),
      disableNativeResize: true, // 禁用原生窗口边缘缩放，使用组件自带的缩放逻辑
    },
    // LLM Chat: 消息输入框
    "llm-chat:chat-input": {
      component: () => import("./components/message-input/MessageInput.vue"),
      logicHook: useDetachedChatInput,
      initializeEnvironment: () => useLlmChatStateConsumer({ syncAllSessions: true }),
      disableNativeResize: true, // 禁用原生窗口边缘缩放，使用组件自带的缩放逻辑
    },
  };
}

// 导出单例实例供直接使用
export const llmChatRegistry = new LlmChatRegistry();

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "LLM 对话",
  path: "/llm-chat",
  icon: markRaw(ChatDotRound),
  component: () => import("./LlmChat.vue"),
  description: "树状分支对话工具，支持智能体管理、附件上传、多会话系统和上下文分析",
  category: ["AI 工具"],
};

// 重导出工具函数供跨工具使用
export { resolveAvatarPath };
