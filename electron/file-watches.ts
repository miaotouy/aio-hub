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

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { filePath, type BasePaths } from "./filesystem";

export interface FileWatchEvent {
  type: "any" | "other" | { modify: { kind: "data"; mode: "any" } };
  paths: string[];
  attrs: unknown;
}
export interface FileWatchMessage {
  id: string;
  event: FileWatchEvent;
  error?: { message: string; code?: string };
}
interface Registration {
  closed: boolean;
  handles: fs.FSWatcher[];
  paths: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
  type: FileWatchEvent["type"];
}
interface Owner {
  active: boolean;
  registrations: Map<string, Registration>;
}

/** Long-lived subscriptions are scoped to their renderer, including registration in flight. */
export class FileWatches {
  private owners = new Map<number, Owner>();
  constructor(
    private readonly send: (owner: number, message: FileWatchMessage) => boolean
  ) {}
  async start(
    ownerId: number,
    id: unknown,
    paths: unknown,
    options: unknown,
    bases: BasePaths
  ): Promise<void> {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
      throw new Error("文件监听标识无效");
    const values = Array.isArray(paths) ? paths : [paths];
    if (!values.length || values.length > 128)
      throw new Error("每次监听需指定 1 至 128 个路径");
    if (
      options !== undefined &&
      (!options || typeof options !== "object" || Array.isArray(options))
    )
      throw new Error("文件监听选项无效");
    const opts = options as
      { recursive?: unknown; delayMs?: unknown; baseDir?: number } | undefined;
    if (opts?.recursive !== undefined && typeof opts.recursive !== "boolean")
      throw new Error("递归监听选项无效");
    const delay = opts?.delayMs ?? 0;
    if (
      typeof delay !== "number" ||
      !Number.isInteger(delay) ||
      delay < 0 ||
      delay > 2147483647
    )
      throw new Error("文件监听延迟需为有效的毫秒整数");
    const roots = [
      ...new Set(values.map((value) => filePath(value, opts, bases))),
    ];
    let owner = this.owners.get(ownerId);
    if (!owner)
      this.owners.set(
        ownerId,
        (owner = { active: true, registrations: new Map() })
      );
    if (owner.registrations.has(id)) throw new Error("文件监听标识已被使用");
    const registration: Registration = {
      closed: false,
      handles: [],
      paths: new Set(),
      type: "any",
    };
    owner.registrations.set(id, registration);
    const alive = () => owner.active && !registration.closed;
    const check = () => {
      if (!alive()) throw new Error("文件监听注册已取消");
    };
    const emit = (message: FileWatchMessage) => {
      if (alive() && !this.send(ownerId, message)) this.stop(ownerId, id);
    };
    const flush = () => {
      registration.timer = undefined;
      if (!registration.paths.size || !alive()) return;
      const paths = [...registration.paths];
      registration.paths.clear();
      emit({ id, event: { type: registration.type, paths, attrs: {} } });
    };
    const changed = (type: "rename" | "change", changedPath: string) => {
      if (!alive()) return;
      if (registration.paths.size === 0)
        registration.type =
          type === "change" ? { modify: { kind: "data", mode: "any" } } : "any";
      else registration.type = "any";
      // A busy tree becomes a bounded rescan hint instead of an unbounded event queue.
      if (registration.paths.size >= 1000) {
        registration.paths.clear();
        roots.forEach((root) => registration.paths.add(root));
      } else registration.paths.add(changedPath);
      if (!delay) flush();
      else registration.timer ??= setTimeout(flush, delay);
    };
    try {
      for (const root of roots) {
        check();
        const info = await fsp.stat(root);
        check();
        if (!info.isDirectory() && !info.isFile())
          throw new Error("请选择普通文件或目录进行监听");
        // Watching a file's parent survives the atomic rename used by external editors.
        const directory = info.isDirectory() ? root : path.dirname(root);
        const watcher = fs.watch(
          directory,
          { recursive: info.isDirectory() && opts?.recursive === true },
          (type, filename) => {
            const candidate = filename
              ? path.resolve(directory, String(filename))
              : root;
            const relative = path.relative(root, candidate);
            if (
              info.isFile()
                ? relative !== ""
                : relative === ".." ||
                  relative.startsWith(".." + path.sep) ||
                  path.isAbsolute(relative)
            )
              return;
            changed(type, candidate);
          }
        );
        registration.handles.push(watcher);
        watcher.on("close", () => {
          if (!alive()) return;
          emit({
            id,
            event: { type: "other", paths: roots, attrs: {} },
            error: {
              message: "文件监听已停止，请重新打开文件或目录",
              code: "WATCH_CLOSED",
            },
          });
          this.stop(ownerId, id);
        });
        watcher.on("error", (error: NodeJS.ErrnoException) => {
          emit({
            id,
            event: {
              type: "other",
              paths: roots,
              attrs: { error: error.message },
            },
            error: {
              message: "文件监听已停止，请检查目录权限或重新打开文件",
              code: error.code,
            },
          });
          this.stop(ownerId, id);
        });
      }
      check();
    } catch (error) {
      this.close(registration);
      owner.registrations.delete(id);
      if (!owner.registrations.size && this.owners.get(ownerId) === owner)
        this.owners.delete(ownerId);
      throw error;
    }
  }
  private close(registration: Registration) {
    registration.closed = true;
    if (registration.timer) clearTimeout(registration.timer);
    registration.paths.clear();
    for (const watcher of registration.handles) watcher.close();
    registration.handles = [];
  }
  stop(ownerId: number, id: string): void {
    const owner = this.owners.get(ownerId),
      registration = owner?.registrations.get(id);
    if (!owner || !registration) return;
    this.close(registration);
    owner.registrations.delete(id);
    // Keep an owner token alive while another registration is still being initialized.
    if (!owner.registrations.size) this.owners.delete(ownerId);
  }
  disposeOwner(ownerId: number): void {
    const owner = this.owners.get(ownerId);
    if (!owner) return;
    owner.active = false;
    for (const registration of owner.registrations.values())
      this.close(registration);
    owner.registrations.clear();
    this.owners.delete(ownerId);
  }
  disposeAll(): void {
    for (const owner of this.owners.keys()) this.disposeOwner(owner);
  }
}
