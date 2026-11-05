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
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { GitCommands } from "./git";
import { runCapturedProcessBytes } from "./process-runner";

let directory: string, repo: string, service: GitCommands;
let sourceFixture: string, sourceHead: string;
const trash = vi.fn(async (file: string) => {
  await fs.rename(file, path.join(directory, "trashed-" + path.basename(file)));
});
async function git(root: string, args: string[]) {
  const result = await runCapturedProcessBytes("git", ["-C", root, ...args], {
    timeoutMs: 30000,
    maxOutputBytes: 32 * 1024 ** 2,
    env: { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (result.exitCode !== 0) throw Error(result.stderr.toString());
  return result.stdout;
}
async function call(name: string, args: Record<string, unknown> = {}) {
  return service.runCommand(1, name, { path: repo, ...args }) as Promise<any>;
}
beforeAll(async () => {
  sourceFixture = await fs.mkdtemp(
    path.join(os.tmpdir(), "aio-git-existing-history-")
  );
  await git(sourceFixture, ["init", "-b", "codex/fixture"]);
  // Copy existing objects only: tests create no commits or changes in the developer checkout.
  await git(sourceFixture, [
    "fetch",
    "--no-tags",
    "--depth=2",
    path.resolve("."),
    "HEAD",
  ]);
  sourceHead = (await git(sourceFixture, ["rev-parse", "FETCH_HEAD"]))
    .toString()
    .trim();
  await git(sourceFixture, [
    "update-ref",
    "refs/heads/codex/fixture",
    sourceHead,
  ]);
});
afterAll(async () => {
  await fs.rm(sourceFixture, { recursive: true, force: true });
});
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aio-git-"));
  repo = path.join(directory, "repo");
  await fs.mkdir(repo);
  await git(repo, ["init", "-b", "codex/fixture"]);
  await git(repo, ["config", "core.autocrlf", "false"]);
  service = new GitCommands({ trash });
  trash.mockClear();
});
afterEach(async () => {
  await service.shutdown();
  await fs.rm(directory, { recursive: true, force: true });
});
async function existingHistory() {
  await fs.writeFile(
    path.join(repo, ".git", "objects", "info", "alternates"),
    path.join(sourceFixture, ".git", "objects").replaceAll("\\", "/") + "\n"
  );
  await fs.copyFile(
    path.join(sourceFixture, ".git", "shallow"),
    path.join(repo, ".git", "shallow")
  );
  await git(repo, ["update-ref", "refs/heads/codex/fixture", sourceHead]);
  await git(repo, ["sparse-checkout", "set", "--no-cone", "/README.md"]);
  await git(repo, ["reset", "--hard", sourceHead]);
}
describe("Electron Git workspace contracts", () => {
  it("passes a multiline commit message as one argument and surfaces commit failures", async () => {
    const captured: string[][] = [];
    let fail = false;
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        if (!args.includes("commit"))
          return runCapturedProcessBytes(exe, args, options);
        captured.push(args);
        return {
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(fail ? "identity is not configured" : ""),
          exitCode: fail ? 1 : 0,
        };
      },
    });
    const message = "feat: literal $(command) & --option\n\nDetailed body";
    expect(await call("git_commit", { message })).toBe(null);
    expect(captured[0].slice(-3)).toEqual(["commit", "-m", message]);
    fail = true;
    await expect(call("git_commit", { message })).rejects.toThrow(
      "identity is not configured"
    );
    // The command runner is intercepted: this test creates no Git commit.
    expect(
      (
        await runCapturedProcessBytes(
          "git",
          ["-C", repo, "rev-parse", "--verify", "HEAD"],
          { timeoutMs: 5000 }
        )
      ).exitCode
    ).not.toBe(0);
  });
  it("chunks long file selections within the Windows argv budget without dropping names", async () => {
    const captured: string[][] = [];
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        if (!args.includes("add"))
          return runCapturedProcessBytes(exe, args, options);
        captured.push(args);
        return {
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          exitCode: 0,
        };
      },
    });
    const files = Array.from(
      { length: 200 },
      (_, i) => `file-${i}-` + "x".repeat(100) + ".txt"
    );
    await call("git_stage_files", { files });
    expect(captured.length).toBeGreaterThan(1);
    expect(
      captured.flatMap((args) => args.slice(args.indexOf("--") + 1))
    ).toEqual(files);
    expect(captured.every((args) => args.join(" ").length < 16000)).toBe(true);
  });

  it("serializes accepted index writes across windows and drains them through shutdown", async () => {
    let running = 0,
      maximum = 0;
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        if (!args.includes("add"))
          return runCapturedProcessBytes(exe, args, options);
        maximum = Math.max(maximum, ++running);
        await new Promise((r) => setTimeout(r, 40));
        try {
          return await runCapturedProcessBytes(exe, args, options);
        } finally {
          running--;
        }
      },
    });
    const files = ["one.txt", "two.txt", "three.txt"];
    for (const f of files) await fs.writeFile(path.join(repo, f), f);
    const operations = files.map((f, i) =>
      service.runCommand((i % 2) + 1, "git_stage_files", {
        path: repo,
        files: [f],
      })
    );
    service.disposeOwner(1);
    const shutdown = service.shutdown();
    await Promise.all(operations);
    await shutdown;
    expect(maximum).toBe(1);
    expect(
      (await git(repo, ["ls-files", "-z"]))
        .toString()
        .split("\0")
        .filter(Boolean)
    ).toEqual(files.slice().sort());
    await expect(call("git_get_repo_status")).rejects.toThrow("退出");
  });
  it("cancels only reads belonging to the disposed window", async () => {
    const waiting: { signal: AbortSignal; resolve: (value: any) => void }[] =
      [];
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        if (!args.includes("status"))
          return runCapturedProcessBytes(exe, args, options);
        return new Promise((resolve, reject) => {
          waiting.push({ signal: options.signal!, resolve });
          options.signal!.addEventListener(
            "abort",
            () => reject(Error("cancelled")),
            { once: true }
          );
        });
      },
    });
    const first = service.runCommand(1, "git_get_repo_status", { path: repo }),
      second = service.runCommand(2, "git_get_repo_status", { path: repo });
    const rejected = expect(first).rejects.toThrow("cancelled");
    for (let i = 0; i < 100 && waiting.length < 2; i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(waiting).toHaveLength(2);
    service.disposeOwner(1);
    await rejected;
    expect(waiting.filter((w) => w.signal.aborted)).toHaveLength(1);
    waiting
      .find((w) => !w.signal.aborted)!
      .resolve({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        exitCode: 0,
      });
    expect(await second).toMatchObject({ staged: [], unstaged: [] });
  });
  it("keeps staged and worktree content independent, restores the index and unstages an unborn repository", async () => {
    const file = "中文 space [bracket].ts";
    await fs.writeFile(path.join(repo, file), "staged version\n");
    await call("git_stage_files", { files: [file] });
    await fs.writeFile(path.join(repo, file), "worktree version\n");
    const status = await call("git_get_repo_status");
    expect(status).toMatchObject({
      headCommitHash: "",
      ahead: 0,
      behind: 0,
      staged: [{ path: file, status: "A", isBinary: false }],
      unstaged: [{ path: file, status: "M", isBinary: false }],
    });
    const staged = await call("git_get_file_diff", {
      filePath: file,
      isStaged: true,
    });
    expect(staged).toMatchObject({
      original: "",
      modified: "staged version\n",
      isBinary: false,
    });
    expect(staged.originalSide.exists).toBe(false);
    const working = await call("git_get_file_diff", {
      filePath: file,
      isStaged: false,
    });
    expect(working).toMatchObject({
      original: "staged version\n",
      modified: "worktree version\n",
      isBinary: false,
    });
    await call("git_discard_files", { files: [file] });
    expect(await fs.readFile(path.join(repo, file), "utf8")).toBe(
      "staged version\n"
    );
    expect((await call("git_get_repo_status")).staged[0].status).toBe("A");
    await call("git_unstage_files", { files: [file] });
    expect((await call("git_get_repo_status")).staged).toEqual([]);
    expect(await fs.readFile(path.join(repo, file), "utf8")).toBe(
      "staged version\n"
    );
  });
  it("handles binary snapshots byte-for-byte and keeps worktree media on a local stream path", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0XcAAAAASUVORK5CYII=",
      "base64"
    );
    await fs.writeFile(path.join(repo, "image.png"), png);
    await call("git_stage_files", { files: ["image.png"] });
    const diff = await call("git_get_file_diff", {
      filePath: "image.png",
      isStaged: true,
    });
    expect(diff).toMatchObject({
      isBinary: true,
      original: "",
      modified: "",
      modifiedSide: {
        previewKind: "image",
        snapshotAvailable: true,
        byteSize: png.length,
      },
    });
    const snapshot = await call("git_read_file_preview_binary", {
      filePath: "image.png",
      isStaged: true,
      side: "modified",
    });
    expect(snapshot).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(snapshot)).toEqual(png);
    const worktree = await call("git_get_file_diff", {
      filePath: "image.png",
      isStaged: false,
    });
    expect(worktree.modifiedSide.localPath).toBe(path.join(repo, "image.png"));
    await expect(
      call("git_read_file_preview_binary", {
        filePath: "image.png",
        isStaged: false,
        side: "modified",
      })
    ).rejects.toThrow("本地路径");
  });
  it("validates every selected path before writes and treats pathspec metacharacters literally", async () => {
    await fs.writeFile(path.join(repo, "a[1].txt"), "one");
    await fs.writeFile(path.join(repo, "a1.txt"), "other");
    await expect(
      call("git_stage_files", { files: ["a[1].txt", "../escape"] })
    ).rejects.toThrow("路径");
    expect((await call("git_get_repo_status")).staged).toEqual([]);
    await call("git_stage_files", { files: ["a[1].txt"] });
    expect(
      (await call("git_get_repo_status")).staged.map((s: any) => s.path)
    ).toEqual(["a[1].txt"]);
    await expect(
      call("git_discard_files", { files: [".git/config"] })
    ).rejects.toThrow("Git 元数据");
    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "keep.txt"), "keep");
    await fs.symlink(
      outside,
      path.join(repo, "link"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(
      call("git_stage_files", { files: ["link/keep.txt"] })
    ).rejects.toThrow("目录链接");
    expect(await fs.readFile(path.join(outside, "keep.txt"), "utf8")).toBe(
      "keep"
    );
  });
  it("sends untracked files to the host recycle bin and surfaces Git write failures", async () => {
    await fs.writeFile(path.join(repo, "untracked.txt"), "recoverable");
    await call("git_discard_files", { files: ["untracked.txt"] });
    expect(trash).toHaveBeenCalledWith(path.join(repo, "untracked.txt"));
    expect(
      await fs.readFile(path.join(directory, "trashed-untracked.txt"), "utf8")
    ).toBe("recoverable");
    await fs.writeFile(path.join(repo, "locked.txt"), "data");
    await fs.writeFile(
      path.join(repo, ".git/index.lock"),
      "owned by other Git operation"
    );
    await expect(
      call("git_stage_files", { files: ["locked.txt"] })
    ).rejects.toThrow("index.lock");
  });
  it("scans only repository roots and respects nested boundaries, exclusions and explicit linked roots", async () => {
    const parent = path.join(directory, "workspace");
    await fs.mkdir(parent);
    await fs.rename(repo, path.join(parent, "first"));
    repo = path.join(parent, "first");
    await fs.mkdir(path.join(repo, "nested"));
    await git(path.join(repo, "nested"), ["init"]);
    await fs.mkdir(path.join(parent, "node_modules", "hidden"), {
      recursive: true,
    });
    await git(path.join(parent, "node_modules", "hidden"), ["init"]);
    const alias = path.join(directory, "alias");
    await fs.symlink(
      repo,
      alias,
      process.platform === "win32" ? "junction" : "dir"
    );
    const missing = path.join(directory, "missing");
    const result = (await service.runCommand(1, "git_scan_repositories", {
      paths: [parent, alias, missing],
    })) as any;
    expect(result.repositories.map((r: any) => r.path)).toEqual([
      await fs.realpath(repo),
    ]);
    expect(result.invalidPaths).toEqual([missing]);
    expect(result.scanLimitReached).toBe(false);
  });
  it("reads existing history, commit details, refs and overview without modifying the developer repository", async () => {
    await existingHistory();
    await git(repo, ["config", "user.name", "Fixture User"]);
    await git(repo, ["config", "user.email", "fixture@example.invalid"]);
    await git(repo, ["tag", "fixture-tag", sourceHead]);
    const list = await call("git_get_incremental_commits", {
      limit: 1,
      skip: 0,
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      hash: sourceHead,
      stats: null,
      files: null,
      tags: ["fixture-tag"],
      branches: ["codex/fixture"],
    });
    expect(list[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const next = await call("git_get_incremental_commits", {
      limit: 1,
      skip: 1,
    });
    expect(next).toHaveLength(1);
    expect(next[0].hash).toBe(list[0].parents[0]);
    expect(
      (
        await call("git_get_branch_commits", {
          branch: "codex/fixture",
          limit: 0,
        })
      ).length
    ).toBe(2);
    const commit = await call("git_get_commit_detail", {
      hash: sourceHead.slice(0, 12),
    });
    expect(commit.hash).toBe(sourceHead);
    expect(commit.stats.files).toBe(commit.files.length);
    expect(
      commit.files.every(
        (f: any) =>
          Number.isInteger(f.additions) && Number.isInteger(f.deletions)
      )
    ).toBe(true);
    const info = await call("git_get_repo_overview");
    expect(info).toMatchObject({
      headHash: sourceHead,
      totalCommits: 2,
      localUserName: "Fixture User",
      localUserEmail: "fixture@example.invalid",
      stashes: [],
    });
    expect(info.tags[0]).toMatchObject({
      name: "fixture-tag",
      hash: sourceHead,
    });
    await git(repo, [
      "update-ref",
      "refs/remotes/origin/codex/fixture",
      list[0].parents[0],
    ]);
    await git(repo, ["config", "branch.codex/fixture.remote", "origin"]);
    await git(repo, [
      "config",
      "branch.codex/fixture.merge",
      "refs/heads/codex/fixture",
    ]);
    await git(repo, [
      "config",
      "remote.origin.fetch",
      "+refs/heads/*:refs/remotes/origin/*",
    ]);
    expect(await call("git_get_repo_status")).toMatchObject({
      ahead: 1,
      behind: 0,
    });
  }, 15000);
  it("parses a rename record once and resolves each staged and unstaged status separately", async () => {
    await existingHistory();
    await git(repo, [
      "sparse-checkout",
      "set",
      "--no-cone",
      "/README.md",
      "/renamed.md",
    ]);
    await git(repo, ["mv", "README.md", "renamed.md"]);
    await fs.appendFile(
      path.join(repo, "renamed.md"),
      "\nadditional worktree edit\n"
    );
    const state = await call("git_get_repo_status");
    const stagedDiff = await call("git_get_file_diff", {
      filePath: "renamed.md",
      isStaged: true,
    });
    expect(stagedDiff.original).toBe(stagedDiff.modified);
    expect(stagedDiff.original.length).toBeGreaterThan(0);
    expect(stagedDiff.originalSide.path).toBe("README.md");
    expect(state.staged).toHaveLength(1);
    expect(state.staged[0]).toMatchObject({ path: "renamed.md", status: "R" });
    expect(state.unstaged).toHaveLength(1);
    expect(state.unstaged[0]).toMatchObject({
      path: "renamed.md",
      status: "M",
    });
  });
});

