/**
 * LLM Chat 核心业务服务
 *
 * 包含输入框管理、消息发送、会话管理等核心业务逻辑。
 * 从 llmChat.registry.ts 中抽离，以便于维护和复用。
 */

import { useChatInputManager } from "../composables/input/useChatInputManager";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useAgentStore } from "../stores/agentStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import type { Asset } from "@/types/asset-management";
import type { ChatSession, ChatAgent, UserProfile } from "../types";

const logger = createModuleLogger("services/llm-chat-service");
const errorHandler = createModuleErrorHandler("services/llm-chat-service");

// ==================== 类型定义 ====================

/**
 * 输入框操作结果
 */
export interface InputOperationResult {
  success: boolean;
  currentContent: string;
  currentAttachmentCount: number;
}

/**
 * 添加内容的选项
 */
export interface AddContentOptions {
  /** 添加位置 */
  position?: "append" | "prepend";
}

// ==================== 服务类 ====================

export class LlmChatService {
  private _inputManager: ReturnType<typeof useChatInputManager> | null = null;
  private _chatStore: ReturnType<typeof useLlmChatStore> | null = null;
  private _agentStore: ReturnType<typeof useAgentStore> | null = null;
  private _userProfileStore: ReturnType<typeof useUserProfileStore> | null = null;

  /**
   * 获取输入管理器实例（惰性初始化）
   */
  private get inputManager() {
    if (!this._inputManager) {
      this._inputManager = useChatInputManager();
    }
    return this._inputManager;
  }

  /**
   * 获取聊天 Store（惰性初始化）
   */
  private get chatStore() {
    if (!this._chatStore) {
      this._chatStore = useLlmChatStore();
    }
    return this._chatStore;
  }

  /**
   * 获取智能体 Store（惰性初始化）
   */
  private get agentStore() {
    if (!this._agentStore) {
      this._agentStore = useAgentStore();
    }
    return this._agentStore;
  }

  /**
   * 获取用户档案 Store（惰性初始化）
   */
  private get userProfileStore() {
    if (!this._userProfileStore) {
      this._userProfileStore = useUserProfileStore();
    }
    return this._userProfileStore;
  }

  // ==================== 核心业务方法 ====================

  /**
   * 向输入框添加内容
   * @param content 要添加的内容
   * @param options 添加选项
   */
  public addContentToInput(content: string, options: AddContentOptions = {}): InputOperationResult {
    return errorHandler.wrapSync(
      () => {
        const { position = "append" } = options;

        logger.info("添加内容到输入框", {
          contentLength: content.length,
          position,
        });

        this.inputManager.addContent(content, position);

        return {
          success: true,
          currentContent: this.inputManager.getContent(),
          currentAttachmentCount: this.inputManager.attachmentCount.value,
        };
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "添加内容到输入框失败",
        context: { content, options },
      }
    )!;
  }

  /**
   * 获取当前输入框内容
   */
  public getInputContent(): string {
    return errorHandler.wrapSync(
      () => {
        const content = this.inputManager.getContent();
        logger.debug("获取输入框内容", { contentLength: content.length });
        return content;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: "获取输入框内容失败",
      }
    )!;
  }

  /**
   * 设置输入框内容（完全覆盖）
   * @param content 新内容
   */
  public setInputContent(content: string): InputOperationResult {
    return errorHandler.wrapSync(
      () => {
        logger.info("设置输入框内容", { contentLength: content.length });

        this.inputManager.setContent(content);

        return {
          success: true,
          currentContent: this.inputManager.getContent(),
          currentAttachmentCount: this.inputManager.attachmentCount.value,
        };
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "设置输入框内容失败",
        context: { content },
      }
    )!;
  }

  /**
   * 获取当前附件列表
   */
  public getAttachments(): readonly Asset[] {
    return errorHandler.wrapSync(
      () => {
        const attachments = this.inputManager.getAttachments();
        logger.debug("获取附件列表", { count: attachments.length });
        return attachments;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: "获取附件列表失败",
      }
    )!;
  }

  /**
   * 批量添加附件（来自 Asset 对象）
   * @param assets 要添加的资产列表
   * @returns 成功添加的附件数量
   */
  public addAssets(assets: Asset[]): number {
    return errorHandler.wrapSync(
      () => {
        logger.info("批量添加 Assets", { count: assets.length });
        const addedCount = this.inputManager.addAssets(assets);
        if (addedCount < assets.length) {
          logger.warn("部分附件添加失败（可能是重复或已满）", {
            requested: assets.length,
            added: addedCount,
            currentCount: this.inputManager.attachmentCount.value,
          });
        }
        return addedCount;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: "添加附件失败",
        context: { assets },
      }
    )!;
  }

