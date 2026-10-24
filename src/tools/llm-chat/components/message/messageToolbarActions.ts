// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type { Component } from "vue";
import {
  Copy,
  Edit,
  GitFork,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  AtSign,
  BarChart3,
  Download,
  Languages,
  Database,
  StepForward,
  Hash,
  Variable,
  Wand2,
  Camera,
} from "lucide-vue-next";
import type { ButtonVisibility } from "../../types/ui";
import type { MessageToolbarActionId } from "../../types/message-toolbar";

export interface MessageToolbarAction {
  id: MessageToolbarActionId;
  label: string;
  icon: Component;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}

export const MESSAGE_TOOLBAR_ACTIONS: MessageToolbarAction[] = [
  { id: "copy", label: "复制", icon: Copy },
  { id: "edit", label: "编辑", icon: Edit },
  { id: "regenerate", label: "重新生成", icon: RefreshCw },
  { id: "regenerate-model", label: "切换模型重新生成", icon: AtSign },
  { id: "create-branch", label: "创建分支", icon: GitFork },
  { id: "translate", label: "翻译", icon: Languages },
  { id: "toggle-enabled", label: "禁用此消息", icon: EyeOff },
  { id: "delete", label: "删除", icon: Trash2, danger: true },
  { id: "continue", label: "续写消息", icon: StepForward },
  { id: "continue-model", label: "选择模型续写", icon: AtSign },
  { id: "analyze-context", label: "上下文分析", icon: BarChart3 },
  { id: "export", label: "导出分支", icon: Download },
  { id: "screenshot", label: "创建消息截图", icon: Camera },
  { id: "recalculate-tokens", label: "重新计算 Token", icon: Hash },
  { id: "reparse-tools", label: "重新解析工具", icon: Wand2 },
  { id: "edit-data", label: "数据编辑 (高级)", icon: Database },
  { id: "variables", label: "查看会话变量状态", icon: Variable },
];

export interface MessageToolbarState {
  role: string;
  generating: boolean;
  preset: boolean;
  disabled: boolean;
  copied: boolean;
  translationEnabled: boolean;
  translationVisible: boolean;
  hasVariables: boolean;
  variablesChanged: boolean;
  buttons: ButtonVisibility;
}

/** 可用性统一用于常驻区与更多菜单，布局偏好只改变操作位置。 */
export function resolveMessageToolbarActions(
  state: MessageToolbarState
): MessageToolbarAction[] {
  const { buttons, generating, preset } = state;
  const editableRole = ["user", "assistant", "tool"].includes(state.role);
  const more = !!buttons.moreMenu;
  const visible: Record<MessageToolbarActionId, boolean> = {
    copy: !!buttons.copy,
    edit: editableRole && !generating && !!buttons.edit,
    regenerate: editableRole && !!buttons.regenerate,
    "regenerate-model": editableRole && !preset && !!buttons.regenerate,
    "create-branch": editableRole && !generating && !!buttons.createBranch,
    translate:
      !generating && !preset && state.translationEnabled && !!buttons.translate,
    "toggle-enabled": !generating && !!buttons.toggleEnabled,
    delete: !generating && !!buttons.delete,
    continue: more && editableRole && !generating,
    "continue-model": more && editableRole && !generating,
    "analyze-context": more && !!buttons.analyzeContext,
    export: more && !!buttons.exportBranch,
    screenshot: more,
    "recalculate-tokens": more && editableRole && !generating,
    "reparse-tools": more && state.role === "assistant" && !generating,
    "edit-data": more && editableRole && !preset && !generating,
    variables: state.hasVariables,
  };
  return MESSAGE_TOOLBAR_ACTIONS.filter((action) => visible[action.id]).map(
    (action) => {
      if (preset && action.id === "create-branch")
        return { ...action, disabled: true, label: "预设消息暂不支持创建分支" };
      if (preset && action.id === "regenerate")
        return { ...action, disabled: true, label: "预设消息不参与重试" };
      if (preset && action.id === "delete")
        return {
          ...action,
          disabled: true,
          label: "预设消息需要在智能体设置中编辑或删除",
        };
      if (action.id === "copy")
        return {
          ...action,
          icon: state.copied ? Check : Copy,
          active: state.copied,
        };
      if (action.id === "regenerate" && state.role === "user")
        return { ...action, label: "重新生成回复" };
      if (action.id === "toggle-enabled")
        return {
          ...action,
          icon: state.disabled ? Eye : EyeOff,
          label: state.disabled ? "启用此消息" : "禁用此消息",
          active: state.disabled,
        };
      if (action.id === "translate")
        return { ...action, active: state.translationVisible };
      if (action.id === "variables")
        return { ...action, active: state.variablesChanged };
      return action;
    }
  );
}
