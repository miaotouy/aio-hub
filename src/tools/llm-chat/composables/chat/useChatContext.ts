import { inject, provide, type InjectionKey, type Ref } from "vue";
import type { ChatSessionIndex, ChatSessionDetail } from "../../types/session";
import type { Asset } from "@/types/asset-management";
import type { MacroDefinition } from "../../macro-engine";
import type { QuickAction } from "../../types/quick-action";

/**
 * 对话上下文的状态部分
 */
export interface ChatContextState {
  /** 是否正在发送/生成中 */
  isSending: Ref<boolean>;
  /** 是否禁用输入 */
  disabled: Ref<boolean>;
  /** 当前选中的智能体 ID */
  currentAgentId?: Ref<string | undefined>;
  /** 当前会话索引 */
  currentSessionIndex?: Ref<ChatSessionIndex | null>;
  /** 当前会话详情 */
  currentSessionDetail?: Ref<ChatSessionDetail | null>;
}

/**
 * 对话上下文的操作部分
 */
export interface ChatContextActions {
  /** 发送新消息（从 inputManager 获取内容） */
  send: () => Promise<void>;
  /** 中止当前生成 */
  abort: () => void;
  /** 删除指定消息 */
  deleteMessage?: (messageId: string) => void;
  /** 重新生成指定消息 */
  regenerate?: (messageId: string, options?: { modelId?: string; profileId?: string }) => Promise<void>;
  /** 切换兄弟分支 */
  switchSibling?: (nodeId: string, direction: "prev" | "next") => void;
  /** 切换到指定分支 */
  switchBranch?: (nodeId: string) => void;
  /** 切换节点启用状态 */
  toggleEnabled?: (nodeId: string) => void;
  /** 编辑消息内容 */
  editMessage?: (nodeId: string, newContent: string, attachments?: Asset[]) => void;
  /** 中止单个节点的生成 */
  abortNode?: (nodeId: string) => void;
  /** 创建新分支 */
  createBranch?: (nodeId: string) => void;
  /** 分析上下文 */
  analyzeContext?: (nodeId: string) => void;
  /** 保存编辑内容到新分支 */
  saveToBranch?: (nodeId: string, newContent: string, attachments?: Asset[]) => void;
  /** 续写消息 */
  continue?: (nodeId: string, options?: { modelId?: string; profileId?: string }) => void;
  /** 智能补全输入 */
  completeInput?: (content: string, options?: { modelId?: string; profileId?: string }) => void;
  /** 执行快捷操作 */
  executeQuickAction?: (action: QuickAction) => void;
  /** 插入宏变量 */
  insertMacro?: (macro: MacroDefinition) => void;
  /** 翻译输入内容 */
  translateInput?: () => Promise<void>;
  /** 压缩上下文 */
  compressContext?: () => Promise<void>;
  /** 转换路径为附件 */
  convertPaths?: () => Promise<void>;
  /** 打开智能体设置 */
  openAgentSettings?: (tab?: string, section?: string) => void;
  /** 分析当前上下文（带输入内容） */
  analyzeContextWithInput?: () => void;
  /** 触发附件选择 */
  triggerAttachment?: () => void;
  /** 切换会话 */
  switchSession?: (sessionId: string) => void;
  /** 新建会话 */
  newSession?: () => void;
}

/**
 * 完整的对话上下文接口
 */
export interface ChatContext {
  state: ChatContextState;
  actions: ChatContextActions;
}

export const CHAT_CONTEXT_KEY: InjectionKey<ChatContext> = Symbol("ChatContext");

/**
 * 提供对话上下文
 */
export function provideChatContext(context: ChatContext) {
  provide(CHAT_CONTEXT_KEY, context);
}

/**
 * 注入对话上下文
 */
export function useChatContext() {
  const context = inject(CHAT_CONTEXT_KEY);
  if (!context) {
    throw new Error("useChatContext must be used within a provider");
  }
  return context;
}