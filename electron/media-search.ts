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
import { applicationPath } from "./application-path";

type JsonObject = Record<string, unknown>;
interface MatchDetail {
  field: string;
  context: string;
}
export interface MediaSearchResult {
  id: string;
  kind: "session" | "task";
  title: string;
  matches: MatchDetail[];
  updated_at: string | null;
  path: string;
  asset_id: string | null;
}
function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
function context(value: unknown, query: RegExp): string | undefined {
  if (typeof value !== "string") return;
  const hit = query.exec(value);
  if (!hit) return;
  const before = Array.from(value.slice(0, hit.index));
  const after = Array.from(value.slice(hit.index + hit[0].length));
  return (
    (before.length > 40 ? "..." : "") +
    before.slice(-40).join("") +
    hit[0] +
    after.slice(0, 40).join("") +
    (after.length > 40 ? "..." : "")
  ).replace(/[\r\n]/g, " ");
}
function extract(
  value: JsonObject,
  relative: string,
  query: RegExp
): MediaSearchResult[] {
  if (typeof value.id !== "string" || typeof value.name !== "string") return [];
  const base = {
    title: value.name,
    path: relative,
    updated_at: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
  const results: MediaSearchResult[] = [];
  if (query.test(value.name))
    results.push({
      ...base,
      id: value.id,
      kind: "session",
      matches: [{ field: "name", context: value.name }],
      asset_id: null,
    });
  for (const raw of Object.values(object(value.nodes) ?? {})) {
    const node = object(raw);
    if (!node) continue;
    const task = object(object(node.metadata)?.taskSnapshot);
    const input = object(task?.input);
    const matches: MatchDetail[] = [];
    for (const [field, text] of [
      ["content", node.content],
      ["prompt", input?.prompt],
      ["modelId", input?.modelId],
    ] as const) {
      const excerpt = context(text, query);
      if (excerpt !== undefined)
        matches.push({
          field,
          context: field === "modelId" ? (text as string) : excerpt,
        });
    }
    if (matches.length)
      results.push({
        ...base,
        id: typeof task?.id === "string" ? task.id : value.id,
        kind: "task",
        matches,
        asset_id:
          typeof task?.resultAssetId === "string" ? task.resultAssetId : null,
      });
  }
  return results;
}
/** Search persisted media sessions; keep the existing snake-case IPC result contract. */
export async function searchMediaGeneratorData(
  root: string,
  args: Record<string, unknown>
): Promise<MediaSearchResult[]> {
  if (typeof args.query !== "string" || args.query.length > 16384)
    throw new Error("搜索词无效或过长");
  const limit = args.limit ?? 50;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0)
    throw new Error("搜索结果上限无效");
  const text = args.query.trim();
  if (!text || !limit) return [];
  const query = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
  const directory = await applicationPath(root, "media-generator/sessions");
  let files;
  try {
    files = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results: MediaSearchResult[] = [];
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const relative = "media-generator/sessions/" + entry.name;
    let filename: string;
    try {
      filename = await applicationPath(root, relative);
    } catch (error) {
      // An atomic replacement may remove a listed file before canonicalization.
      const exists = await fs
        .lstat(path.join(directory, entry.name))
        .catch((failure: NodeJS.ErrnoException) => {
          if (failure.code !== "ENOENT") throw failure;
          return undefined;
        });
      if (exists) throw error;
      continue;
    }
    let content: string;
    try {
      content = await fs.readFile(filename, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    let parsed: JsonObject | undefined;
    try {
      parsed = object(JSON.parse(content));
    } catch {
      /* One corrupt history file must not hide the remaining history. */
    }
    if (parsed) results.push(...extract(parsed, relative, query));
    await yieldTurn();
  }
  return results
    .sort(
      (a, b) =>
        b.matches.length - a.matches.length ||
        (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
    )
    .slice(0, limit);
}
