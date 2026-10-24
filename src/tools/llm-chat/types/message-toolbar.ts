// Copyright 2025-2026 miaotouy(Github@miaotouy)
export type MessageToolbarActionId =
  | "copy"
  | "edit"
  | "create-branch"
  | "delete"
  | "regenerate"
  | "regenerate-model"
  | "toggle-enabled"
  | "translate"
  | "continue"
  | "continue-model"
  | "analyze-context"
  | "export"
  | "screenshot"
  | "recalculate-tokens"
  | "reparse-tools"
  | "edit-data"
  | "variables";

export interface MessageToolbarLayout {
  version: 1;
  /** 保留未知 ID，方便跨版本同步。 */
  pinnedActionIds: string[];
  expanded: boolean;
}
