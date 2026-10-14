// Copyright 2025-2026 miaotouy(Github@miaotouy)

export type InputToolbarActionId =
  | "streaming"
  | "macro"
  | "attachment"
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

/** Layout preferences for the system-action toolbar. */
export interface InputToolbarLayout {
  version: 1;
  /** Unknown IDs are retained for forward/backward compatibility. */
  pinnedActionIds: string[];
}
