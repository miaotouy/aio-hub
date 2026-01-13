/**
 * LLM Chat 外观服务
 *
 * 轻量级外观服务，为外部调用（尤其是 Agent）提供对 llm-chat 输入框的编程接口。
 * 不包含核心业务逻辑，仅作为 useChatInputManager 的薄层封装。
 */

import type { ToolRegistry, ToolConfig } from '@/services/types';
import type { DetachableComponentRegistration } from '@/types/detachable';
import { markRaw } from 'vue';
import { ChatDotRound } from '@element-plus/icons-vue';
import { useChatInputManager } from './composables/useChatInputManager';
import { useLlmChatStore } from './stores/llmChatStore';
import { useAgentStore } from './stores/agentStore';
import { useUserProfileStore } from './stores/userProfileStore';
import { useDetachedChatArea } from './composables/useDetachedChatArea';
import { useDetachedChatInput } from './composables/useDetachedChatInput';
import { useLlmChatStateConsumer } from './composables/useLlmChatStateConsumer';
import { resolveAvatarPath } from './composables/useResolvedAvatar';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import type { Asset } from '@/types/asset-management';
import { computed, type Ref } from 'vue';
import type { ChatSession, ChatAgent, UserProfile } from './types';

const logger = createModuleLogger('services/llm-chat');
const errorHandler = createModuleErrorHandler('services/llm-chat');

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
  position?: 'append' | 'prepend';
}

// ==================== 服务类 ====================

