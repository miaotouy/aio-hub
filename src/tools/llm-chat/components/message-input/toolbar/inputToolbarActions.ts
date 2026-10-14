// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type { Component } from "vue";
import {
  Paperclip,
  AtSign,
  BookOpenCheck,
  WandSparkles,
  Type,
  MessageSquare,
  MessageSquarePlus,
  Wrench,
  Settings,
  Maximize2,
  Minimize2,
  Sparkles,
  Languages,
  Package,
  FileUp,
  ScanSearch,
  Scissors,
  ClipboardPaste,
  Unlock,
  Eraser,
} from "lucide-vue-next";
import type { InputToolbarActionId } from "../../../types/input-toolbar";

export interface ToolbarActionDefinition {
  id: InputToolbarActionId;
  label: string;
  icon: Component;
  group: "聊天与资料" | "输入处理" | "会话与显示";
  kind?: "panel" | "toggle";
  testId?: string;
}
export interface ToolbarAction extends ToolbarActionDefinition {
  visible: boolean;
  disabled: boolean;
  active: boolean;
  expanded?: boolean;
  controls?: string;
  busy?: boolean;
  badge?: string;
  tooltip?: string;
}
export const INPUT_TOOLBAR_ACTIONS: ToolbarActionDefinition[] = [
  { id: "attachment", label: "添加附件", icon: Paperclip, group: "聊天与资料" },
  {
    id: "temporary-model",
    label: "临时指定模型",
    icon: AtSign,
    group: "聊天与资料",
  },
  {
    id: "knowledge",
    label: "引用 Knowledge 资料库",
    icon: BookOpenCheck,
    group: "聊天与资料",
    kind: "panel",
    testId: "chat-knowledge-reference-button",
  },
  {
    id: "macro",
    label: "添加宏变量",
    icon: WandSparkles,
    group: "聊天与资料",
    kind: "panel",
  },
  {
    id: "streaming",
    label: "流式输出",
    icon: Type,
    group: "会话与显示",
    kind: "toggle",
  },
  {
    id: "sessions",
    label: "切换会话",
    icon: MessageSquare,
    group: "会话与显示",
    kind: "panel",
    testId: "chat-session-list-button",
  },
  {
    id: "new-session",
    label: "新建会话",
    icon: MessageSquarePlus,
    group: "会话与显示",
    testId: "chat-toolbar-new-session",
  },
  {
    id: "tool-settings",
    label: "工具调用设置",
    icon: Wrench,
    group: "聊天与资料",
    kind: "panel",
  },
  { id: "complete", label: "智能补全", icon: Sparkles, group: "输入处理" },
  {
    id: "continuation-model",
    label: "指定补全模型",
    icon: AtSign,
    group: "输入处理",
  },
  { id: "translate", label: "翻译输入", icon: Languages, group: "输入处理" },
  { id: "compress", label: "压缩上下文", icon: Package, group: "输入处理" },
  { id: "convert-paths", label: "路径转附件", icon: FileUp, group: "输入处理" },
  {
    id: "cleanup-placeholders",
    label: "清理无效占位符",
    icon: Eraser,
    group: "输入处理",
  },
  {
    id: "analyze-context",
    label: "分析当前上下文",
    icon: ScanSearch,
    group: "聊天与资料",
  },
  { id: "cut-draft", label: "剪切输入草稿", icon: Scissors, group: "输入处理" },
  {
    id: "paste-draft",
    label: "粘贴输入草稿",
    icon: ClipboardPaste,
    group: "输入处理",
  },
  {
    id: "expand",
    label: "展开输入框",
    icon: Maximize2,
    group: "会话与显示",
    kind: "toggle",
  },
  {
    id: "unlock-height",
    label: "解除高度锁定",
    icon: Unlock,
    group: "会话与显示",
  },
  {
    id: "input-settings",
    label: "输入设置",
    icon: Settings,
    group: "会话与显示",
    kind: "panel",
  },
];

export interface ToolbarActionState {
  disabled: boolean;
  hasAgent: boolean;
  hasText: boolean;
  hasAttachments: boolean;
  isSending: boolean;
  isCompleting: boolean;
  isTranslating: boolean;
  isCompressing: boolean;
  translationEnabled: boolean;
  compressionEnabled: boolean;
  isDetached: boolean;
  isExpanded: boolean;
  isStreamingEnabled: boolean;
  isInputHeightLocked: boolean;
  hasClipboardDraft: boolean;
  toolCallingEnabled: boolean;
  isVcpChannel: boolean;
  knowledgeCount: number;
  temporaryModelName?: string;
  continuationModelName?: string;
  openPanel?: string;
}

/** Both toolbar and menu consume this same state projection and execute through one dispatcher. */
export function resolveInputToolbarActions(
  state: ToolbarActionState
): ToolbarAction[] {
  const needsText = state.disabled || !state.hasText;
  const completingDisabled = needsText || state.isSending || state.isCompleting;
  return INPUT_TOOLBAR_ACTIONS.map((definition) => {
    const action: ToolbarAction = {
      ...definition,
      visible: true,
      disabled: false,
      active: state.openPanel === definition.id,
      expanded:
        definition.kind === "panel"
          ? state.openPanel === definition.id
          : undefined,
    };
    switch (action.id) {
      case "knowledge":
        action.disabled = state.disabled || !state.hasAgent;
        action.active ||= state.knowledgeCount > 0;
        action.badge = state.knowledgeCount
          ? String(state.knowledgeCount)
          : undefined;
        action.tooltip = state.hasAgent ? action.label : "请先选择 Agent";
        break;
      case "temporary-model":
        action.badge = state.temporaryModelName;
        break;
      case "streaming":
        action.active = state.isStreamingEnabled;
        action.tooltip = state.isStreamingEnabled
          ? "流式输出：实时显示生成内容"
          : "非流式输出：等待完整响应";
        break;
      case "tool-settings":
        action.active ||= state.toolCallingEnabled;
        action.badge = state.isVcpChannel
          ? "VCP"
          : state.toolCallingEnabled
            ? "已启用"
            : undefined;
        action.tooltip = state.isVcpChannel
          ? "VCP 后端接管工具调用（点击查看详情）"
          : action.label;
        break;
      case "complete":
        action.disabled = completingDisabled;
        action.busy = state.isCompleting;
        break;
      case "continuation-model":
        action.disabled = completingDisabled;
        action.badge = state.continuationModelName;
        break;
      case "translate":
        action.visible = state.translationEnabled;
        action.disabled = state.isTranslating || !state.hasText;
        action.busy = state.isTranslating;
        break;
      case "compress":
        action.disabled =
          state.disabled || state.isCompressing || !state.compressionEnabled;
        action.busy = state.isCompressing;
        break;
      case "convert-paths":
      case "cleanup-placeholders":
        action.disabled = needsText;
        break;
      case "analyze-context":
        action.disabled = state.disabled;
        break;
      case "cut-draft":
        action.disabled =
          state.disabled || (!state.hasText && !state.hasAttachments);
        break;
      case "paste-draft":
        action.disabled = state.disabled || !state.hasClipboardDraft;
        break;
      case "expand":
        action.visible = !state.isDetached;
        action.active = state.isExpanded;
        action.label = state.isExpanded ? "收起输入框" : "展开输入框";
        action.icon = state.isExpanded ? Minimize2 : Maximize2;
        break;
      case "unlock-height":
        action.disabled = !state.isInputHeightLocked;
        action.label = state.isInputHeightLocked
          ? "解除高度锁定"
          : "高度自动调整";
        action.badge = state.isInputHeightLocked ? "已锁定" : undefined;
        break;
    }
    return action;
  });
}
