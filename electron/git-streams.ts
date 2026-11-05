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

import type { GitRepository } from "./git-files";
import {
  branches,
  changes,
  containingBranches,
  detail,
  filePaths,
  head,
  history,
  numberArg,
  resolveBranch,
} from "./git-history";

type Emit = (payload: Record<string, unknown>) => void;
type Args = Record<string, unknown>;
function flag(args: Args, name: string, fallback = false): boolean {
  const value = args[name];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error("Git 加载选项无效");
  return value;
}
/** Fixed-size subprocess pages keep memory bounded while preserving topological order. */
export async function streamHistory(
  repo: GitRepository,
  args: Args,
  incremental: boolean,
  emit: Emit
) {
  const limit = numberArg(args.limit, 100, Number.MAX_SAFE_INTEGER);
  const skip = incremental
    ? numberArg(args.skip, 0, Number.MAX_SAFE_INTEGER)
    : 0;
  const batchSize = numberArg(args.batchSize, 200, 10000);
  const includeFiles = flag(args, "includeFiles"),
    includeStats = flag(args, "includeLineStats"),
    infer = flag(args, "includeBranchInference");
  const items = incremental ? [] : await branches(repo);
  if (
    args.branch !== undefined &&
    args.branch !== null &&
    typeof args.branch !== "string"
  )
    throw new Error("Git 分支无效");
  const branch = incremental
    ? args.branch
    : (items.find((b) => b.name === args.branch)?.name ??
      items.find((b) => b.current)?.name ??
      null);
  emit({
    type: "start",
    total: limit ? skip + limit : 0,
    branches: items,
    branch,
  });
  const current = await head(repo);
  // Pin the commit once: concurrent ref updates cannot shift page boundaries.
  const start = branch
    ? await resolveBranch(repo, branch as string)
    : current.headCommitHash;
  let count = 0;
  let batch: any[] = [];
  while (start && (limit === 0 || count < limit)) {
    repo.check();
    const pageLimit = limit ? Math.min(200, limit - count) : 200;
    const page = await history(repo, start, skip + count, pageLimit);
    for (const commit of page) {
      repo.check();
      if (includeStats)
        Object.assign(commit, await changes(repo, commit.hash, commit.parents));
      else if (includeFiles)
        commit.files = await filePaths(repo, commit.hash, commit.parents);
      if (infer && commit.branches.length === 0)
        commit.branches = await containingBranches(repo, commit.hash);
      repo.check();
      batch.push(commit);
      count++;
      if (batchSize > 0 && batch.length >= batchSize) {
        emit({ type: "data", commits: batch, loaded: skip + count });
        batch = [];
      }
    }
    if (page.length < pageLimit) break;
  }
  repo.check();
  if (batch.length)
    emit({ type: "data", commits: batch, loaded: skip + count });
  emit({ type: "meta", total: skip + count });
}
export async function streamEnrichment(
  repo: GitRepository,
  args: Args,
  emit: Emit
) {
  if (
    !Array.isArray(args.hashes) ||
    args.hashes.length > 100000 ||
    args.hashes.some(
      (h) => typeof h !== "string" || !/^[0-9a-f]{4,64}$/i.test(h)
    )
  )
    throw new Error("Git 提交列表无效");
  const hashes = args.hashes as string[];
  const batchSize = Math.max(1, numberArg(args.batchSize, 50, 10000));
  const includeStats = flag(args, "includeStats", true),
    includeFiles = flag(args, "includeFiles", true),
    includeBranches = flag(args, "includeBranches");
  emit({ type: "start", total: hashes.length });
  let progress = 0,
    batch: any[] = [];
  for (const hash of hashes) {
    repo.check();
    // Detail validates each object and computes a first-parent diff only when requested.
    const commit =
      includeStats || includeFiles
        ? await detail(repo, hash)
        : (await history(repo, hash, 0, 1))[0];
    if (!commit) throw new Error("无法读取 Git 提交");
    const item = {
      hash: commit.hash,
      stats: includeStats ? commit.stats : null,
      files: includeFiles ? commit.files : null,
      branches: includeBranches
        ? await containingBranches(repo, commit.hash)
        : null,
    };
    repo.check();
    batch.push(item);
    progress++;
    if (batch.length >= batchSize) {
      emit({ type: "data", enriched: batch, progress });
      batch = [];
    }
  }
  repo.check();
  if (batch.length) emit({ type: "data", enriched: batch, progress });
}
