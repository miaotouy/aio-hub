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
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchMediaGeneratorData } from "./media-search";
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-media-search-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function write(id: string, value: unknown) {
  const file = path.join(root, "media-generator/sessions", id + ".json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    typeof value === "string" ? value : JSON.stringify(value)
  );
}
function session(id: string, updatedAt = "2026-11-05T00:00:00Z", extra = {}) {
  return {
    id,
    name: "Aurora image",
    updatedAt,
    nodes: {
      answer: {
        content: "An Aurora scene",
        metadata: {
          taskSnapshot: {
            id: "task-" + id,
            input: { prompt: "aurora above a lake", modelId: "AURORA.1" },
            resultAssetId: "asset-" + id,
          },
        },
      },
      user: { content: "Aurora request" },
    },
    ...extra,
  };
}
describe("persisted media history search", () => {
  it("returns title, task fields and associated assets in the existing IPC contract", async () => {
    await write("history", session("history"));
    const results = await searchMediaGeneratorData(root, { query: "aurora" });
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      id: "task-history",
      kind: "task",
      title: "Aurora image",
      matches: [
        { field: "content", context: "An Aurora scene" },
        { field: "prompt", context: "aurora above a lake" },
        { field: "modelId", context: "AURORA.1" },
      ],
      updated_at: "2026-11-05T00:00:00Z",
      path: "media-generator/sessions/history.json",
      asset_id: "asset-history",
    });
    expect(results.find((r) => r.kind === "session")?.asset_id).toBeNull();
    expect(
      results.find((r) => r.kind === "task" && r.id === "history")?.matches[0]
        .field
    ).toBe("content");
  });
  it("ranks by matched field count then date before applying the requested limit", async () => {
    await write("old", session("old", "2026-01-01"));
    await write("new", session("new", "2026-11-05"));
    const results = await searchMediaGeneratorData(root, {
      query: "aurora",
      limit: 2,
    });
    expect(results.map((r) => r.id)).toEqual(["task-new", "task-old"]);
    expect(
      await searchMediaGeneratorData(root, { query: "aurora", limit: 0 })
    ).toEqual([]);
  });
  it("matches literal punctuation and decoded Unicode with code-point-safe contexts", async () => {
    const content = "😀".repeat(45) + "中文 A+B.1\n" + "界".repeat(45);
    await write(
      "unicode",
      session("internal-id", "2026-11-05", {
        name: "Unicode",
        nodes: { user: { content } },
      })
    );
    const [result] = await searchMediaGeneratorData(root, { query: "a+b.1" });
    expect(result.path).toBe("media-generator/sessions/unicode.json");
    expect(result.matches[0].context).toContain("中文 A+B.1 ");
    expect(result.matches[0].context.startsWith("...😀")).toBe(true);
    expect(result.matches[0].context.endsWith("...")).toBe(true);
    expect(await searchMediaGeneratorData(root, { query: "a.b" })).toEqual([]);
  });
  it("handles an empty store and skips damaged files while preserving valid results", async () => {
    expect(await searchMediaGeneratorData(root, { query: "aurora" })).toEqual(
      []
    );
    await write("damaged", "{unfinished");
    await write("valid", session("valid"));
    expect(
      (await searchMediaGeneratorData(root, { query: "aurora" })).length
    ).toBe(3);
    expect(await searchMediaGeneratorData(root, { query: "   " })).toEqual([]);
    await expect(
      searchMediaGeneratorData(root, { query: "aurora", limit: -1 })
    ).rejects.toThrow("上限");
  });
  it("rejects a redirected history directory rather than searching another module", async () => {
    await fs.mkdir(path.join(root, "media-generator"));
    const outside = path.join(root, "other-module");
    await fs.mkdir(outside);
    await fs.writeFile(
      path.join(outside, "secret.json"),
      JSON.stringify(session("secret"))
    );
    await fs.symlink(
      outside,
      path.join(root, "media-generator/sessions"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(
      searchMediaGeneratorData(root, { query: "aurora" })
    ).rejects.toThrow("重定向");
  });
});
