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
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LlmSearch, type SearchStreamPayload } from "./llm-search";
let root: string, service: LlmSearch;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-search-"));
  service = new LlmSearch(root);
});
afterEach(async () => {
  service.disposeAll();
  await fs.rm(root, { recursive: true, force: true });
});
async function write(relative: string, value: unknown) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(
    filename,
    typeof value === "string" ? value : JSON.stringify(value)
  );
}
async function session(id: string, content = "needle", extra = {}) {
  await write(`llm-chat/sessions/${id}.json`, {
    id,
    name: id,
    updatedAt: "2026-11-04T01:00:00Z",
    nodes: {
      user: { role: "user", content },
      assistant: {
        role: "assistant",
        metadata: { reasoningContent: "推理 needle" },
      },
    },
    ...extra,
  });
}
async function search(args = {}, owner = 1) {
  const events: SearchStreamPayload[] = [];
  await service.search(owner, { query: "needle", ...args }, (payload) => {
    events.push(payload);
    return true;
  });
  return { events, results: results(events) };
}
function results(events: SearchStreamPayload[]) {
  return events.flatMap((event) =>
    event.type === "resultBatch" ? event.data : []
  );
}
describe("LLM search public stream contract", () => {
  it("streams all supported fields with usable paths, roles, dates and scope isolation", async () => {
    await session("conversation");
    await write("agent-manager/agents/helper/agent.json", {
      id: "helper",
      name: "Needle",
      displayName: "needle 助手",
      description: "needle 描述",
      createdAt: "2026-11-01",
      presetMessages: [
        { name: "needle 预设", content: "needle", role: "system" },
        { content: "needle 内容", role: "user" },
      ],
    });
    const all = await search();
    expect(all.results.map((r) => r.kind)).toEqual(["agent", "session"]);
    expect(all.results[0]).toMatchObject({
      title: "needle 助手",
      path: "agent-manager/agents/helper/agent.json",
      updatedAt: "2026-11-01",
    });
    expect(all.results[0].matches.map((m) => m.field)).toEqual([
      "name",
      "displayName",
      "description",
      "presetMessageName",
      "presetMessage",
    ]);
    expect(all.results[1]).toMatchObject({
      updatedAt: "2026-11-04T01:00:00Z",
      matches: [
        { field: "content", role: "user" },
        { field: "reasoningContent", role: "assistant" },
      ],
    });
    expect(all.events[all.events.length - 2]).toEqual({
      type: "progress",
      data: { filesScanned: 2, filesMatched: 2 },
    });
    expect(all.events[all.events.length - 1]).toMatchObject({
      type: "done",
      data: { durationMs: expect.any(Number) },
    });
    expect((await search({ scope: "agent" })).results.map((r) => r.id)).toEqual(
      ["helper"]
    );
    expect(
      (await search({ scope: "session" })).results.map((r) => r.id)
    ).toEqual(["conversation"]);
  });
  it("matches literal phrases and case-insensitive AND/OR within a field", async () => {
    await session("phrase", "Red blue a+b? [x]");
    await session("split", "red", {
      nodes: { a: { content: "red" }, b: { content: "blue" } },
    });
    expect(
      (await search({ query: "red blue" })).results.map((r) => r.id)
    ).toEqual(["phrase"]);
    expect(
      (await search({ query: "blue RED", matchMode: "and" })).results.map(
        (r) => r.id
      )
    ).toEqual(["phrase"]);
    expect(
      (await search({ query: "BLUE missing", matchMode: "or" })).results.map(
        (r) => r.id
      )
    ).toEqual(["phrase", "split"]);
    expect(
      (await search({ query: "a+b? [x]" })).results.map((r) => r.id)
    ).toEqual(["phrase"]);
    expect((await search({ query: "a.*b" })).results).toEqual([]);
  });
  it("highlights decoded JSON, Chinese, surrogate pairs and combining sequences with UTF-16 offsets", async () => {
    const text = '前缀😀 e\u0301 \"quoted\"\n中文😀 needle';
    await session("unicode", text);
    for (const query of ['"quoted"', "中文😀", "e\u0301"]) {
      const { results } = await search({ query });
      const match = results[0].matches[0];
      expect(
        match.match_offsets.map(([start, end]) =>
          match.context.substring(start, end)
        )
      ).toEqual([query]);
      expect(match.context).toContain('"quoted" 中文😀');
    }
  });
  it("flushes every result up to the exact cap, bounds field matches and skips corrupt or unrelated files", async () => {
    await Promise.all(
      Array.from({ length: 27 }, (_, i) =>
        session("s" + String(i).padStart(2, "0"), "needle", {
          nodes: Object.fromEntries(
            Array.from({ length: 10 }, (_, n) => [
              "n" + n,
              { content: "needle", metadata: { reasoningContent: "needle" } },
            ])
          ),
        })
      )
    );
    await write("llm-chat/sessions/broken.json", "{broken");
    await write("llm-chat/sessions/no-schema.json", {
      id: "invalid",
      name: {},
    });
    await write("llm-chat/sessions/ignored.json.bak", {
      id: "backup",
      name: "needle",
    });
    await write("llm-chat/sessions/nested/ignored.json", {
      id: "nested",
      name: "needle",
    });
    const { events, results } = await search({ limit: 23 });
    expect(results).toHaveLength(23);
    expect(new Set(results.map((r) => r.id)).size).toBe(23);
    expect(results.every((r) => r.matches.length === 5)).toBe(true);
    expect(
      events.filter((e) => e.type === "resultBatch").map((e) => e.data.length)
    ).toEqual([10, 10, 3]);
    expect((await search({ limit: 0 })).results).toEqual([]);
    expect((await search({ query: "   " })).results).toEqual([]);
  });
  it("cancels only the requesting owner and acknowledges after its terminal event", async () => {
    await Promise.all(Array.from({ length: 40 }, (_, i) => session("s" + i)));
    const first: SearchStreamPayload[] = [],
      other: SearchStreamPayload[] = [];
    let cancellation: Promise<void> | undefined;
    const a = service.search(1, { query: "needle" }, (event) => {
      first.push(event);
      if (event.type === "resultBatch" && !cancellation)
        cancellation = service.cancel(1);
      return true;
    });
    const b = service.search(2, { query: "needle" }, (event) => {
      other.push(event);
      return true;
    });
    await Promise.all([a, b]);
    await cancellation;
    expect(results(first)).toHaveLength(10);
    expect(first[first.length - 1].type).toBe("done");
    expect(results(other)).toHaveLength(40);
    expect((await search()).results).toHaveLength(40);
  });
  it("revokes publication on owner disposal and accepts a successor without late results", async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => session("s" + i)));
    const events: SearchStreamPayload[] = [];
    let successor: ReturnType<typeof search> | undefined;
    await service.search(1, { query: "needle" }, (event) => {
      events.push(event);
      if (event.type === "resultBatch") {
        service.disposeOwner(1);
        successor = search({ query: "absent" });
      }
      return true;
    });
    expect(events.map((e) => e.type)).toEqual(["resultBatch"]);
    expect((await successor)!.events.map((e) => e.type)).toEqual([
      "progress",
      "done",
    ]);
    expect((await search()).results).toHaveLength(25);
  });
  it("rejects redirected storage directories and invalid requests", async () => {
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "aio-search-outside-")
    );
    try {
      await fs.mkdir(path.join(root, "llm-chat"));
      await fs.symlink(
        outside,
        path.join(root, "llm-chat/sessions"),
        process.platform === "win32" ? "junction" : "dir"
      );
      await expect(search()).rejects.toThrow("重定向");
      for (const args of [
        { query: null },
        { limit: -1 },
        { limit: 0.5 },
        { scope: "files" },
        { matchMode: "regex" },
      ])
        await expect(search(args)).rejects.toThrow();
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

it("continues searching when concurrent recovery moves an enumerated file during realpath", async () => {
  await session("moving");
  await session("stable");
  const filename = path.join(root, "llm-chat/sessions/moving.json"),
    moved = path.join(root, "recovered.json");
  const realpath = fs.realpath.bind(fs);
  let renamed = false;
  const spy = vi
    .spyOn(fs, "realpath")
    .mockImplementation(async (value: Parameters<typeof fs.realpath>[0]) => {
      if (!renamed && String(value) === filename) {
        renamed = true;
        await fs.rename(filename, moved);
        return await realpath(moved);
      }
      return realpath(value);
    });
  try {
    const { results } = await search();
    expect(renamed).toBe(true);
    expect(results.map((result) => result.id)).toEqual(["stable"]);
  } finally {
    spy.mockRestore();
  }
});
