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

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { lock } from "proper-lockfile";
import { applicationPath, relativeApplicationPath } from "./application-path";

const TOMBSTONE_REVISION = Number.MAX_SAFE_INTEGER;
const pathQueues = new Map<string, Promise<unknown>>();
type Kind = "session" | "index" | "corruptionManifest" | "requestSnapshots";
interface WriteRequest {
  kind: Kind;
  sessionId?: string;
  content: string;
  revision: number;
  expectedMinRevision?: number;
  keepLastValidBackup: boolean;
}
interface Revision {
  exists: boolean;
  valid: boolean;
  revision: number;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("会话持久化参数需为对象");
  return value as Record<string, unknown>;
}
function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function sessionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > 180 ||
    value.includes("..") ||
    /[\\/]/.test(value)
  )
    throw new Error("会话标识无效");
  return relativeApplicationPath(value);
}
function parseRequest(value: unknown): WriteRequest {
  const request = object(value);
  if (
    !["session", "index", "corruptionManifest", "requestSnapshots"].includes(
      String(request.kind)
    ) ||
    typeof request.content !== "string" ||
    !validRevision(request.revision) ||
    typeof request.keepLastValidBackup !== "boolean" ||
    (request.expectedMinRevision != null &&
      !validRevision(request.expectedMinRevision))
  )
    throw new Error("会话持久化类型、内容或版本无效");
  const kind = request.kind as Kind;
  let id: string | undefined;
  if (kind === "session" || kind === "requestSnapshots")
    id = sessionId(request.sessionId);
  else if (request.sessionId != null)
    throw new Error("该持久化类型不接受会话标识");
  const content = object(JSON.parse(request.content));
  const meta = content._persistence;
  const revision =
    meta && typeof meta === "object"
      ? (meta as Record<string, unknown>).revision
      : 0;
  if (revision !== request.revision)
    throw new Error("内容版本与请求版本不一致");
  if (kind === "session" && content.id !== id)
    throw new Error("会话内容与会话标识不一致");
  if (
    kind === "requestSnapshots" &&
    (Buffer.byteLength(request.content, "utf8") > 4 * 1024 * 1024 ||
      content.schemaVersion !== 1 ||
      content.sessionId !== id ||
      !Array.isArray(content.attempts))
  )
    throw new Error("请求记录格式无效或超过 4 MiB");
  return {
    kind,
    sessionId: id,
    content: request.content,
    revision: request.revision,
    expectedMinRevision: request.expectedMinRevision as number | undefined,
    keepLastValidBackup: request.keepLastValidBackup,
  };
}
function targetPath(request: WriteRequest): string {
  switch (request.kind) {
    case "session":
      return "llm-chat/sessions/" + request.sessionId + ".json";
    case "requestSnapshots":
      return "llm-chat/request-snapshots/" + request.sessionId + ".json";
    case "index":
      return "llm-chat/sessions-index.json";
    case "corruptionManifest":
      return "llm-chat/sessions-corrupt/corruption-manifest.json";
  }
}
/** Single host owner for the shared session format; all four kinds use the same revision/atomic-replace contract. */
export class LlmChatPersistence {
  private pending = new Set<Promise<unknown>>();
  private stopping?: Promise<void>;
  constructor(private root: string) {}
  get hasPendingOperations() {
    return this.pending.size > 0;
  }
  shutdown(): Promise<void> {
    return (this.stopping ??= Promise.allSettled([...this.pending]).then(
      () => {}
    ));
  }
  private track<T>(operation: () => Promise<T>): Promise<T> {
    if (this.stopping)
      return Promise.reject(new Error("应用正在退出，请稍后重新打开会话"));
    const task = operation();
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task)
    );
    return task;
  }
  private async withLock<T>(
    relative: string,
    operation: (check: () => Promise<void>) => Promise<T>
  ): Promise<T> {
    const target = await applicationPath(this.root, relative);
    const key = process.platform === "win32" ? target.toLowerCase() : target;
    const task = (pathQueues.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await applicationPath(this.root, relative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const lockfilePath = await applicationPath(
          this.root,
          relative + ".electron-lock"
        );
        let compromised: Error | undefined;
        const release = await lock(target, {
          realpath: false,
          lockfilePath,
          stale: 30000,
          update: 5000,
          retries: { retries: 200, factor: 1, minTimeout: 25, maxTimeout: 25 },
          onCompromised: (error) => {
            compromised = error;
          },
        });
        const check = async () => {
          if (compromised)
            throw new Error("会话保存锁已失效，请重试", { cause: compromised });
          await applicationPath(this.root, relative);
          await applicationPath(this.root, relative + ".electron-lock");
        };
        try {
          await check();
          return await operation(check);
        } finally {
          await release().catch((error) => {
            if (!compromised) throw error;
          });
        }
      });
    pathQueues.set(key, task);
    try {
      return await task;
    } finally {
      if (pathQueues.get(key) === task) pathQueues.delete(key);
    }
  }
  private async read(relative: string): Promise<string | undefined> {
    try {
      return await fs.readFile(
        await applicationPath(this.root, relative),
        "utf8"
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
  private async revision(relative: string): Promise<Revision> {
    const text = await this.read(relative);
    if (text === undefined) return { exists: false, valid: false, revision: 0 };
    try {
      const value = object(JSON.parse(text));
      const meta = value._persistence;
      const revision =
        meta && typeof meta === "object"
          ? (meta as Record<string, unknown>).revision
          : 0;
      if (!validRevision(revision))
        return { exists: true, valid: false, revision: 0 };
      return { exists: true, valid: true, revision };
    } catch {
      return { exists: true, valid: false, revision: 0 };
    }
  }
  private async replace(
    relative: string,
    content: string,
    check: () => Promise<void>
  ) {
    const target = await applicationPath(this.root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tempRelative = path.posix.join(
      path.posix.dirname(relative),
      "." + path.posix.basename(relative) + "." + randomUUID() + ".tmp"
    );
    const temp = await applicationPath(this.root, tempRelative);
    const handle = await fs.open(temp, "wx");
    let writeMs = 0,
      syncMs = 0;
    try {
      try {
        const start = performance.now();
        await handle.writeFile(content, "utf8");
        writeMs = performance.now() - start;
        const sync = performance.now();
        await handle.sync();
        syncMs = performance.now() - sync;
      } finally {
        await handle.close();
      }
      await check();
      await applicationPath(this.root, tempRelative);
      const start = performance.now();
      await fs.rename(temp, target);
      return { writeMs, syncMs, replaceMs: performance.now() - start };
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }
  write(value: unknown) {
    return this.track(async () => {
      const request = parseRequest(value),
        relative = targetPath(request);
      return this.withLock(relative, async (check) => {
        const current = await this.revision(relative);
        let deletedRevision = 0;
        if (request.sessionId) {
          const tombstone = await this.revision(
            "llm-chat/sessions-tombstones/" + request.sessionId + ".json"
          );
          if (
            tombstone.exists &&
            (!tombstone.valid || tombstone.revision !== TOMBSTONE_REVISION)
          )
            throw new Error("会话删除标记损坏，请先恢复该标记后重试");
          deletedRevision = tombstone.revision;
        }
        if (
          request.revision <= current.revision ||
          request.revision <= deletedRevision ||
          (current.exists &&
            request.expectedMinRevision != null &&
            current.revision < request.expectedMinRevision)
        )
          return {
            outcome: "staleRejected" as const,
            revision: Math.max(current.revision, deletedRevision),
            bytes: 0,
            writeMs: 0,
            syncMs: 0,
            replaceMs: 0,
          };
        if (request.keepLastValidBackup) {
          const previous = await this.read(relative);
          if (previous !== undefined) {
            let valid = false;
            try {
              object(JSON.parse(previous));
              valid = true;
            } catch {
              /* Preserve the last valid backup when the primary is damaged. */
            }
            if (valid) await this.replace(relative + ".bak", previous, check);
          }
        }
        const timing = await this.replace(relative, request.content, check);
        return {
          outcome: "committed" as const,
          revision: request.revision,
          bytes: Buffer.byteLength(request.content, "utf8"),
          ...timing,
        };
      });
    });
  }
  deleteSession(value: unknown) {
    return this.track(async () => {
      const id = sessionId(object(value).sessionId),
        relative = "llm-chat/sessions/" + id + ".json";
      return this.withLock(relative, async (check) => {
        await this.replace(
          "llm-chat/sessions-tombstones/" + id + ".json",
          JSON.stringify({
            _persistence: {
              schema: 1,
              revision: TOMBSTONE_REVISION,
              committedAt: new Date().toISOString(),
            },
            sessionId: id,
          }),
          check
        );
        const snapshots = "llm-chat/request-snapshots/" + id + ".json";
        await this.withLock(snapshots, async (snapshotCheck) => {
          await snapshotCheck();
          await check();
          await fs.rm(await applicationPath(this.root, snapshots), {
            force: true,
          });
        });
        await check();
        const target = await applicationPath(this.root, relative);
        try {
          await fs.lstat(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return { movedToTrash: false };
          throw error;
        }
        const trash = await applicationPath(
          this.root,
          "llm-chat/sessions-trash/" + id + "." + randomUUID() + ".json"
        );
        await fs.mkdir(path.dirname(trash), { recursive: true });
        await check();
        await fs.rename(target, trash);
        return { movedToTrash: true };
      });
    });
  }
}