// Protect progressive history delivery, opt-in data, and window-local cancellation.
// These assertions observe public events and results rather than task-map internals.
describe("Electron Git analyzer streams", () => {
  type Event = { owner: number; event: string; payload: any };
  async function settled() {
    await vi.waitFor(() => expect(service.hasPendingOperations).toBe(false), {
      timeout: 15000,
    });
  }
  it("loads summaries, lightweight paths, incremental statistics and one-batch history", async () => {
    await existingHistory();
    const events: Event[] = [];
    service = new GitCommands({
      trash,
      emit: (owner, event, payload) => events.push({ owner, event, payload }),
    });
    await call("git_load_repository_stream", {
      branch: "saved-from-another-repo",
      limit: 1,
      batchSize: 1,
      includeFiles: true,
    });
    await settled();
    expect(events.map((e) => e.payload.type)).toEqual([
      "start",
      "data",
      "meta",
      "end",
    ]);
    expect(
      events.every((e) => e.owner === 1 && e.event === "git-progress")
    ).toBe(true);
    expect(events[0].payload).toMatchObject({
      branch: "codex/fixture",
      total: 1,
    });
    const first = events[1].payload.commits[0];
    expect(first).toMatchObject({ hash: sourceHead, stats: null });
    expect(first.files.length).toBeGreaterThan(0);
    expect(
      first.files.every((f: any) => f.additions === 0 && f.deletions === 0)
    ).toBe(true);
    events.length = 0;
    await call("git_load_incremental_stream", {
      branch: "codex/fixture",
      skip: 1,
      limit: 1,
      batchSize: 1,
      includeLineStats: true,
      includeBranchInference: true,
    });
    await settled();
    const data = events.find((e) => e.payload.type === "data")!.payload;
    expect(data.loaded).toBe(2);
    expect(data.commits[0].hash).toBe(first.parents[0]);
    expect(data.commits[0].stats.files).toBe(data.commits[0].files.length);
    expect(data.commits[0].branches).toContain("codex/fixture");
    expect(events.at(-2)!.payload).toEqual({ type: "meta", total: 2 });
    events.length = 0;
    await call("git_load_repository_stream", { limit: 0, batchSize: 0 });
    await settled();
    expect(events.filter((e) => e.payload.type === "data")).toHaveLength(1);
    expect(events[1].payload.commits.map((c: any) => c.hash)).toEqual([
      sourceHead,
      first.parents[0],
    ]);
    expect(
      events[1].payload.commits.every(
        (c: any) => c.stats === null && c.files === null
      )
    ).toBe(true);
  });
  it("loads every commit once across subprocess pages with accurate batch counters", async () => {
    await git(repo, [
      "fetch",
      "--no-tags",
      "--depth=205",
      path.resolve("."),
      "HEAD",
    ]);
    await git(repo, ["update-ref", "refs/heads/codex/fixture", "FETCH_HEAD"]);
    const events: Event[] = [];
    service = new GitCommands({
      trash,
      emit: (owner, event, payload) => events.push({ owner, event, payload }),
    });
    await call("git_load_repository_stream", { limit: 0, batchSize: 7 });
    await settled();
    const batches = events
      .filter((e) => e.payload.type === "data")
      .map((e) => e.payload);
    const hashes = batches.flatMap((e) => e.commits.map((c: any) => c.hash));
    const expected = (await git(repo, ["rev-list", "--topo-order", "HEAD"]))
      .toString()
      .trim()
      .split("\n");
    expect(hashes).toEqual(expected);
    expect(expected.length).toBeGreaterThan(200);
    expect(new Set(hashes).size).toBe(expected.length);
    expect(batches.map((b) => b.loaded)).toEqual(
      Array.from({ length: Math.ceil(expected.length / 7) }, (_, i) =>
        Math.min((i + 1) * 7, expected.length)
      )
    );
    expect(events.at(-2)!.payload).toEqual({
      type: "meta",
      total: expected.length,
    });
    expect(events.at(-1)!.payload.type).toBe("end");
  }, 15000);
  it("enriches only requested fields, reports object errors once and accepts another stream", async () => {
    await existingHistory();
    const events: Event[] = [];
    service = new GitCommands({
      trash,
      emit: (owner, event, payload) => events.push({ owner, event, payload }),
    });
    await call("git_enrich_commits_stream", {
      hashes: [sourceHead],
      batchSize: 1,
      includeStats: true,
      includeFiles: false,
      includeBranches: true,
    });
    await settled();
    expect(events.map((e) => e.payload.type)).toEqual(["start", "data", "end"]);
    expect(events.every((e) => e.event === "git-enrich-progress")).toBe(true);
    expect(events[1].payload).toMatchObject({
      progress: 1,
      enriched: [
        { hash: sourceHead, files: null, branches: ["codex/fixture"] },
      ],
    });
    expect(events[1].payload.enriched[0].stats.files).toBeGreaterThan(0);
    events.length = 0;
    await call("git_enrich_commits_stream", { hashes: ["f".repeat(40)] });
    await settled();
    expect(events.map((e) => e.payload.type)).toEqual(["start", "error"]);
    expect(events[1].payload.message).toBeTruthy();
    events.length = 0;
    await call("git_enrich_commits_stream", {
      hashes: [sourceHead],
      includeStats: false,
      includeFiles: false,
    });
    await settled();
    expect(events[1].payload.enriched).toEqual([
      { hash: sourceHead, stats: null, files: null, branches: null },
    ]);
    expect(events.at(-1)!.payload.type).toBe("end");
  });
  it("cancels one window's load without interrupting another window or its enrichment", async () => {
    await existingHistory();
    const events: Event[] = [],
      waiting: AbortSignal[] = [];
    let block = true;
    service = new GitCommands({
      trash,
      emit: (owner, event, payload) => events.push({ owner, event, payload }),
      capture: async (exe, args, options) => {
        if (!block || !args.includes("log"))
          return runCapturedProcessBytes(exe, args, options);
        return new Promise((_, reject) => {
          waiting.push(options.signal!);
          options.signal!.addEventListener(
            "abort",
            () => reject(Error("cancelled")),
            { once: true }
          );
        });
      },
    });
    await service.runCommand(1, "git_load_repository_stream", {
      path: repo,
      limit: 0,
    });
    await service.runCommand(2, "git_load_repository_stream", {
      path: repo,
      limit: 0,
    });
    await service.runCommand(1, "git_enrich_commits_stream", {
      path: repo,
      hashes: [sourceHead],
    });
    await vi.waitFor(() => expect(waiting).toHaveLength(3), { timeout: 15000 });
    await expect(call("git_load_repository_stream")).rejects.toThrow(
      "正在运行"
    );
    await call("git_cancel_load");
    expect(waiting.filter((s) => s.aborted)).toHaveLength(1);
    expect(events.filter((e) => e.payload.type === "cancelled")).toMatchObject([
      { owner: 1, event: "git-progress" },
    ]);
    expect(
      events.filter((e) => e.owner === 2).map((e) => e.payload.type)
    ).toEqual(["start"]);
    await call("git_cancel_enrich");
    expect(waiting.filter((s) => s.aborted)).toHaveLength(2);
    block = false;
    await service.runCommand(2, "git_cancel_load", {});
    events.length = 0;
    await call("git_load_repository_stream", { limit: 1 });
    await settled();
    expect(events.at(-1)!.payload.type).toBe("end");
  });
  it("silences stale renderer events and lets its replacement load while cancellation drains", async () => {
    await existingHistory();
    const events: Event[] = [];
    let release: (() => void) | undefined,
      blocked = false;
    service = new GitCommands({
      trash,
      emit: (owner, event, payload) => events.push({ owner, event, payload }),
      capture: async (exe, args, options) => {
        if (!args.includes("log") || blocked)
          return runCapturedProcessBytes(exe, args, options);
        blocked = true;
        return new Promise((_, reject) => {
          release = () => reject(Error("renderer closed"));
        });
      },
    });
    await call("git_load_repository_stream", { limit: 1 });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"), {
      timeout: 15000,
    });
    service.disposeOwner(1);
    events.length = 0;
    await call("git_load_repository_stream", { limit: 1 });
    await vi.waitFor(() => expect(events.at(-1)?.payload.type).toBe("end"), {
      timeout: 10000,
    });
    release!();
    await settled();
    expect(events.map((e) => e.payload.type)).toEqual([
      "start",
      "data",
      "meta",
      "end",
    ]);
  });
  it("delivers the first batch before cancellation and emits one terminal event", async () => {
    await existingHistory();
    const events: Event[] = [];
    service = new GitCommands({
      trash,
      emit: (owner, event, payload: any) => {
        events.push({ owner, event, payload });
        if (payload.type === "data")
          void service.runCommand(owner, "git_cancel_load", {});
      },
    });
    await call("git_load_repository_stream", { limit: 0, batchSize: 1 });
    await settled();
    expect(events.map((e) => e.payload.type)).toEqual([
      "start",
      "data",
      "cancelled",
    ]);
    expect(events[1].payload.commits).toHaveLength(1);
    expect(events[1].payload.loaded).toBe(1);
  });
  it("returns an empty repository stream and turns invalid options into actionable terminal events", async () => {
    const events: Event[] = [];
    service = new GitCommands({
      trash,
      emit: (owner, event, payload) => events.push({ owner, event, payload }),
    });
    await call("git_load_repository_stream", { limit: 0 });
    await settled();
    expect(events.map((e) => e.payload)).toMatchObject([
      { type: "start", branches: [] },
      { type: "meta", total: 0 },
      { type: "end" },
    ]);
    events.length = 0;
    await call("git_load_repository_stream", { batchSize: -1 });
    await settled();
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ type: "error" });
    expect(events[0].payload.message).toBeTruthy();
  });
});