export default class LlmChatRegistry implements ToolRegistry {
  public readonly id = 'llm-chat';
  public readonly name = 'LLM 聊天输入管理';
  public readonly description = '管理 LLM 聊天输入框的内容和附件，支持跨窗口和工具间协同';

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
  public addContentToInput(
    content: string,
    options: AddContentOptions = {}
  ): InputOperationResult {
    return errorHandler.wrapSync(
      () => {
        const { position = 'append' } = options;

        logger.info('添加内容到输入框', {
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
        userMessage: '添加内容到输入框失败',
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
        logger.debug('获取输入框内容', { contentLength: content.length });
        return content;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '获取输入框内容失败',
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
        logger.info('设置输入框内容', { contentLength: content.length });

        this.inputManager.setContent(content);

        return {
          success: true,
          currentContent: this.inputManager.getContent(),
          currentAttachmentCount: this.inputManager.attachmentCount.value,
        };
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '设置输入框内容失败',
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
        logger.debug('获取附件列表', { count: attachments.length });
        return attachments;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '获取附件列表失败',
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
        logger.info('批量添加 Assets', { count: assets.length });
        const addedCount = this.inputManager.addAssets(assets);
        if (addedCount < assets.length) {
          logger.warn('部分附件添加失败（可能是重复或已满）', {
            requested: assets.length,
            added: addedCount,
            currentCount: this.inputManager.attachmentCount.value,
          });
        }
        return addedCount;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '添加附件失败',
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
        logger.info('从路径批量添加附件', { count: paths.length });
        await this.inputManager.addAttachments(paths);
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '批量添加附件失败',
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
        logger.info('移除附件', { assetId });
        const removed = this.inputManager.removeAttachment(assetId);
        if (!removed) {
          logger.warn('附件不存在', { assetId });
        }
        return removed;
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '移除附件失败',
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
        logger.info('清空附件');
        this.inputManager.clearAttachments();
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '清空附件失败',
      }
    );
  }

  /**
   * 清空输入框和附件
   */
  public clearInput(): InputOperationResult {
    return errorHandler.wrapSync(
      () => {
        logger.info('清空输入框和附件');
        this.inputManager.clear();

        return {
          success: true,
          currentContent: '',
          currentAttachmentCount: 0,
        };
      },
      {
        level: ErrorLevel.WARNING,
        userMessage: '清空输入框失败',
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
   * @example
   * ```ts
   * // 将输入框内容转换为大写
   * await llmChatService.processContent(content => content.toUpperCase());
   * ```
   */
  public async processContent(
    processor: (content: string) => string | Promise<string>
  ): Promise<InputOperationResult> {
    const result = await errorHandler.wrapAsync(
      async () => {
        const originalContent = this.getInputContent();
        logger.info('开始处理输入框内容', {
          originalLength: originalContent.length,
        });

        const processedContent = await processor(originalContent);

        logger.info('内容处理完成', {
          originalLength: originalContent.length,
          processedLength: processedContent.length,
        });

        return this.setInputContent(processedContent);
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '处理输入框内容失败',
      }
    );

    // 如果发生错误，返回当前状态
    return result || {
      success: false,
      currentContent: this.getInputContent(),
      currentAttachmentCount: this.inputManager.attachmentCount.value,
    };
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
      logger.info('正在惰性初始化 LlmChat 数据...');
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
    return agentId ? (this.agentStore.getAgentById(agentId) || null) : null;
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
  public async sendMessage(
    content: string,
    options?: { parentId?: string }
  ): Promise<void> {
    await errorHandler.wrapAsync(
      async () => {
        logger.info('通过 Registry 发送消息', { contentLength: content.length });
        // 直接触发发送，不修改输入框状态，避免覆盖用户草稿或残留内容
        const { useLlmChatStore } = await import('./stores/llmChatStore');
        const store = useLlmChatStore();

        // 如果没有当前会话，尝试自动选择或创建
        if (!store.currentSession) {
          if (store.sessions.length > 0) {
            // 情况1：有历史会话但未选中 -> 自动切换到最近使用的会话
            const sortedSessions = [...store.sessions].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            const targetSession = sortedSessions[0];
            logger.info('自动切换到最近使用的会话', {
              sessionId: targetSession.id,
              sessionName: targetSession.name,
            });
            store.switchSession(targetSession.id);
          } else {
            // 情况2：完全没有会话 -> 尝试自动创建新会话
            const { useAgentStore } = await import('./stores/agentStore');
            const agentStore = useAgentStore();

            if (agentStore.currentAgentId) {
              logger.info('没有可用会话，自动创建新会话', {
                agentId: agentStore.currentAgentId
              });
              store.createSession(agentStore.currentAgentId);
            } else {
              // 情况3：连 Agent 都没选 -> 抛出错误让用户去选
              throw new Error('请先选择一个智能体或创建一个会话');
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
        userMessage: '发送消息失败',
        context: { content },
      }
    );
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
        'delete-message': chatArea.deleteMessage,
        'regenerate': chatArea.regenerateLastMessage,
        'switch-sibling': chatArea.switchSibling,
        'toggle-enabled': chatArea.toggleEnabled,
        'edit-message': chatArea.editMessage,
        'abort-node': chatArea.abortNode,
        'create-branch': chatArea.createBranch,
        'analyze-context': chatArea.analyzeContext,
      },
    };
  }

  /**
   * 工具提供的可分离组件配置
   */
  public readonly detachableComponents: Record<string, DetachableComponentRegistration> = {
    // LLM Chat: 对话区域
    'llm-chat:chat-area': {
      component: () => import('./components/ChatArea.vue'),
      logicHook: () => this.useDetachedChatAreaAdapter(),
      initializeEnvironment: () => useLlmChatStateConsumer({ syncAllSessions: true }),
    },
    // LLM Chat: 消息输入框
    'llm-chat:chat-input': {
      component: () => import('./components/message-input/MessageInput.vue'),
      logicHook: useDetachedChatInput,
      initializeEnvironment: () => useLlmChatStateConsumer({ syncAllSessions: true }),
    },
  };

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据（仅包含对外公开的高级接口）
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'addContentToInput',
          description: '向输入框添加内容',
          parameters: [
            {
              name: 'content',
              type: 'string',
              required: true,
              description: '要添加的内容',
            },
            {
              name: 'options',
              type: 'AddContentOptions',
              required: false,
              description: '添加选项',
              properties: [
                {
                  name: 'position',
                  type: '"append" | "prepend"',
                  required: false,
                  description: '添加位置，默认为 "append"',
                },
              ],
            },
          ],
          returnType: 'InputOperationResult',
          example: `
// 追加内容
service.addContentToInput('这是新的一行');

// 在开头插入内容
service.addContentToInput('这是开头的内容', { position: 'prepend' });`,
        },
        {
          name: 'getInputContent',
          description: '获取当前输入框的完整内容',
          parameters: [],
          returnType: 'string',
          example: `
const content = service.getInputContent();
console.log('当前输入框内容:', content);`,
        },
        {
          name: 'setInputContent',
          description: '设置输入框内容（完全覆盖）',
          parameters: [
            {
              name: 'content',
              type: 'string',
              required: true,
              description: '新内容',
            },
          ],
          returnType: 'InputOperationResult',
          example: `
service.setInputContent('完全替换为这段内容');`,
        },
        {
          name: 'getInputState',
          description: '获取输入框的完整状态（推荐 Agent 使用）',
          parameters: [],
          returnType: '{ content, contentLength, attachments, attachmentCount, hasContent, hasAttachments }',
          example: `
const state = service.getInputState();
console.log('输入框状态:', state);
// 返回: { content: "...", contentLength: 123, attachments: [...], ... }`,
        },
        {
          name: 'processContent',
          description: '预处理工作流：获取内容 -> 处理 -> 写回',
          parameters: [
            {
              name: 'processor',
              type: '(content: string) => string | Promise<string>',
              required: true,
              description: '处理函数',
            },
          ],
          returnType: 'Promise<InputOperationResult>',
          example: `
// 将输入框内容转换为大写
await service.processContent(content => content.toUpperCase());

// 使用正则替换
await service.processContent(content => {
  return content.replace(/old/g, 'new');
});`,
        },
        {
          name: 'sendMessage',
          description: '发送消息（直接发送，不修改输入框状态）',
          parameters: [
            {
              name: 'content',
              type: 'string',
              required: true,
              description: '要发送的消息内容',
            },
            {
              name: 'options',
              type: '{ parentId?: string }',
              required: false,
              description: '发送选项，可指定父节点 ID 以创建新分支',
            },
          ],
          returnType: 'Promise<void>',
          example: `
// 发送一条消息
await service.sendMessage('你好，请帮我分析一下这个文件');

// 在指定消息下创建新分支
await service.sendMessage('这是新分支的内容', { parentId: 'msg-123' });`,
        },
        {
          name: 'getAttachments',
          description: '获取当前附件列表',
          parameters: [],
          returnType: 'Asset[]',
          example: `
const attachments = service.getAttachments();
console.log('附件数量:', attachments.length);`,
        },
        {
          name: 'addAssets',
          description: '批量添加附件（来自 Asset 对象）。推荐使用此方法。',
          parameters: [
            {
              name: 'assets',
              type: 'Asset[]',
              required: true,
              description: '要添加的资产对象数组',
            },
          ],
          returnType: 'number',
          example: `
// 添加单个
service.addAssets([assetObject]);

// 添加多个
service.addAssets([asset1, asset2]);`,
        },
        {
          name: 'addAttachmentsFromPaths',
          description: '批量添加附件（从文件路径）',
          parameters: [
            {
              name: 'paths',
              type: 'string[]',
              required: true,
              description: '文件路径列表',
            },
          ],
          returnType: 'Promise<void>',
          example: `
await service.addAttachmentsFromPaths([
  '/path/to/image1.png',
  '/path/to/document.pdf'
]);`,
        },
        {
          name: 'removeAttachment',
          description: '移除单个附件',
          parameters: [
            {
              name: 'assetId',
              type: 'string',
              required: true,
              description: '要移除的附件 ID',
            },
          ],
          returnType: 'boolean',
          example: `
service.removeAttachment('asset-id-123');`,
        },
        {
          name: 'clearAttachments',
          description: '清空所有附件（不影响文本内容）',
          parameters: [],
          returnType: 'void',
          example: `
service.clearAttachments();`,
        },
        {
          name: 'clearInput',
          description: '清空输入框和所有附件',
          parameters: [],
          returnType: 'InputOperationResult',
          example: `
service.clearInput();`,
        },
        {
          name: 'getSessions',
          description: '获取所有会话列表',
          parameters: [],
          returnType: 'ChatSession[]',
        },
        {
          name: 'getAgents',
          description: '获取所有智能体列表',
          parameters: [],
          returnType: 'ChatAgent[]',
        },
        {
          name: 'getUserProfiles',
          description: '获取所有用户档案列表',
          parameters: [],
          returnType: 'UserProfile[]',
        },
      ],
    };
  }
}

// 导出单例实例供直接使用
export const llmChatRegistry = new LlmChatRegistry();

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: 'LLM 对话',
  path: '/llm-chat',
  icon: markRaw(ChatDotRound),
  component: () => import('./LlmChat.vue'),
  description: '树状分支对话工具，支持智能体管理、附件上传、多会话系统和上下文分析',
  category: 'AI 工具'
};

// 重导出工具函数供跨工具使用
export { resolveAvatarPath };