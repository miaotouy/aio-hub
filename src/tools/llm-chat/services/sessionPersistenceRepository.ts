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

import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import type { ChatSessionDetail, ChatSessionIndex } from "../types/session";
import type {
  CorruptionManifest,
  CorruptionManifestEntry,
  FavoriteFolder,
  IndexLoadResult,
  PersistenceMeta,
  SessionsIndex,
} from "../types/persistence";

const MODULE_NAME = "llm-chat";
const SESSIONS_SUBDIR = "sessions";

export interface PersistedSessionPayload {
  id: string;
  name: string;
  displayAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
  nodes: ChatSessionDetail["nodes"];
  rootNodeId: string;
  activeLeafId: string;
  parameterOverrides?: ChatSessionDetail["parameterOverrides"];
  history?: ChatSessionDetail["history"];
  historyIndex?: ChatSessionDetail["historyIndex"];
  agentUsage?: ChatSessionDetail["agentUsage"];
  _persistence?: PersistenceMeta;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPersistenceMeta(revision = 0): PersistenceMeta {
  return { schema: 1, revision, committedAt: new Date().toISOString() };
}

export function readRevision(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const meta = (value as { _persistence?: Partial<PersistenceMeta> })
    ._persistence;
  return typeof meta?.revision === "number" &&
    Number.isSafeInteger(meta.revision) &&
    meta.revision >= 0
    ? meta.revision
    : 0;
}

function isValidPersistenceMeta(value: unknown): boolean {
  if (value === undefined) return true; // legacy files are revision 0.
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const meta = value as Partial<PersistenceMeta>;
  return (
    meta.schema === 1 &&
    typeof meta.committedAt === "string" &&
    typeof meta.revision === "number" &&
    Number.isSafeInteger(meta.revision) &&
    meta.revision >= 0
  );
}

function isValidIndexItem(value: unknown): value is ChatSessionIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<ChatSessionIndex>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.name === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string" &&
    typeof item.messageCount === "number" &&
    Number.isFinite(item.messageCount)
  );
}

function isValidFavoriteFolder(value: unknown): value is FavoriteFolder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const folder = value as Partial<FavoriteFolder>;
  return (
    typeof folder.id === "string" &&
    typeof folder.name === "string" &&
    typeof folder.createdAt === "string" &&
    typeof folder.updatedAt === "string"
  );
}

export function isValidSessionsIndex(value: unknown): value is SessionsIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const index = value as Partial<SessionsIndex>;
  return (
    typeof index.version === "string" &&
    (index.currentSessionId === null ||
      typeof index.currentSessionId === "string") &&
    Array.isArray(index.sessions) &&
    index.sessions.every(isValidIndexItem) &&
    (index.favoriteFolders === undefined ||
      (Array.isArray(index.favoriteFolders) &&
        index.favoriteFolders.every(isValidFavoriteFolder))) &&
    isValidPersistenceMeta(index._persistence)
  );
}

export function isValidSessionPayload(
  value: unknown,
  expectedSessionId: string
): value is PersistedSessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<PersistedSessionPayload>;
  const nodes = session.nodes;
  if (!nodes || typeof nodes !== "object" || Array.isArray(nodes)) return false;
  const rootNodeId = session.rootNodeId;
  const activeLeafId = session.activeLeafId;
  return (
    session.id === expectedSessionId &&
    typeof session.name === "string" &&
    typeof session.createdAt === "string" &&
    typeof session.updatedAt === "string" &&
    typeof rootNodeId === "string" &&
    rootNodeId.length > 0 &&
    typeof activeLeafId === "string" &&
    activeLeafId.length > 0 &&
    Object.prototype.hasOwnProperty.call(nodes, rootNodeId) &&
    Object.prototype.hasOwnProperty.call(nodes, activeLeafId) &&
    isValidPersistenceMeta(session._persistence)
  );
}

/** Domain reader for llm-chat persistence. Writes are deliberately delegated to Rust. */
export class SessionPersistenceRepository {
  async getModuleDir(): Promise<string> {
    return join(await getAppConfigDir(), MODULE_NAME);
  }

  async getSessionsDir(): Promise<string> {
    return join(await this.getModuleDir(), SESSIONS_SUBDIR);
  }

  async getIndexPath(): Promise<string> {
    return join(await this.getModuleDir(), "sessions-index.json");
  }

  async getSessionPath(sessionId: string): Promise<string> {
    return join(await this.getSessionsDir(), `${sessionId}.json`);
  }

  async getCorruptSessionsDir(): Promise<string> {
    return join(await this.getModuleDir(), "sessions-corrupt");
  }