// Protect repository mutation semantics using copied commits and local-only remotes.
describe("Electron Git branch and remote operations", () => {
  it("creates, checks out and deletes literal branches, and fast-forwards without creating a commit", async () => {
    await existingHistory();
    const parent = (await git(repo, ["rev-parse", "HEAD~1"])).toString().trim();
    await call("git_create_branch", {
      branchName: "codex/验证",
      startPoint: parent,
    });
    await call("git_checkout_branch", { branchName: "codex/验证" });
    expect((await call("git_get_repo_status")).headCommitHash).toBe(parent);
    const merge = await call("git_merge_branch", {
      branchName: "codex/fixture",
    });
    expect(merge).toMatchObject({ success: true, hasConflicts: false });
    expect((await call("git_get_repo_status")).headCommitHash).toBe(sourceHead);
    await call("git_undo_last_commit");
    expect((await git(repo, ["rev-parse", "HEAD"])).toString().trim()).toBe(
      parent
    );
    expect(
      (await git(repo, ["diff", "--cached", "--name-only"])).length
    ).toBeGreaterThan(0);
    await call("git_checkout_branch", { branchName: "codex/fixture" });
    await call("git_delete_branch", { branchName: "codex/验证", force: false });
    await expect(
      call("git_create_branch", { branchName: "--force" })
    ).rejects.toThrow("名称无效");
    await expect(
      call("git_delete_branch", { branchName: "codex/fixture", force: "false" })
    ).rejects.toThrow("选项无效");
    expect((await call("git_get_branches")).map((b: any) => b.name)).toEqual([
      "codex/fixture",
    ]);
  }, 20000);
  it("pushes only the selected tag, then pushes and pulls a branch against a local bare remote", async () => {
    await existingHistory();
    await git(repo, ["config", "user.name", "Fixture User"]);
    await git(repo, ["config", "user.email", "fixture@example.invalid"]);
    await git(repo, ["config", "tag.gpgSign", "true"]);
    const remote = path.join(directory, "remote.git");
    await fs.mkdir(remote);
    await git(remote, ["init", "--bare"]);
    await git(remote, ["fetch", "--depth=2", sourceFixture, sourceHead]);
    await git(remote, ["config", "receive.shallowUpdate", "true"]);
    const parent = (await git(repo, ["rev-parse", "HEAD~1"])).toString().trim();
    await git(remote, ["update-ref", "refs/heads/codex/fixture", parent]);
    await git(repo, ["remote", "add", "origin", remote]);
    await call("git_create_tag", {
      tagName: "v1.2.3",
      annotated: true,
      message: "中文 release\n\nDetails",
    });
    await call("git_create_tag", { tagName: "unselected", annotated: true });
    await call("git_create_tag", {
      tagName: "light",
      targetHash: parent,
      annotated: false,
      message: "ignored for lightweight",
    });
    const tags = await call("git_get_tags");
    expect(tags.find((t: any) => t.name === "v1.2.3")).toMatchObject({
      hash: sourceHead,
      message: "中文 release\n\nDetails\n",
    });
    expect(tags.find((t: any) => t.name === "light")).toMatchObject({
      hash: parent,
      message: null,
    });
    await git(repo, ["config", "push.followTags", "true"]);
    await call("git_push_tag", { tagName: "v1.2.3", remoteName: "origin" });
    expect(
      (await git(remote, ["for-each-ref", "--format=%(refname)"]))
        .toString()
        .trim()
        .split("\n")
    ).toEqual(["refs/heads/codex/fixture", "refs/tags/v1.2.3"]);
    expect(
      (await git(remote, ["rev-parse", "refs/heads/codex/fixture"]))
        .toString()
        .trim()
    ).toBe(parent);
    await expect(
      call("git_push_tag", { tagName: "v1.2.3", remoteName: remote })
    ).rejects.toThrow("已配置");
    await git(repo, ["config", "push.followTags", "false"]);
    await git(repo, ["config", "push.default", "current"]);
    await call("git_push");
    expect(
      (await git(remote, ["rev-parse", "refs/heads/codex/fixture"]))
        .toString()
        .trim()
    ).toBe(sourceHead);
    await call("git_create_branch", {
      branchName: "codex/pull",
      startPoint: parent,
    });
    await call("git_checkout_branch", { branchName: "codex/pull" });
    await git(repo, ["branch", "--set-upstream-to=origin/codex/fixture"]);
    await call("git_pull");
    expect((await call("git_get_repo_status")).headCommitHash).toBe(sourceHead);
    await call("git_delete_tag", { tagName: "light" });
    expect(
      (await call("git_get_tags")).some((t: any) => t.name === "light")
    ).toBe(false);
  }, 30000);
  it("preserves the stash reflog when apply, pop or drop reject an invalid stash object", async () => {
    await existingHistory();
    // A reflog fixture references an existing object. It deliberately has no stash parents.
    await git(repo, [
      "update-ref",
      "--create-reflog",
      "-m",
      "fixture stash entry",
      "refs/stash",
      sourceHead,
    ]);
    expect(await call("git_stash_list")).toMatchObject([
      {
        index: 0,
        hash: sourceHead.slice(0, 7),
        message: "fixture stash entry",
      },
    ]);
    await expect(call("git_stash_apply", { index: 0 })).rejects.toThrow(
      "Git 操作失败"
    );
    await expect(call("git_stash_pop", { index: 0 })).rejects.toThrow(
      "Git 操作失败"
    );
    expect(await call("git_stash_list")).toHaveLength(1);
    await expect(call("git_stash_drop", { index: -1 })).rejects.toThrow(
      "分页范围"
    );
    await expect(call("git_stash_drop", { index: 0 })).rejects.toThrow(
      "Git 操作失败"
    );
    expect(await call("git_stash_list")).toHaveLength(1);
  }, 15000);
  it("passes amend/stash messages as single arguments and returns actionable write errors", async () => {
    const captured: string[][] = [];
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        const command = args[args.indexOf("-C") + 2];
        if (!["commit", "stash"].includes(command))
          return runCapturedProcessBytes(exe, args, options);
        captured.push(args.slice(args.indexOf("-C") + 2));
        return {
          stdout: Buffer.alloc(0),
          stderr: Buffer.from("fixture rejected write"),
          exitCode: command === "commit" ? 1 : 0,
        };
      },
    });
    const message = '--flag\n中文 "quote" & $()';
    await expect(call("git_commit_amend", { message })).rejects.toThrow(
      "fixture rejected write"
    );
    await call("git_stash_save", { message, includeUntracked: true });
    await call("git_stash_apply", { index: 3 });
    await call("git_stash_pop", { index: null });
    await call("git_stash_drop", { index: 2 });
    expect(captured).toEqual([
      ["commit", "--amend", "-m", message],
      ["stash", "push", "-u", "-m", message],
      ["stash", "apply", "stash@{3}"],
      ["stash", "pop", "stash@{0}"],
      ["stash", "drop", "stash@{2}"],
    ]);
    await expect(
      call("git_stash_save", { includeUntracked: "true" })
    ).rejects.toThrow("选项无效");
    await expect(call("git_commit_amend", { message: " " })).rejects.toThrow(
      "提交说明"
    );
    expect(captured).toHaveLength(5);
  });
  it("reports merge conflicts from the index rather than guessing from diagnostic wording", async () => {
    let conflicted = false;
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        const command = args[args.indexOf("-C") + 2];
        if (command === "merge")
          return {
            stdout: Buffer.from("CONFLICT-looking text"),
            stderr: Buffer.from("fixture merge failure"),
            exitCode: 1,
          };
        if (command === "ls-files")
          return {
            stdout: Buffer.from(conflicted ? "100644 fixture 1	file\0" : ""),
            stderr: Buffer.alloc(0),
            exitCode: 0,
          };
        return runCapturedProcessBytes(exe, args, options);
      },
    });
    expect(
      await call("git_merge_branch", { branchName: "codex/fixture" })
    ).toMatchObject({
      success: false,
      hasConflicts: false,
      message: expect.stringContaining("fixture merge failure"),
    });
    conflicted = true;
    expect(
      await call("git_merge_branch", { branchName: "codex/fixture" })
    ).toMatchObject({ success: false, hasConflicts: true });
  });
  it("keeps remote writes queued through window disposal and applies request-local network settings", async () => {
    let release: (() => void) | undefined;
    const captured: { args: string[]; options: any }[] = [];
    const networkOptions = vi.fn(async () => ({
      env: { HTTPS_PROXY: "http://proxy.fixture:1234" },
      gitArgs: ["-c", "http.proxy=http://proxy.fixture:1234"],
    }));
    service = new GitCommands({
      trash,
      networkOptions,
      capture: async (exe, args, options) => {
        const command = args[args.indexOf("-C") + 2];
        if (!["push", "branch"].includes(command))
          return runCapturedProcessBytes(exe, args, options);
        captured.push({ args, options });
        if (command === "push")
          await new Promise<void>((r) => {
            release = r;
          });
        return {
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          exitCode: 0,
        };
      },
    });
    const first = call("git_push");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"), {
      timeout: 10000,
    });
    const second = call("git_create_branch", { branchName: "codex/queued" });
    service.disposeOwner(1);
    const shutdown = service.shutdown();
    expect(captured).toHaveLength(1);
    expect(captured[0].options.signal.aborted).toBe(false);
    release!();
    await Promise.all([first, second, shutdown]);
    expect(captured).toHaveLength(2);
    expect(networkOptions).toHaveBeenCalledTimes(1);
    expect(captured[0].options).toMatchObject({
      timeoutMs: 30000,
      env: {
        HTTPS_PROXY: "http://proxy.fixture:1234",
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
        SSH_ASKPASS: "",
      },
    });
    expect(captured[1].options.env.HTTPS_PROXY).toBeUndefined();
    expect(captured[1].options.signal.aborted).toBe(false);
  }, 15000);
  it("hands the validated repository root to the explicit terminal action", async () => {
    const openTerminal = vi.fn(async () => {});
    service = new GitCommands({ trash, openTerminal });
    await call("git_open_terminal");
    expect(openTerminal).toHaveBeenCalledExactlyOnceWith(
      await fs.realpath(repo)
    );
  });
});

