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
import {
  runCapturedProcessBytes,
  type BinaryProcessOutput,
  type CapturedBinaryProcess,
} from "./process-runner";
import {
  fileDiff,
  previewBinary,
  relativeFile,
  worktreeFile,
  worktreeBinary,
  type GitRepository,
} from "./git-files";
import {
  branches,
  detail,
  head,
  history,
  numberArg,
  overview,
  remoteUrl,
  stashes,
  tags,
} from "./git-history";

import { streamHistory, streamEnrichment } from "./git-streams";

import { gitMutationCommands, mutateGit } from "./git-mutations";
import { exportCommits } from "./git-export";
import type { GitNetworkOptions } from "./git-network";

interface Operation {
  owner: number;
  stream?: "load" | "enrich";
  silent?: boolean;
  write: boolean;
  controller: AbortController;
  promise: Promise<unknown>;
}
interface Host {
  trash(file: string): Promise<void>;
  capture?: CapturedBinaryProcess;
  networkOptions?: () => Promise<GitNetworkOptions>;
  openTerminal?: (root: string) => Promise<void>;
  emit?: (owner: number, event: string, payload: unknown) => unknown;
}
const writes = new Set([
  "git_stage_files",
  "git_unstage_files",
  "git_discard_files",
  "git_commit",
  ...gitMutationCommands,
]);
/** Renderer-owned reads are cancellable; accepted repository writes serialize and drain on exit. */
export class GitCommands {
  private active = new Set<Operation>();
  private queues = new Map<string, Promise<unknown>>();
  private closing = false;
  private streams = new Map<string, Operation>();
  private capture: CapturedBinaryProcess;
  constructor(private readonly host: Host) {
    this.capture = host.capture ?? runCapturedProcessBytes;
  }
  get hasPendingOperations() {
    return this.active.size > 0;
  }
  private check(operation: Operation) {
    if (operation.controller.signal.aborted) throw new Error("Git 操作已取消");
  }
  private async open(
    rootArg: unknown,
    operation: Operation
  ): Promise<GitRepository> {
    if (
      typeof rootArg !== "string" ||
      !rootArg ||
      rootArg.includes("\0") ||
      !path.isAbsolute(rootArg)
    )
      throw new Error("仓库路径必须是有效的绝对路径");
    const requested = await fs.realpath(rootArg);
    const command = async (
      args: string[],
      allowFailure = false,
      maxOutputBytes = 16 * 1024 ** 2,
      network = false
    ): Promise<BinaryProcessOutput> => {
      this.check(operation);
      const networkOptions = network
        ? ((await this.host.networkOptions?.()) ?? {})
        : {};
      this.check(operation);
      const result = await this.capture(
        "git",
        [
          "--literal-pathspecs",
          "-c",
          "core.quotepath=false",
          "-c",
          "core.fsmonitor=false",
          "-c",
          "core.pager=cat",
          ...(networkOptions.gitArgs ?? []),
          "-C",
          requested,
          ...args,
        ],
        {
          timeoutMs: network ? 30000 : 120000,
          maxOutputBytes,
          signal: operation.controller.signal,
          env: {
            GIT_TERMINAL_PROMPT: "0",
            GCM_INTERACTIVE: "Never",
            GIT_ASKPASS: "",
            SSH_ASKPASS: "",
            SSH_ASKPASS_REQUIRE: "never",
            ...networkOptions.env,
            LC_ALL: "C",
            GIT_OPTIONAL_LOCKS: "0",
          },
        }
      );
      this.check(operation);
      if (result.exitCode !== 0 && !allowFailure)
        throw new Error(
          `Git 操作失败：${result.stderr.toString("utf8").trim() || result.stdout.toString("utf8").trim() || `退出码 ${result.exitCode}`}`
        );
      return result;
    };
    const top = await command(["rev-parse", "--show-toplevel"]);
    const root = await fs.realpath(top.stdout.toString("utf8").trim());
    const gitDirectory = await fs.realpath(
      (await command(["rev-parse", "--absolute-git-dir"])).stdout
        .toString("utf8")
        .trim()
    );
    // All relative filenames must be interpreted from the same worktree root as validation.
    if (root !== requested) throw new Error("请选择 Git 仓库根目录");
    return {
      root,
      gitDirectory,
      command,
      remoteCommand: (args) => command(args, false, undefined, true),
      check: () => this.check(operation),
    };
  }
  disposeOwner(owner: number) {
    for (const task of this.active)
      if (task.owner === owner && !task.write) {
        task.silent = true;
        task.controller.abort();
        if (task.stream) {
          const key = `${owner}:${task.stream}`;
          if (this.streams.get(key) === task) this.streams.delete(key);
        }
      }
  }
  async shutdown() {
    this.closing = true;
    for (const task of this.active) if (!task.write) task.controller.abort();
    while (this.active.size)
      await Promise.allSettled([...this.active].map((t) => t.promise));
  }
  runCommand(
    owner: number,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error("应用正在退出"));
    if (name === "git_cancel_load" || name === "git_cancel_enrich")
      return this.cancelStream(
        owner,
        name === "git_cancel_load" ? "load" : "enrich"
      );
    if (
      [
        "git_load_repository_stream",
        "git_load_incremental_stream",
        "git_enrich_commits_stream",
      ].includes(name)
    )
      return this.startStream(owner, name, args);
    const operation: Operation = {
      owner,
      write: writes.has(name),
      controller: new AbortController(),
      promise: Promise.resolve(),
    };
    this.active.add(operation);
    operation.promise = Promise.resolve()
      .then(async () => {
        if (name === "git_export_commits") return exportCommits(args);
        if (name === "git_scan_repositories")
          return this.scan(args.paths, operation);
        const repo = await this.open(args.path, operation);
        const action = () => this.dispatch(repo, name, args);
        if (!operation.write) return action();
        const previous = this.queues.get(repo.root) ?? Promise.resolve();
        const current = previous.catch(() => {}).then(action);
        this.queues.set(repo.root, current);
        try {
          return await current;
        } finally {
          if (this.queues.get(repo.root) === current)
            this.queues.delete(repo.root);
        }
      })
      .finally(() => this.active.delete(operation));
    return operation.promise;
  }
  private async cancelStream(owner: number, kind: "load" | "enrich") {
    const task = this.streams.get(`${owner}:${kind}`);
    if (task) {
      task.controller.abort();
      await task.promise;
    }
    return null;
  }
  private startStream(
    owner: number,
    name: string,
    args: Record<string, unknown>
  ): Promise<null> {
    const kind = name === "git_enrich_commits_stream" ? "enrich" : "load";
    const key = `${owner}:${kind}`;
    if (this.streams.has(key))
      return Promise.reject(new Error("Git 加载正在运行，请先取消或等待完成"));
    const task: Operation = {
      owner,
      stream: kind,
      write: false,
      controller: new AbortController(),
      promise: Promise.resolve(),
    };
    const event = kind === "load" ? "git-progress" : "git-enrich-progress";
    const emit = (payload: Record<string, unknown>) => {
      if (!task.silent && this.streams.get(key) === task)
        this.host.emit?.(owner, event, payload);
    };
    this.active.add(task);
    this.streams.set(key, task);
    task.promise = Promise.resolve()
      .then(async () => {
        const repo = await this.open(args.path, task);
        if (kind === "enrich") await streamEnrichment(repo, args, emit);
        else
          await streamHistory(
            repo,
            args,
            name === "git_load_incremental_stream",
            emit
          );
        repo.check();
        emit({ type: "end" });
      })
      .catch((error) => {
        emit(
          task.controller.signal.aborted
            ? { type: "cancelled" }
            : {
                type: "error",
                message: error instanceof Error ? error.message : String(error),
              }
        );
      })
      .finally(() => {
        this.active.delete(task);
        if (this.streams.get(key) === task) this.streams.delete(key);
      });
    return Promise.resolve(null);
  }
  private async dispatch(
    repo: GitRepository,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "git_get_repo_status":
        return this.status(repo);
      case "git_get_file_diff":
        return fileDiff(
          repo,
          relativeFile(args.filePath),
          args.isStaged === true
        );
      case "git_get_commit_file_diff": {
        if (
          typeof args.hash !== "string" ||
          !args.hash.trim() ||
          args.hash.includes("\0")
        )
          throw new Error("需要有效的 Git 提交版本");
        return fileDiff(repo, relativeFile(args.filePath), false, args.hash);
      }
      case "git_read_file_preview_binary":
        return previewBinary(repo, args);
      case "git_stage_files":
        return this.mutateFiles(repo, args.files, "add");
      case "git_unstage_files":
        return this.mutateFiles(repo, args.files, "unstage");
      case "git_discard_files":
        return this.mutateFiles(repo, args.files, "discard");
      case "git_commit": {
        if (
          typeof args.message !== "string" ||
          !args.message.trim() ||
          args.message.includes("\0")
        )
          throw new Error("请填写有效的提交说明");
        await repo.command(["commit", "-m", args.message]);
        return null;
      }
      case "git_format_log": {
        if (
          typeof args.template !== "string" ||
          args.template.includes("\0") ||
          args.template.length > 16384
        )
          throw new Error(
            "日志格式模板无效，请使用有效的 Git pretty format 模板"
          );
        return (
          await repo.command([
            "log",
            "--no-decorate",
            "--no-show-signature",
            "--no-notes",
            "--pretty=format:" + args.template,
            "--max-count=" + numberArg(args.limit, 100),
            "--",
          ])
        ).stdout.toString("utf8");
      }
      case "git_get_branches":
        return branches(repo);
      case "git_get_incremental_commits":
        return history(
          repo,
          args.branch,
          numberArg(args.skip, 0),
          numberArg(args.limit, 30, 5000)
        );
      case "git_get_branch_commits":
        return history(repo, args.branch, 0, numberArg(args.limit, 30, 5000));
      case "git_get_commit_detail":
        return detail(repo, args.hash);
      case "git_get_remote_url":
        return remoteUrl(repo);
      case "git_get_tags":
        return tags(repo);
      case "git_stash_list":
        return stashes(repo);
      case "git_get_repo_overview":
        return overview(repo);
      case "git_load_repository":
        return {
          branches: await branches(repo),
          commits: await history(
            repo,
            undefined,
            0,
            numberArg(args.limit, 100, 10000)
          ),
        };
      default:
        return mutateGit(repo, name, args, this.host.openTerminal);
    }
  }
  private async scan(pathsArg: unknown, operation: Operation) {
    if (
      !Array.isArray(pathsArg) ||
      pathsArg.length > 1000 ||
      pathsArg.some(
        (p) =>
          typeof p !== "string" || !p || !path.isAbsolute(p) || p.includes("\0")
      )
    )
      throw new Error("仓库扫描需要有效的绝对路径列表");
    const repositories: { path: string; name: string }[] = [],
      invalidPaths: string[] = [],
      seen = new Set<string>();
    const queue: { path: string; depth: number }[] = [];
    let scanned = 0,
      scanLimitReached = false;
    for (const candidate of pathsArg as string[]) {
      try {
        if (!(await fs.stat(candidate)).isDirectory()) throw Error();
        queue.push({ path: candidate, depth: 0 });
      } catch {
        invalidPaths.push(candidate);
      }
    }
    let cursor = 0;
    while (cursor < queue.length) {
      this.check(operation);
      if (scanned >= 10000) {
        scanLimitReached = true;
        break;
      }
      const item = queue[cursor++];
      let real: string;
      try {
        real = await fs.realpath(item.path);
      } catch {
        continue;
      }
      if (seen.has(real)) continue;
      seen.add(real);
      scanned++;
      const marker = await fs.lstat(path.join(real, ".git")).catch(() => null);
      if (marker) {
        try {
          const repo = await this.open(real, operation);
          repositories.push({
            path: repo.root,
            name: path.basename(repo.root) || "未知仓库",
          });
          continue;
        } catch {
          this.check(operation);
        }
      }
      if (item.depth >= 4) continue;
      let entries;
      try {
        entries = await fs.readdir(real, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          [
            ".git",
            ".cache",
            "node_modules",
            "target",
            "dist",
            "build",
            ".venv",
            "venv",
          ].includes(entry.name.toLowerCase())
        )
          continue;
        if (queue.length >= 10000) {
          scanLimitReached = true;
          break;
        }
        queue.push({
          path: path.join(real, entry.name),
          depth: item.depth + 1,
        });
      }
    }
    repositories.sort((a, b) =>
      a.path.toLowerCase().localeCompare(b.path.toLowerCase())
    );
    invalidPaths.sort();
    return { repositories, invalidPaths, scanLimitReached };
  }
  private async status(repo: GitRepository) {
    const fields = (
        await repo.command([
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ])
      ).stdout
        .toString("utf8")
        .split("\0"),
      staged: any[] = [],
      unstaged: any[] = [];
    for (let i = 0; i < fields.length; i++) {
      const record = fields[i];
      if (!record) continue;
      if (record.length < 4) throw new Error("Git 状态格式无效");
      const x = record[0],
        y = record[1],
        file = record.slice(3);
      if ("RC".includes(x) || "RC".includes(y)) i++; // -z puts the destination before the original path.
      const binary = await worktreeBinary(repo, file);
      if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(x + y)) {
        unstaged.push({ path: file, status: "U", isBinary: binary });
        continue;
      }
      if (x !== " " && x !== "?" && x !== "!")
        staged.push({ path: file, status: x, isBinary: binary });
      if ((y !== " " && y !== "!") || x === "?")
        unstaged.push({
          path: file,
          status: x === "?" ? "A" : y,
          isBinary: binary,
        });
    }
    const current = await head(repo);
    let ahead = 0,
      behind = 0;
    if (current.headCommitHash) {
      const counts = await repo.command(
        ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        true
      );
      if (counts.exitCode === 0) {
        const numbers = counts.stdout
          .toString()
          .trim()
          .split(/\s+/)
          .map(Number);
        ahead = numbers[0] || 0;
        behind = numbers[1] || 0;
      }
    }
    return { ...current, staged, unstaged, ahead, behind };
  }
  private batches(repo: GitRepository, files: string[]): string[][] {
    const result: string[][] = [];
    let batch: string[] = [],
      size = 0;
    const budget = 16000 - repo.root.length * 2 - 1024;
    for (const file of files) {
      const length = file.length * 2 + 3;
      if (length > budget)
        throw new Error("文件路径过长，请缩短仓库或文件路径");
      if (size + length > budget) {
        result.push(batch);
        batch = [];
        size = 0;
      }
      batch.push(file);
      size += length;
    }
    if (batch.length) result.push(batch);
    return result;
  }
  private async mutateFiles(
    repo: GitRepository,
    filesArg: unknown,
    operation: "add" | "unstage" | "discard"
  ) {
    if (!Array.isArray(filesArg) || filesArg.length > 100000)
      throw new Error("Git 文件列表无效");
    const files = [...new Set(filesArg.map(relativeFile))];
    // Validate the entire request before performing its first write.
    for (const file of files) await worktreeFile(repo, file, false);
    const batches = this.batches(repo, files);
    if (!files.length) return null;
    if (operation === "discard") {
      const tracked: string[] = [],
        untracked: string[] = [];
      for (const file of files) {
        const index = await repo.command(["ls-files", "-z", "--", file]);
        if (index.stdout.length) {
          tracked.push(file);
          continue;
        }
        const state = (
          await repo.command([
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--",
            file,
          ])
        ).stdout
          .toString("utf8")
          .split("\0");
        if (state.some((entry) => entry === "?? " + file)) untracked.push(file);
      }
      for (const batch of this.batches(repo, tracked))
        await repo.command(["checkout-index", "--force", "--", ...batch]);
      for (const file of untracked)
        await this.host.trash(await worktreeFile(repo, file, false));
      return null;
    }
    const current = operation === "unstage" ? await head(repo) : null;
    for (const batch of batches) {
      // Recheck path ancestors after waiting for another write or running a prior batch.
      for (const file of batch) await worktreeFile(repo, file, false);
      if (operation === "add") await repo.command(["add", "--", ...batch]);
      else if (current?.headCommitHash)
        await repo.command([
          "reset",
          "-q",
          current.headCommitHash,
          "--",
          ...batch,
        ]);
      else
        await repo.command([
          "rm",
          "--cached",
          "--force",
          "--ignore-unmatch",
          "--",
          ...batch,
        ]);
    }
    return null;
  }
}
