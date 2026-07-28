// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ChatSessionIndex } from "./session";

export interface PersistenceMeta {
  schema: 1;
  revision: number;
  committedAt: string;
}

export interface FavoriteFolder {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionsIndex {
  version: string;
  currentSessionId: string | null;
  sessions: ChatSessionIndex[];
  favoriteFolders?: FavoriteFolder[];
  _persistence?: PersistenceMeta;
}

export type PersistReason =
  | "session-content"
  | "session-created"
  | "session-completed"
  | "session-import"
  | "index-mutation"
  | "current-session"
  | "delete"
  | "repair";

export type LlmChatPersistenceKind = "session" | "index" | "corruptionManifest";

export interface AtomicWriteRequest {
  kind: LlmChatPersistenceKind;
  sessionId?: string;
  content: string;
  revision: number;
  expectedMinRevision?: number;
  keepLastValidBackup: boolean;
}

export interface CommitResult {
  outcome: "committed" | "staleRejected" | "cancelled" | "coalesced";
  revision: number;
  bytes: number;
  writeMs?: number;
  syncMs?: number;
  replaceMs?: number;
}

export type IndexLoadResult =
  | { status: "ready"; source: "primary"; index: SessionsIndex }
  | { status: "recovered"; source: "backup" | "temp"; index: SessionsIndex }
  | { status: "missing"; sessionsDirectoryEmpty: boolean }
  | { status: "corrupt"; primaryError: string; backupError?: string }
  | { status: "unsupported"; detectedVersion?: string }
  | { status: "io-error"; error: unknown };

export interface CorruptionManifestEntry {
  sessionId: string;
  originalPath: string;
  quarantinedPath?: string;
  reason: string;
  detectedAt: string;
}

export interface CorruptionManifest {
  version: 1;
  entries: CorruptionManifestEntry[];
  _persistence: PersistenceMeta;
}

export interface RecoveryState {
  status: "ready" | "recovering" | "corrupt";
  failedSessionCount: number;
  scannedSessionCount: number;
}