describe("Electron Git analyzer command contracts", () => {
  it("formats existing history with a literal template and an explicit count including zero", async () => {
    await existingHistory();
    const output = await call("git_format_log", {
      template: "%H%n中文 --all & $(test)",
      limit: 1,
    });
    expect(output).toBe(sourceHead + "\n中文 --all & $(test)");
    expect(await call("git_format_log", { template: "%H", limit: 0 })).toBe("");
    await expect(
      call("git_format_log", { template: "%H", limit: -1 })
    ).rejects.toThrow("分页范围");
    await expect(
      call("git_format_log", { template: "bad\0format", limit: 1 })
    ).rejects.toThrow("格式模板");
  });
  it("resolves cherry-pick/revert revisions to single commit IDs and preserves Git failures", async () => {
    await existingHistory();
    const captured: string[][] = [];
    let fail = false;
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        const command = args[args.indexOf("-C") + 2];
        if (!["cherry-pick", "revert"].includes(command))
          return runCapturedProcessBytes(exe, args, options);
        captured.push(args.slice(args.indexOf("-C") + 2));
        return {
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(fail ? "fixture conflict: resolve index" : ""),
          exitCode: fail ? 1 : 0,
        };
      },
    });
    expect(await call("git_cherry_pick", { hash: "HEAD" })).toBeTypeOf(
      "string"
    );
    expect(await call("git_revert", { hash: sourceHead })).toBeTypeOf("string");
    expect(captured).toEqual([
      ["cherry-pick", "--no-edit", sourceHead],
      ["revert", "--no-edit", sourceHead],
    ]);
    fail = true;
    await expect(call("git_revert", { hash: "HEAD" })).rejects.toThrow(
      "fixture conflict: resolve index"
    );
    await expect(call("git_cherry_pick", { hash: "--all" })).rejects.toThrow();
    expect(captured).toHaveLength(3);
  });
  it("amends a message only when the selected revision is still HEAD", async () => {
    await existingHistory();
    const parent = (await git(repo, ["rev-parse", "HEAD~1"])).toString().trim(),
      captured: string[][] = [];
    service = new GitCommands({
      trash,
      capture: async (exe, args, options) => {
        if (args[args.indexOf("-C") + 2] !== "commit")
          return runCapturedProcessBytes(exe, args, options);
        captured.push(args.slice(args.indexOf("-C") + 2));
        return {
          stdout: Buffer.alloc(0),
          stderr: Buffer.from("fixture author identity missing"),
          exitCode: 1,
        };
      },
    });
    await expect(
      call("git_update_commit_message", {
        hash: parent,
        message: "historical edit",
      })
    ).rejects.toThrow("HEAD");
    await expect(
      call("git_update_commit_message", { hash: sourceHead, message: " " })
    ).rejects.toThrow("提交说明");
    const message = '--flag\n中文 "quote" & $()';
    await expect(
      call("git_update_commit_message", { hash: sourceHead, message })
    ).rejects.toThrow("fixture author identity missing");
    expect(captured).toEqual([["commit", "--amend", "-m", message]]);
    expect((await git(repo, ["rev-parse", "HEAD"])).toString().trim()).toBe(
      sourceHead
    );
  });
});
