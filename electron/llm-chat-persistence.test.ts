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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { lock } from "proper-lockfile";
import { LlmChatPersistence } from "./llm-chat-persistence";

let directory: string, root: string, store: LlmChatPersistence;
const read = async (relative: string) =>
  JSON.parse(await fs.readFile(path.join(root, "llm-chat", relative), "utf8"));
function request(kind = "session", revision = 1, id = "session-1") {
  const sessionId = ["session", "requestSnapshots"].includes(kind)
    ? id
    : undefined;
  const content = {
    id,
    sessionId,
    name: "测试会话",
    schemaVersion: 1,
    attempts: [],
    _persistence: { schema: 1, revision, committedAt: "2026-11-04T00:00:00Z" },
  };
  return {
    kind,
    sessionId,
    revision,
    content: JSON.stringify(content),
    keepLastValidBackup: kind === "index",
  };
}
beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aiohub-llm-persistence-")
  );
  root = path.join(directory, "data");
  await fs.mkdir(root);
  store = new LlmChatPersistence(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await store.shutdown();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("LLM persistence public file and revision contract", () => {
  it("persists all four file kinds, preserves UTF-8 payloads and accepts legacy revision-zero files", async () => {
    for (const [kind, filename] of [
      ["session", "sessions/session-1.json"],
      ["index", "sessions-index.json"],
      ["corruptionManifest", "sessions-corrupt/corruption-manifest.json"],
      ["requestSnapshots", "request-snapshots/session-1.json"],
    ]) {
      const value = request(kind),
        full = path.join(root, "llm-chat", filename);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, JSON.stringify({ id: "session-1" }));
      const result = await store.write(value);
      expect(result).toMatchObject({
        outcome: "committed",
        revision: 1,
        bytes: Buffer.byteLength(value.content),
      });
      expect(await fs.readFile(full, "utf8")).toBe(value.content);
    }
  });
  it("serializes competing owners, rejects old or unexpectedly regressed revisions, and repairs a missing primary", async () => {
    const other = new LlmChatPersistence(root);
    try {
      await Promise.all([
        store.write(request("session", 2)),
        other.write(request("session", 1)),
        store.write(request("session", 3)),
      ]);
      expect(
        (await read("sessions/session-1.json"))._persistence.revision
      ).toBe(3);
      expect(await store.write(request("session", 3))).toMatchObject({
        outcome: "staleRejected",
        revision: 3,
        bytes: 0,
      });
      expect(
        await store.write({ ...request("session", 4), expectedMinRevision: 9 })
      ).toMatchObject({ outcome: "staleRejected", revision: 3 });
      await fs.rm(path.join(root, "llm-chat/sessions/session-1.json"));
      expect(
        await store.write({ ...request("session", 10), expectedMinRevision: 9 })
      ).toMatchObject({ outcome: "committed", revision: 10 });
    } finally {
      await other.shutdown();
    }
  });
  it("rotates only valid primary bytes into the backup, retaining the last valid backup across corruption", async () => {
    const first = request("index", 1);
    await store.write(first);
    await store.write(request("index", 2));
    const backup = path.join(root, "llm-chat/sessions-index.json.bak");
    expect(await fs.readFile(backup, "utf8")).toBe(first.content);
    await fs.writeFile(
      path.join(root, "llm-chat/sessions-index.json"),
      "{broken"
    );
    await store.write(request("index", 3));
    expect(await fs.readFile(backup, "utf8")).toBe(first.content);
  });
  it("rejects malformed logical IDs, content/revision mismatches and oversized request snapshots before writing", async () => {
    for (const value of [
      { ...request(), sessionId: "../outside" },
      { ...request(), sessionId: "CON" },
      { ...request(), sessionId: "a\\b" },
      { ...request(), sessionId: "a/b" },
      { ...request(), sessionId: "a\0b" },
      { ...request(), kind: "unknown" },
      { ...request(), revision: -1 },
      { ...request(), revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...request(), revision: 1.5 },
      { ...request("index"), sessionId: "unexpected" },
      { ...request(), content: "[]" },
      { ...request(), content: "{broken" },
      { ...request(), content: request("session", 2).content },
      { ...request(), sessionId: "different" },
      {
        ...request("requestSnapshots"),
        content: JSON.stringify({
          _persistence: { revision: 1 },
          sessionId: "session-1",
          schemaVersion: 2,
          attempts: [],
        }),
      },
      {
        ...request("requestSnapshots"),
        content: JSON.stringify({
          ...JSON.parse(request("requestSnapshots").content),
          padding: "x".repeat(4 * 1024 * 1024),
        }),
      },
    ])
      await expect(store.write(value)).rejects.toThrow();
    expect(await fs.readdir(root)).toEqual([]);
  });
  it("retains the previous primary on replacement failure, removes its temporary file and allows retry", async () => {
    await store.write(request());
    const filename = path.join(root, "llm-chat/sessions/session-1.json"),
      previous = await fs.readFile(filename, "utf8");
    const rename = fs.rename.bind(fs);
    const failure = vi
      .spyOn(fs, "rename")
      .mockImplementation(async (from, to) => {
        if (to === filename)
          throw Object.assign(new Error("sharing violation"), {
            code: "EPERM",
          });
        return rename(from, to);
      });
    await expect(store.write(request("session", 2))).rejects.toThrow(
      "sharing violation"
    );
    expect(await fs.readFile(filename, "utf8")).toBe(previous);
    expect(await fs.readdir(path.dirname(filename))).toEqual([
      "session-1.json",
    ]);
    failure.mockRestore();
    expect(await store.write(request("session", 2))).toMatchObject({
      outcome: "committed",
    });
  });
  it("deletes durably, archives session bytes, clears snapshots and prevents delayed writers from resurrecting either file", async () => {
    const initial = request();
    await store.write(initial);
    await store.write(request("requestSnapshots"));
    await Promise.all([
      store.write(request("requestSnapshots", 2)),
      store.deleteSession({ sessionId: "session-1" }),
      store.write(request("session", 2)),
    ]);
    const trash = await fs.readdir(path.join(root, "llm-chat/sessions-trash"));
    expect(trash).toHaveLength(1);
    const archived = JSON.parse(
      await fs.readFile(
        path.join(root, "llm-chat/sessions-trash", trash[0]),
        "utf8"
      )
    );
    expect(archived).toMatchObject({ id: "session-1", name: "测试会话" });
    expect([1, 2]).toContain(archived._persistence.revision);
    expect(await store.write(request("session", 99))).toMatchObject({
      outcome: "staleRejected",
      revision: Number.MAX_SAFE_INTEGER,
    });
    expect(await store.write(request("requestSnapshots", 99))).toMatchObject({
      outcome: "staleRejected",
      revision: Number.MAX_SAFE_INTEGER,
    });
    await expect(
      fs.access(path.join(root, "llm-chat/request-snapshots/session-1.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.deleteSession({ sessionId: "session-1" })).toEqual({
      movedToTrash: false,
    });
    await fs.writeFile(
      path.join(root, "llm-chat/sessions-tombstones/session-1.json"),
      "broken"
    );
    await expect(store.write(request("session", 100))).rejects.toThrow(
      "删除标记损坏"
    );
  });
  it("rejects redirected project directories and backup paths while preserving the external files", async () => {
    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.mkdir(path.join(root, "llm-chat"));
    await fs.symlink(
      outside,
      path.join(root, "llm-chat/sessions"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(store.write(request())).rejects.toThrow("重定向");
    await expect(
      store.deleteSession({ sessionId: "session-1" })
    ).rejects.toThrow("重定向");
    expect(await fs.readdir(outside)).toEqual([]);
    await store.write(request("index", 1));
    const protectedFile = path.join(outside, "saved.json");
    await fs.writeFile(protectedFile, "protected");
    // A directory junction at a file path is rejected on Windows without requiring symlink privileges.
    await fs.symlink(
      outside,
      path.join(root, "llm-chat/sessions-index.json.bak"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(store.write(request("index", 2))).rejects.toThrow("重定向");
    expect(await fs.readFile(protectedFile, "utf8")).toBe("protected");
    expect((await read("sessions-index.json"))._persistence.revision).toBe(1);
  });
  it("drains accepted writes before shutdown and rejects new writes while draining", async () => {
    await store.write(request());
    const filename = path.join(root, "llm-chat/sessions/session-1.json");
    const release = await lock(filename, {
      realpath: false,
      lockfilePath: filename + ".electron-lock",
      stale: 30000,
      update: 5000,
    });
    try {
      const saving = store.write(request("session", 2));
      const stopping = store.shutdown();
      expect(store.hasPendingOperations).toBe(true);
      await expect(store.write(request("session", 3))).rejects.toThrow(
        "正在退出"
      );
      await release();
      await stopping;
      await saving;
      expect(store.hasPendingOperations).toBe(false);
      expect(
        (await read("sessions/session-1.json"))._persistence.revision
      ).toBe(2);
    } finally {
      await release().catch(() => {});
    }
  });
  it("waits for another process's lease before evaluating the current revision", async () => {
    await store.write(request("session", 2));
    const filename = path.join(root, "llm-chat/sessions/session-1.json");
    const release = await lock(filename, {
      realpath: false,
      lockfilePath: filename + ".electron-lock",
      stale: 30000,
      update: 5000,
    });
    const worker = path.join(directory, "writer.ts"),
      source = pathToFileURL(
        path.resolve("electron/llm-chat-persistence.ts")
      ).href;
    await fs.writeFile(
      worker,
      "import {LlmChatPersistence} from " +
        JSON.stringify(source) +
        ';const store=new LlmChatPersistence(process.argv[2]);console.log("ready");const saving=store.write(JSON.parse(process.argv[3]));setTimeout(()=>console.log("waiting"),200);console.log(JSON.stringify(await saving));await store.shutdown();'
    );
    const child = spawn(
      "bun",
      [worker, root, JSON.stringify(request("session", 3))],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    let output = "",
      errors = "";
    child.stdout.on("data", (data) => {
      output += String(data);
    });
    child.stderr.on("data", (data) => {
      errors += String(data);
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    try {
      await vi.waitFor(() => expect(output).toContain("waiting"));
      expect(output.trim().split(/\r?\n/)).toEqual(["ready", "waiting"]);
      // While this process owns the lease, a newer commit becomes visible to the waiting writer.
      await fs.writeFile(filename, request("session", 4).content);
      await release();
      expect(await exited, errors).toBe(0);
      expect(JSON.parse(output.trim().split(/\r?\n/).at(-1)!)).toMatchObject({
        outcome: "staleRejected",
        revision: 4,
      });
      expect(
        (await read("sessions/session-1.json"))._persistence.revision
      ).toBe(4);
    } finally {
      child.kill();
      await exited.catch(() => {});
      await release().catch(() => {});
    }
  });
});
