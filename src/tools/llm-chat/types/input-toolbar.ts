// Copyright 2025-2026 miaotouy(Github@miaotouy)

export type InputToolbarActionId =
  | "streaming"
  | "macro"
  | "attachment"
  | "text-attachment"
  | "knowledge"
  | "sessions"
  | "new-session"
  | "temporary-model"
  | "tool-settings"
  | "input-settings"
  | "expand"
  | "complete"
  | "continuation-model"
  | "translate"
  | "compress"
  | "convert-paths"
  | "cleanup-placeholders"
  | "analyze-context"
  | "cut-draft"
  | "paste-draft"
  | "unlock-height";

export type InputToolbarStatusId =
  | "continuation-model"
  | "temporary-model"
  | "canvas"
  | "context-tokens"
  | "input-tokens";

/** Layout preferences for input actions, statuses and quick actions. */
export interface InputToolbarLayout {
  version: 1;
  /** Unknown IDs are retained for forward/backward compatibility. */
  pinnedActionIds: string[];
  /** Enabled statuses, in display order. Unknown IDs are retained. */
  statusIds: string[];
  groupQuickActionsBySet: boolean;
}