  async ensureCorruptSessionsDir(): Promise<string> {
    const dir = await this.getCorruptSessionsDir();
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async ensureSessionsDir(): Promise<void> {
    await mkdir(await this.getSessionsDir(), { recursive: true });
  }

  async loadIndex(): Promise<IndexLoadResult> {
    try {
      const indexPath = await this.getIndexPath();
      const primary = await this.readIndexCandidate(indexPath);
      if (primary.ok) {
        return { status: "ready", source: "primary", index: primary.index };
      }

      const backup = await this.readIndexCandidate(`${indexPath}.bak`);
      if (backup.ok) {
        return { status: "recovered", source: "backup", index: backup.index };
      }

      const temp = await this.readHighestRevisionTempIndex();
      if (temp) return { status: "recovered", source: "temp", index: temp };

      if (primary.missing) {
        const sessionsDirectoryEmpty = await this.isSessionsDirectoryEmpty();
        if (sessionsDirectoryEmpty) {
          return { status: "missing", sessionsDirectoryEmpty: true };
        }
      }

      return {
        status: "corrupt",
        primaryError: primary.error || "sessions-index.json is unavailable",
        backupError: backup.error,
      };
    } catch (error) {
      return { status: "io-error", error };
    }
  }

  async preserveCorruptPrimary(): Promise<void> {
    const indexPath = await this.getIndexPath();
    if (!(await exists(indexPath))) return;
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    await rename(indexPath, `${indexPath}.${suffix}.corrupt`);
  }

  async preserveCorruptManifest(): Promise<void> {
    const path = await join(
      await this.getCorruptSessionsDir(),
      "corruption-manifest.json"
    );
    if (!(await exists(path))) return;
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    await rename(path, `${path}.${suffix}.corrupt`);
  }

  async loadCorruptionManifest(): Promise<CorruptionManifest> {
    const path = await join(
      await this.getCorruptSessionsDir(),
      "corruption-manifest.json"
    );
    if (!(await exists(path))) {
      return {
        version: 1,
        entries: [],
        _persistence: createPersistenceMeta(),
      };
    }
    try {
      const parsed: unknown = JSON.parse(await readTextFile(path));
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray((parsed as CorruptionManifest).entries)
      ) {
        throw new Error("Invalid corruption manifest structure");
      }
      return parsed as CorruptionManifest;
    } catch (error) {
      throw new Error(
        `Unable to read corruption manifest: ${errorMessage(error)}`
      );
    }
  }

  async quarantineSessionFile(
    sessionId: string,
    reason: string
  ): Promise<CorruptionManifestEntry> {
    const originalPath = await this.getSessionPath(sessionId);
    const entry: CorruptionManifestEntry = {
      sessionId,
      originalPath,
      reason,
      detectedAt: new Date().toISOString(),
    };
    if (!(await exists(originalPath))) return entry;

    const corruptDir = await this.getCorruptSessionsDir();
    await mkdir(corruptDir, { recursive: true });
    const timestamp = entry.detectedAt.replace(/[:.]/g, "-");
    const quarantinedPath = await join(
      corruptDir,
      `${sessionId}.${timestamp}.json`
    );
    await rename(originalPath, quarantinedPath);
    entry.quarantinedPath = quarantinedPath;
    return entry;
  }

  async listSessionIds(): Promise<string[]> {
    const dir = await this.getSessionsDir();
    if (!(await exists(dir))) return [];
    const entries = await readDir(dir);
    return entries
      .filter((entry) => entry.isFile && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -".json".length));
  }

  async clearQuarantinedSessionFiles(): Promise<number> {
    const dir = await this.getCorruptSessionsDir();
    if (!(await exists(dir))) return 0;
    const entries = await readDir(dir);
    const files = entries.filter(
      (entry) => entry.isFile && entry.name !== "corruption-manifest.json"
    );
    for (const entry of files) {
      await remove(await join(dir, entry.name));
    }
    return files.length;
  }

  private async isSessionsDirectoryEmpty(): Promise<boolean> {
    return (await this.listSessionIds()).length === 0;
  }

  private async readHighestRevisionTempIndex(): Promise<SessionsIndex | null> {
    const moduleDir = await this.getModuleDir();
    if (!(await exists(moduleDir))) return null;
    const entries = await readDir(moduleDir);
    const candidates = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile &&
            /^\.sessions-index\.json\.[^.]+\.tmp$/.test(entry.name)
        )
        .map(async (entry) => {
          const candidate = await this.readIndexCandidate(
            await join(moduleDir, entry.name)
          );
          return candidate.ok ? candidate.index : null;
        })
    );
    return (
      candidates
        .filter((candidate): candidate is SessionsIndex => candidate !== null)
        .sort((left, right) => readRevision(right) - readRevision(left))[0] ??
      null
    );
  }

  private async readIndexCandidate(
    path: string
  ): Promise<
    | { ok: true; index: SessionsIndex }
    | { ok: false; missing: boolean; error?: string }
  > {
    if (!(await exists(path))) return { ok: false, missing: true };
    try {
      const parsed: unknown = JSON.parse(await readTextFile(path));
      if (!isValidSessionsIndex(parsed)) {
        return {
          ok: false,
          missing: false,
          error: "Invalid sessions index structure",
        };
      }
      const index = parsed as SessionsIndex;
      index.favoriteFolders = Array.isArray(index.favoriteFolders)
        ? index.favoriteFolders
        : [];
      return { ok: true, index };
    } catch (error) {
      return { ok: false, missing: false, error: errorMessage(error) };
    }
  }
}