  /**
   * 批量添加附件（从文件路径）
   * @param paths 文件路径列表
   */
  public async addAttachmentsFromPaths(paths: string[]): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        logger.info("从路径批量添加附件", { count: paths.length });
        await this.inputManager.addAttachments(paths);
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "批量添加附件失败",
        context: { paths },
      }
    );
  }

  /**
   * 移除单个附件
   * @param assetId 要移除的附件 ID
   * @returns 是否成功移除（附件不存在返回 false）
   */
  public removeAttachment(assetId: string): boolean {
    return errorHandler.wrapSync(
      () => {
        logger.info("移除附件", { assetId });
        const removed = this.inputManager.removeAttachment(assetId);
        if (!removed) {
          logger.warn("附件不存在", { assetId });
        }
        return removed;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: "移除附件失败",
        context: { assetId },
      }
    )!;
  }

  /**
   * 清空所有附件
   */
  public clearAttachments(): void {
    errorHandler.wrapSync(
      () => {
        logger.info("清空附件");
        this.inputManager.clearAttachments();
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: "清空附件失败",
      }
    );
  }

  /**
   * 清空输入框和附件
   */
  public clearInput(): InputOperationResult {
    return errorHandler.wrapSync(
      () => {
        logger.info("清空输入框和附件");
        this.inputManager.clear();

        return {
          success: true,
          currentContent: "",
          currentAttachmentCount: 0,
        };
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: "清空输入框失败",
      }
    )!;
  }

  // ==================== 高级封装方法（Agent 调用接口）====================

  /**
   * 获取输入框的完整状态（推荐 Agent 使用）
   */
  public getInputState(): {
    content: string;
    contentLength: number;
    attachments: readonly Asset[];
    attachmentCount: number;
    hasContent: boolean;
    hasAttachments: boolean;
  } {
    const content = this.getInputContent();
    const attachments = this.getAttachments();

    return {
      content,
      contentLength: content.length,
      attachments,
      attachmentCount: attachments.length,
      hasContent: content.trim().length > 0,
      hasAttachments: attachments.length > 0,
    };
  }

  /**
   * 预处理工作流：获取内容 -> 处理 -> 写回
   * 这是一个便捷方法，用于实现"从输入框取内容 -> 处理 -> 写回"的工作流
   *
   * @param processor 处理函数，接收当前内容，返回处理后的内容
   */
  public async processContent(processor: (content: string) => string | Promise<string>): Promise<InputOperationResult> {
    const result = await errorHandler.wrapAsync(
      async () => {
        const originalContent = this.getInputContent();
        logger.info("开始处理输入框内容", {
          originalLength: originalContent.length,
        });

        const processedContent = await processor(originalContent);

        logger.info("内容处理完成", {
          originalLength: originalContent.length,
          processedLength: processedContent.length,
        });

        return this.setInputContent(processedContent);
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "处理输入框内容失败",
      }
    );

    // 如果发生错误，返回当前状态
    return (
      result || {
        success: false,
        currentContent: this.getInputContent(),
        currentAttachmentCount: this.inputManager.attachmentCount.value,
      }
    );
  }

  /**
   * 确保所有相关的 Store 已初始化并加载数据
   */
  public async ensureInitialized(): Promise<void> {
    const tasks = [];

    if (this.agentStore.agents.length === 0) {
      tasks.push(this.agentStore.loadAgents());
    }

    if (this.userProfileStore.profiles.length === 0) {
      tasks.push(this.userProfileStore.loadProfiles());
    }

    if (this.chatStore.sessions.length === 0) {
      tasks.push(this.chatStore.loadSessions());
    }

    if (tasks.length > 0) {
      logger.info("正在惰性初始化 LlmChat 数据...");
      await Promise.all(tasks);
    }
  }

  /**
   * 获取所有会话
   */
  public getSessions(): ChatSession[] {
    if (this.chatStore.sessions.length === 0) {
      this.chatStore.loadSessions();
    }
    return this.chatStore.sessions;
  }

  /**
   * 获取当前活跃会话
   */
  public getCurrentSession(): ChatSession | null {
    return this.chatStore.currentSession;
  }

  /**
   * 获取所有智能体
   */
  public getAgents(): ChatAgent[] {
    if (this.agentStore.agents.length === 0) {
      this.agentStore.loadAgents();
    }
    return this.agentStore.agents;
  }

  /**
   * 获取当前选中的智能体
   */
  public getCurrentAgent(): ChatAgent | null {
    const agentId = this.agentStore.currentAgentId;
    return agentId ? this.agentStore.getAgentById(agentId) || null : null;
  }

  /**
   * 获取所有用户档案
   */
  public getUserProfiles(): UserProfile[] {
    if (this.userProfileStore.profiles.length === 0) {
      this.userProfileStore.loadProfiles();
    }
    return this.userProfileStore.profiles;
  }

  /**
   * 获取全局选中的用户档案
   */
  public getGlobalUserProfile(): UserProfile | null {
    return this.userProfileStore.globalProfile;
  }

  /**
   * 发送消息
   * 注意：此方法直接通过 store 发送消息，不会修改输入框的内容，以免覆盖用户的正在输入的草稿。
   * 如果没有当前会话但有可用会话，会自动切换到最近使用的会话。
   * @param content 要发送的内容
   * @param options 发送选项
   */
  public async sendMessage(content: string, options?: { parentId?: string }): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        logger.info("通过 Service 发送消息", { contentLength: content.length });

        const store = this.chatStore;

        // 如果没有当前会话，尝试自动选择或创建
        if (!store.currentSession) {
          if (store.sessions.length > 0) {
            // 情况1：有历史会话但未选中 -> 自动切换到最近使用的会话
            const sortedSessions = [...store.sessions].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            const targetSession = sortedSessions[0];
            logger.info("自动切换到最近使用的会话", {
              sessionId: targetSession.id,
              sessionName: targetSession.name,
            });
            store.switchSession(targetSession.id);
          } else {
            // 情况2：完全没有会话 -> 尝试自动创建新会话
            const agentStore = this.agentStore;

            if (agentStore.currentAgentId) {
              logger.info("没有可用会话，自动创建新会话", {
                agentId: agentStore.currentAgentId,
              });
              store.createSession(agentStore.currentAgentId);
            } else {
              // 情况3：连 Agent 都没选 -> 抛出错误让用户去选
              throw new Error("请先选择一个智能体或创建一个会话");
            }
          }
        }

        // 自动携带输入框中选择的临时模型
        const temporaryModel = this.inputManager.temporaryModel.value;
        const sendOptions = {
          ...options,
          temporaryModel,
        };

        await store.sendMessage(content, sendOptions);
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "发送消息失败",
        context: { content },
      }
    );
  }
}

// 导出单例实例
export const llmChatService = new LlmChatService();
