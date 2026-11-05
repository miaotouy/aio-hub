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

export function numberArg(
  value: unknown,
  fallback: number,
  max = 100000
): number {
  if (value === undefined || value === null) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    throw new Error("Git 分页范围无效");
  return value;
}
export async function revision(
  repo: GitRepository,
  value: unknown
): Promise<string> {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    throw new Error("需要有效的 Git 版本");
  return (
    await repo.command([
      "rev-parse",
      "--verify",
      "--end-of-options",
      value + "^{commit}",
    ])
  ).stdout
    .toString()
    .trim();
}
export async function head(repo: GitRepository) {
  const output = await repo.command(["rev-parse", "--verify", "HEAD"], true);
  if (output.exitCode !== 0) return { branch: "(no HEAD)", headCommitHash: "" };
  const branch = await repo.command(
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    true
  );
  return {
    branch: branch.exitCode === 0 ? branch.stdout.toString().trim() : "HEAD",
    headCommitHash: output.stdout.toString().trim(),
  };
}
async function refs(repo: GitRepository) {
  const output = await repo.command([
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(*objectname)",
    "refs/heads/",
    "refs/remotes/",
    "refs/tags/",
  ]);
  return output.stdout
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((s) => {
      const [name, hash, peeled] = s.split("\0");
      return { name, hash: peeled || hash };
    });
}
export async function branches(repo: GitRepository, rawNames = false) {
  const current = await head(repo);
  return (await refs(repo))
    .filter(
      (r) => !r.name.startsWith("refs/tags/") && !r.name.endsWith("/HEAD")
    )
    .map((r) => ({
      name: rawNames
        ? r.name.replace(/^refs\/(heads|remotes)\//, "")
        : r.name
            .replace(/^refs\/(heads|remotes)\//, "")
            .replace(/^origin\//, ""),
      current: r.name === "refs/heads/" + current.branch,
      remote: r.name.startsWith("refs/remotes/"),
    }));
}
export async function tags(repo: GitRepository) {
  const format =
    "%(refname:short)%00%(objectname)%00%(*objectname)%00%(objecttype)%00%(contents)%00%(taggername)%00%(taggerdate:format:%Y-%m-%d %H:%M)%00";
  const fields = (
    await repo.command(["for-each-ref", "--format=" + format, "refs/tags/"])
  ).stdout
    .toString("utf8")
    .split("\0");
  const result = [];
  for (let i = 0; i + 6 < fields.length; i += 7) {
    const [name, hash, peeled, type, message, tagger, date] = fields.slice(
      i,
      i + 7
    );
    result.push({
      name: name.replace(/^\n/, ""),
      hash: peeled || hash,
      message: type === "tag" ? message : null,
      tagger: type === "tag" ? tagger || null : null,
      date: type === "tag" ? date || null : null,
    });
  }
  return result.reverse();
}
export async function stashes(repo: GitRepository) {
  const output = await repo.command(
    ["stash", "list", "-z", "--format=%H%x00%gs"],
    true
  );
  if (output.exitCode !== 0) return [];
  const fields = output.stdout.toString("utf8").split("\0"),
    result = [];
  for (let i = 0; i + 1 < fields.length; i += 2)
    result.push({
      index: i / 2,
      name: `stash@{${i / 2}}`,
      hash: fields[i].slice(0, 7),
      message: fields[i + 1],
      date: "",
    });
  return result;
}
export async function remoteUrl(repo: GitRepository): Promise<string | null> {
  const names = (await repo.command(["remote"])).stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const name = names.includes("origin") ? "origin" : names[0];
  if (!name) return null;
  const result = await repo.command(["remote", "get-url", name], true);
  return result.exitCode === 0 ? result.stdout.toString().trim() : null;
}
export async function history(
  repo: GitRepository,
  branch: unknown,
  skip: number,
  limit: number,
  detail = false
) {
  const state = await head(repo);
  if (!state.headCommitHash) return [];
  const start =
    typeof branch === "string" && branch
      ? await resolveBranch(repo, branch)
      : state.headCommitHash;
  const output = await repo.command([
    "log",
    "-z",
    "--topo-order",
    `--skip=${skip}`,
    ...(limit ? [`--max-count=${limit}`] : []),
    "--format=%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%P",
    start,
    "--",
  ]);
  const fields = output.stdout.toString("utf8").split("\0"),
    references = await refs(repo),
    result: any[] = [];
  for (let i = 0; i + 6 < fields.length; i += 7) {
    const [hash, author, email, date, message, body, parents] = fields.slice(
      i,
      i + 7
    );
    if (!hash) continue;
    const tips = references.filter((r) => r.hash === hash);
    const item: any = {
      hash,
      author,
      email,
      date,
      message,
      full_message: body.trim() ? message + "\n\n" + body.trim() : message,
      parents: parents ? parents.split(" ") : [],
      tags: tips
        .filter((r) => r.name.startsWith("refs/tags/"))
        .map((r) => r.name.slice(10)),
      branches: tips
        .filter((r) => !r.name.startsWith("refs/tags/"))
        .map((r) =>
          r.name
            .replace(/^refs\/(heads|remotes)\//, "")
            .replace(/^origin\//, "")
        ),
      stats: null,
      files: null,
    };
    if (detail) Object.assign(item, await changes(repo, hash, item.parents));
    result.push(item);
  }
  return result;
}
export async function resolveBranch(
  repo: GitRepository,
  value: string
): Promise<string> {
  for (const prefix of [
    "refs/heads/",
    "refs/remotes/",
    "refs/remotes/origin/",
    "",
  ]) {
    const result = await repo.command(
      [
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        prefix + value + "^{commit}",
      ],
      true
    );
    if (result.exitCode === 0) return result.stdout.toString().trim();
  }
  throw new Error("无法找到所选 Git 分支");
}
export async function changes(
  repo: GitRepository,
  hash: string,
  parents: string[]
) {
  const { base, range } = diffArguments(hash, parents);
  const statusMap = new Map(
    (await filePaths(repo, hash, parents)).map((f) => [f.path, f.status])
  );
  const stats = (
    await repo.command([...base, "--numstat", "-z", ...range])
  ).stdout
    .toString("utf8")
    .split("\0");
  const files = [];
  let additions = 0,
    deletions = 0;
  for (const entry of stats) {
    if (!entry) continue;
    const first = entry.indexOf("\t"),
      second = entry.indexOf("\t", first + 1);
    if (first < 0 || second < 0) throw new Error("Git 差异统计格式无效");
    const added = Number(entry.slice(0, first)) || 0,
      deleted = Number(entry.slice(first + 1, second)) || 0,
      file = entry.slice(second + 1);
    additions += added;
    deletions += deleted;
    files.push({
      path: file,
      status: statusMap.get(file) || "M",
      additions: added,
      deletions: deleted,
    });
  }
  return { stats: { additions, deletions, files: files.length }, files };
}
export async function detail(repo: GitRepository, hash: unknown) {
  const oid = await revision(repo, hash);
  const result = await history(repo, oid, 0, 1, true);
  if (!result[0]) throw new Error("无法读取提交详情");
  return result[0];
}
export async function overview(repo: GitRepository) {
  const current = await head(repo),
    local = async (key: string) => {
      const r = await repo.command(["config", "--get", key], true);
      return r.exitCode === 0 ? r.stdout.toString().trim() : null;
    },
    global = async (key: string) => {
      const r = await repo.command(["config", "--global", "--get", key], true);
      return r.exitCode === 0 ? r.stdout.toString().trim() : null;
    };
  const remotes = [];
  for (const name of (await repo.command(["remote"])).stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)) {
    const fetch = await repo.command(["remote", "get-url", name]),
      push = await repo.command(["remote", "get-url", "--push", name]);
    remotes.push({
      name,
      fetchUrl: fetch.stdout.toString().trim(),
      pushUrl: push.stdout.toString().trim(),
    });
  }
  const branchItems = [];
  for (const b of await branches(repo, true)) {
    const u = await repo.command([
      "for-each-ref",
      "--format=%(upstream:short)",
      (b.remote ? "refs/remotes/" : "refs/heads/") + b.name,
    ]);
    branchItems.push({
      name: b.name,
      isCurrent: b.current,
      isRemote: b.remote,
      upstream: u.stdout.toString().trim() || null,
    });
  }
  const authors = current.headCommitHash
    ? (await repo.command(["shortlog", "-sne", current.headCommitHash])).stdout
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const m = /^\s*(\d+)\s+(.+) <([^>]*)>$/.exec(line);
          if (!m) throw new Error("Git 作者统计格式无效");
          return { name: m[2], email: m[3], commitCount: Number(m[1]) };
        })
    : [];
  authors.sort(
    (a, b) => b.commitCount - a.commitCount || a.name.localeCompare(b.name)
  );
  return {
    path: repo.root,
    branch: current.branch,
    headHash: current.headCommitHash,
    localUserName: await local("user.name"),
    localUserEmail: await local("user.email"),
    globalUserName: await global("user.name"),
    globalUserEmail: await global("user.email"),
    remotes,
    branches: branchItems,
    tags: await tags(repo),
    stashes: await stashes(repo),
    totalCommits: current.headCommitHash
      ? Number(
          (
            await repo.command(["rev-list", "--count", current.headCommitHash])
          ).stdout
            .toString()
            .trim()
        )
      : 0,
    topAuthors: authors.slice(0, 10),
  };
}

function diffArguments(hash: string, parents: string[]) {
  return {
    base: [
      "diff-tree",
      "--no-commit-id",
      "-r",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
    ],
    range: parents.length ? [parents[0], hash] : ["--root", hash],
  };
}
/** Lightweight path metadata; line statistics remain an explicit enrichment. */
export async function filePaths(
  repo: GitRepository,
  hash: string,
  parents: string[]
) {
  const { base, range } = diffArguments(hash, parents);
  const fields = (
    await repo.command([...base, "--name-status", "-z", ...range])
  ).stdout
    .toString("utf8")
    .split("\0");
  const files = [];
  for (let i = 0; i + 1 < fields.length; i += 2)
    files.push({
      path: fields[i + 1],
      status: fields[i],
      additions: 0,
      deletions: 0,
    });
  return files;
}
/** Keep the analyzer's most-relevant-branch heuristic for non-tip commits. */
export async function containingBranches(repo: GitRepository, hash: string) {
  const names = (
    await repo.command([
      "for-each-ref",
      "--contains=" + hash,
      "--format=%(refname)",
      "refs/heads/",
      "refs/remotes/",
    ])
  ).stdout
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((r) =>
      r.replace(/^refs\/(heads|remotes)\//, "").replace(/^origin\//, "")
    );
  if (names.length <= 2) return names;
  const main = [
    "origin/HEAD",
    "origin/master",
    "origin/main",
    "master",
    "main",
    "origin/develop",
    "origin/dev",
    "develop",
    "dev",
  ];
  const features = names.filter((n) => !main.some((p) => n.endsWith(p)));
  if (features.length) {
    const local = features.find((n) => !n.includes("/"));
    return local
      ? [local]
      : features.sort((a, b) => b.length - a.length).slice(0, 2);
  }
  for (const pattern of main.reverse()) {
    const name = names.find((n) => n.endsWith(pattern));
    if (name) return [name];
  }
  return names.slice(0, 2);
}
