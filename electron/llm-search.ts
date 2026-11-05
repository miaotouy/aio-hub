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
import { setImmediate as yieldTurn } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { applicationPath } from "./application-path";

type Scope = "all" | "agent" | "session";
type Mode = "exact" | "and" | "or";
type JsonObject = Record<string, unknown>;
interface MatchDetail {
  field: string;
  context: string;
  role?: string;
  /** UTF-16 offsets, directly usable by String.substring in the renderer. */
  match_offsets: [number, number][];
}
interface SearchResult {
  id: string;
  kind: "agent" | "session";
  title: string;
  matches: MatchDetail[];
  updatedAt?: string;
  path: string;
}
export type SearchStreamPayload =
  | { type: "progress"; data: { filesScanned: number; filesMatched: number } }
  | { type: "resultBatch"; data: SearchResult[] }
  | { type: "done"; data: { durationMs: number } };
interface SearchRun {
  abort: AbortController;
  disposed: boolean;
  task: Promise<void>;
}
function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function step(text: string, index: number, count: number): number {
  for (let i = 0; i < Math.abs(count); i++) {
    if (count < 0) {
      if (!index) break;
      const code = text.charCodeAt(--index);
      if (
        code >= 0xdc00 &&
        code <= 0xdfff &&
        index > 0 &&
        text.charCodeAt(index - 1) >= 0xd800 &&
        text.charCodeAt(index - 1) <= 0xdbff
      )
        index--;
    } else {
      if (index >= text.length) break;
      index += text.codePointAt(index)! > 0xffff ? 2 : 1;
    }
  }
  return index;
}
function matcher(query: string, mode: Mode) {
  const keywords = mode === "exact" ? [query] : query.split(/\s+/u);
  const escaped = keywords.map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regexes = (mode === "and" ? escaped : [escaped.join("|")]).map(
    (pattern) => new RegExp(pattern, "giu")
  );
  return (
    value: unknown,
    contextSize: number
  ): Pick<MatchDetail, "context" | "match_offsets"> | undefined => {
    if (typeof value !== "string") return;
    const first = regexes.map((regex) => {
      regex.lastIndex = 0;
      return regex.exec(value);
    });
    if (first.some((match) => !match)) return;
    const earliest = first.reduce((a, b) => (a!.index <= b!.index ? a : b))!;
    const context = value.slice(
      step(value, earliest.index, -contextSize),
      step(value, earliest.index + earliest[0].length, contextSize)
    );
    const offsets: [number, number][] = [];
    for (const regex of regexes) {
      regex.lastIndex = 0;
      for (const match of context.matchAll(regex))
        offsets.push([match.index!, match.index! + match[0].length]);
    }
    offsets.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const offset of offsets) {
      const last = merged[merged.length - 1];
      if (last && offset[0] <= last[1]) last[1] = Math.max(last[1], offset[1]);
      else merged.push(offset);
    }
    return { context: context.replace(/[\r\n]/g, " "), match_offsets: merged };
  };
}
function extract(
  value: JsonObject,
  kind: "agent" | "session",
  path: string,
  match: ReturnType<typeof matcher>
): SearchResult | undefined {
  if (typeof value.id !== "string" || typeof value.name !== "string") return;
  const matches: MatchDetail[] = [];
  const add = (field: string, text: unknown, size: number, role?: unknown) => {
    const context = match(text, size);
    if (!context) return false;
    matches.push({
      field,
      ...context,
      ...(typeof role === "string" ? { role } : {}),
    });
    return true;
  };
  add("name", value.name, 100);
  if (kind === "agent") {
    add("displayName", value.displayName, 100);
    add("description", value.description, 60);
    let count = 0;
    for (const item of Array.isArray(value.presetMessages)
      ? value.presetMessages
      : []) {
      if (count >= 3) break;
      const node = object(item);
      if (
        node &&
        (add("presetMessageName", node.name, 100, node.role) ||
          add("presetMessage", node.content, 60, node.role))
      )
        count++;
    }
  } else {
    let count = 0;
    for (const item of Object.values(object(value.nodes) ?? {})) {
      if (count >= 5) break;
      const node = object(item);
      if (!node) continue;
      if (add("content", node.content, 60, node.role)) count++;
      if (
        count < 5 &&
        add(
          "reasoningContent",
          object(node.metadata)?.reasoningContent,
          60,
          node.role
        )
      )
        count++;
    }
  }
  if (!matches.length) return;
  return {
    id: value.id,
    kind,
    title:
      kind === "agent" ? (string(value.displayName) ?? value.name) : value.name,
    matches,
    path,
    updatedAt: string(
      kind === "agent" ? (value.lastUsedAt ?? value.createdAt) : value.updatedAt
    ),
  };
}

