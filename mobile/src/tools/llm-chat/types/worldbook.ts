export type WorldbookEntryPosition =
  | "before_history"
  | "after_character"
  | "depth";

/**
 * Mobile-first, deterministic keyword Worldbook entry. This intentionally
 * excludes desktop vector retrieval, recursion, probability and automation.
 */
export interface MobileWorldbookEntry {
  id: string;
  name?: string;
  keys: string[];
  content: string;
  enabled: boolean;
  /** Constant entries are injected without a keyword match. */
  constant: boolean;
  /** Larger numbers are placed first when several entries activate. */
  order: number;
  position: WorldbookEntryPosition;
  /** Relative to the latest history message; 0 means immediately after it. */
  depth?: number;
  /** Number of latest session-history messages to scan. */
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
}

export interface MobileWorldbook {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  entries: MobileWorldbookEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface MobileWorldbookConfig {
  worldbooks: MobileWorldbook[];
}