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
  rename,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import type {
  CorruptionManifest,
  CorruptionManifestEntry,
  IndexLoadResult,
  PersistenceMeta,
  SessionsIndex,
} from "../types/persistence";

const MODULE_NAME = "llm-chat";
const SESSIONS_SUBDIR = "sessions";

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

export function isValidSessionsIndex(value: unknown): value is SessionsIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<SessionsIndex>;
  return (
    typeof index.version === "string" &&
    (index.currentSessionId === null ||
      typeof index.currentSessionId === "string") &&
    Array.isArray(index.sessions) &&
    index.sessions.every((session) => session && typeof session.id === "string")
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

  async ensureSessionsDir(): Promise<void> {
    await mkdir(await this.getSessionsDir(), { recursive: true });
  }

  async loadIndex(): Promise<IndexLoadResult> {
    try {
      const indexPath = await this.getIndexPath();
      const primary = await this.readIndexCandidate(indexPath);
      if (primary.ok)
        return { status: "ready", source: "primary", index: primary.index };

      const backup = await this.readIndexCandidate(`${indexPath}.bak`);
      if (backup.ok)
        return { status: "recovered", source: "backup", index: backup.index };

      if (primary.missing) {
        const sessionsDirectoryEmpty = await this.isSessionsDirectoryEmpty();
        if (sessionsDirectoryEmpty)
          return { status: "missing", sessionsDirectoryEmpty: true };
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

  private async isSessionsDirectoryEmpty(): Promise<boolean> {
    return (await this.listSessionIds()).length === 0;
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