/** One search per renderer owner. Navigation/disposal revokes all further sends. */
export class LlmSearch {
  private runs = new Map<number, SearchRun>();
  constructor(private readonly root: string) {}
  async cancel(owner: number): Promise<void> {
    const run = this.runs.get(owner);
    run?.abort.abort();
    await run?.task.catch(() => {});
  }
  disposeOwner(owner: number): void {
    const run = this.runs.get(owner);
    if (run) {
      run.disposed = true;
      run.abort.abort();
      this.runs.delete(owner);
    }
  }
  disposeAll(): void {
    for (const owner of this.runs.keys()) this.disposeOwner(owner);
  }
  search(
    owner: number,
    args: Record<string, unknown>,
    send: (payload: SearchStreamPayload) => boolean
  ): Promise<void> {
    if (typeof args.query !== "string" || args.query.length > 4096)
      throw new Error("搜索词需为 4096 字符以内的文本");
    const scope = args.scope ?? "all",
      mode = args.matchMode ?? "exact",
      limit = args.limit ?? 500;
    if (
      typeof scope !== "string" ||
      !["agent", "session", "all"].includes(scope)
    )
      throw new Error("搜索范围无效");
    if (typeof mode !== "string" || !["exact", "and", "or"].includes(mode))
      throw new Error("搜索匹配方式无效");
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0)
      throw new Error("搜索结果上限无效");
    this.runs.get(owner)?.abort.abort();
    const run: SearchRun = {
      abort: new AbortController(),
      disposed: false,
      task: Promise.resolve(),
    };
    this.runs.set(owner, run);
    run.task = this.scan(
      args.query.trim(),
      scope as Scope,
      mode as Mode,
      limit,
      run,
      send
    ).finally(() => {
      if (this.runs.get(owner) === run) this.runs.delete(owner);
    });
    return run.task;
  }
  private async existingPath(relative: string): Promise<string | undefined> {
    try {
      return await applicationPath(this.root, relative);
    } catch (error) {
      // A concurrent recovery/atomic replacement may move an opened file before
      // realpath returns. Disappearance is safe to skip; live links still fail.
      const entry = await fs
        .lstat(path.join(this.root, ...relative.split("/")))
        .catch((failure: NodeJS.ErrnoException) => {
          if (failure.code !== "ENOENT") throw failure;
          return undefined;
        });
      if (entry) throw error;
      return undefined;
    }
  }
  private async *entries(relative: string, run: SearchRun) {
    const directory = await this.existingPath(relative);
    if (!directory) return;
    let handle;
    try {
      handle = await fs.opendir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for await (const entry of handle) {
      if (run.abort.signal.aborted) return;
      yield entry;
    }
  }
  private async *candidates(
    scope: Scope,
    run: SearchRun
  ): AsyncGenerator<{ path: string; kind: "agent" | "session" }> {
    if (scope !== "session") {
      const root = "agent-manager/agents";
      for await (const entry of this.entries(root, run)) {
        if (entry.isFile() && entry.name === "agent.json")
          yield { path: root + "/agent.json", kind: "agent" };
        if (!entry.isDirectory()) continue;
        for await (const file of this.entries(root + "/" + entry.name, run))
          if (file.isFile() && file.name === "agent.json")
            yield {
              path: root + "/" + entry.name + "/agent.json",
              kind: "agent",
            };
      }
    }
    if (scope !== "agent")
      for await (const entry of this.entries("llm-chat/sessions", run))
        if (entry.isFile() && entry.name.endsWith(".json"))
          yield { path: "llm-chat/sessions/" + entry.name, kind: "session" };
  }
  private async scan(
    query: string,
    scope: Scope,
    mode: Mode,
    limit: number,
    run: SearchRun,
    send: (payload: SearchStreamPayload) => boolean
  ): Promise<void> {
    const started = performance.now(),
      match = matcher(query, mode);
    let filesScanned = 0,
      filesMatched = 0,
      batch: SearchResult[] = [],
      lastSent = started;
    const emit = (payload: SearchStreamPayload) => {
      if (run.disposed) return;
      if (!send(payload)) {
        run.disposed = true;
        run.abort.abort();
      }
    };
    const flush = () => {
      if (batch.length) {
        emit({ type: "resultBatch", data: batch });
        batch = [];
      }
      emit({ type: "progress", data: { filesScanned, filesMatched } });
      lastSent = performance.now();
    };
    try {
      if (query && limit > 0) {
        for await (const candidate of this.candidates(scope, run)) {
          if (run.abort.signal.aborted) break;
          const filename = await this.existingPath(candidate.path);
          if (!filename) continue;
          let content: string;
          try {
            content = await fs.readFile(filename, {
              encoding: "utf8",
              signal: run.abort.signal,
            });
          } catch (error) {
            if (run.abort.signal.aborted) break;
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw error;
          }
          if (run.abort.signal.aborted) break;
          filesScanned++;
          let parsed: JsonObject | undefined;
          try {
            parsed = object(JSON.parse(content));
          } catch {
            /* Concurrent/incomplete or corrupt files do not hide other results. */
          }
          const result =
            parsed && extract(parsed, candidate.kind, candidate.path, match);
          if (result) {
            batch.push(result);
            filesMatched++;
          }
          if (batch.length >= 10 || performance.now() - lastSent >= 100)
            flush();
          if (filesMatched >= limit || run.abort.signal.aborted) break;
          // Keep cancel/navigation and other IPC responsive between file parses.
          await yieldTurn();
        }
      }
      if (!run.abort.signal.aborted) flush();
      emit({ type: "done", data: { durationMs: performance.now() - started } });
    } catch (error) {
      if (!run.abort.signal.aborted) throw error;
      emit({ type: "done", data: { durationMs: performance.now() - started } });
    }
  }
}
