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
import { lookup } from "mime-types";
import { fileTypeFromBuffer } from "file-type";
import type { BinaryProcessOutput } from "./process-runner";

export const TEXT_LIMIT = 1024 ** 2,
  SNAPSHOT_LIMIT = 64 * 1024 ** 2;
export interface GitRepository {
  root: string;
  gitDirectory: string;
  command(
    args: string[],
    allowFailure?: boolean,
    maxBytes?: number
  ): Promise<BinaryProcessOutput>;
  remoteCommand(args: string[]): Promise<BinaryProcessOutput>;
  check(): void;
}
interface Side {
  exists: boolean;
  path: string;
  previewKind: string;
  mimeType: string;
  byteSize: number;
  snapshotAvailable: boolean;
  localPath: string | null;
}
export function relativeFile(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\0") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  )
    throw new Error("需要有效的仓库相对文件路径");
  const parts = value.replaceAll("\\", "/").split("/");
  if (
    parts.some(
      (p) => !p || p === "." || p === ".." || /^\.git[ .]*$/i.test(p)
    ) ||
    (process.platform === "win32" &&
      parts.some((p) => /[:]/.test(p) || /[ .]$/.test(p)))
  )
    throw new Error("文件路径超出仓库工作区或指向 Git 元数据");
  return parts.join("/");
}
function inside(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return (
    !rel ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
/** Validate all ancestors before touching a worktree file; deleted descendants are allowed. */
export async function worktreeFile(
  repo: GitRepository,
  file: string,
  followLeaf = true
): Promise<string> {
  const normalized = relativeFile(file),
    parts = normalized.split("/");
  let current = repo.root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await fs.lstat(current).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) {
      if (i < parts.length - 1)
        throw new Error("仓库文件路径包含目录链接，请直接选择真实路径");
      if (!followLeaf) return current;
    }
    if (stat) {
      const real = await fs.realpath(current);
      if (!inside(repo.root, real) || inside(repo.gitDirectory, real))
        throw new Error("文件路径超出仓库工作区或指向 Git 元数据");
    }
  }
  repo.check();
  return current;
}
const emptySide = (file: string): Side => ({
  exists: false,
  path: file,
  previewKind: "text",
  mimeType: "text/plain",
  byteSize: 0,
  snapshotAvailable: false,
  localPath: null,
});
export function likelyText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}
async function describe(
  file: string,
  sample: Buffer,
  size: number,
  localPath: string | null
): Promise<Side> {
  const detected = await fileTypeFromBuffer(sample).catch(() => undefined);
  let mimeType = detected?.mime || lookup(file) || "application/octet-stream";
  let kind =
    mimeType.startsWith("image/") && mimeType !== "image/svg+xml"
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : mimeType.startsWith("video/")
          ? "video"
          : "binary";
  // Source extensions such as .ts can have media MIME mappings; textual content wins without a binary signature.
  if (!detected && likelyText(sample)) {
    kind = "text";
    if (!mimeType.startsWith("text/") && !/json|xml|javascript/.test(mimeType))
      mimeType = "text/plain";
  }
  return {
    exists: true,
    path: file,
    previewKind: kind,
    mimeType,
    byteSize: size,
    snapshotAvailable:
      ["image", "audio", "video"].includes(kind) &&
      (localPath !== null || size <= SNAPSHOT_LIMIT),
    localPath: ["image", "audio", "video"].includes(kind) ? localPath : null,
  };
}
export async function blobOid(
  repo: GitRepository,
  tree: string,
  file: string
): Promise<string | undefined> {
  const output =
    tree === ":"
      ? await repo.command(["ls-files", "--stage", "-z", "--", file])
      : await repo.command(["ls-tree", "-z", tree, "--", file], true);
  if (output.exitCode !== 0) return;
  for (const entry of output.stdout.toString("utf8").split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab < 0 || entry.slice(tab + 1) !== file) continue;
    const meta = entry.slice(0, tab).split(" ");
    if (tree === ":" ? meta[2] === "0" : meta[1] === "blob")
      return meta[1 + Number(tree !== ":")];
  }
}
async function blob(repo: GitRepository, oid: string): Promise<Buffer> {
  const size = Number(
    (await repo.command(["cat-file", "-s", oid])).stdout.toString().trim()
  );
  if (!Number.isSafeInteger(size) || size < 0 || size > SNAPSHOT_LIMIT)
    throw new Error("文件版本超过 64 MiB 的应用内预览上限");
  return (
    await repo.command(["cat-file", "blob", oid], false, SNAPSHOT_LIMIT + 65536)
  ).stdout;
}
async function version(
  repo: GitRepository,
  file: string,
  oid?: string,
  worktree = false,
  metadataOnly = false
): Promise<{ side: Side; bytes?: Buffer }> {
  if (worktree) {
    const full = await worktreeFile(repo, file),
      stat = await fs.stat(full).catch((e) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
    if (!stat) return { side: emptySide(file) };
    if (!stat.isFile()) throw new Error("差异预览仅支持文件");
    const handle = await fs.open(full, "r");
    let sample: Buffer;
    try {
      const bytes = Buffer.alloc(8192);
      const read = await handle.read(bytes);
      sample = bytes.subarray(0, read.bytesRead);
    } finally {
      await handle.close();
    }
    const side = await describe(file, sample, stat.size, full);
    if (side.previewKind === "text" && !metadataOnly) {
      if (stat.size > TEXT_LIMIT)
        throw new Error("文件超过 1 MiB，无法直接查看文本差异");
      const bytes = await fs.readFile(full);
      if (bytes.length > TEXT_LIMIT)
        throw new Error("文件超过 1 MiB，无法直接查看文本差异");
      return { side, bytes };
    }
    return { side };
  }
  if (!oid) return { side: emptySide(file) };
  const size = Number(
    (await repo.command(["cat-file", "-s", oid])).stdout.toString().trim()
  );
  if (size > SNAPSHOT_LIMIT) {
    const mimeType = lookup(file) || "application/octet-stream";
    const kind =
      mimeType.startsWith("image/") && mimeType !== "image/svg+xml"
        ? "image"
        : mimeType.startsWith("audio/")
          ? "audio"
          : mimeType.startsWith("video/")
            ? "video"
            : "binary";
    if (
      kind === "binary" &&
      (mimeType.startsWith("text/") || /json|xml|javascript/.test(mimeType))
    )
      throw new Error("文件超过 1 MiB，无法直接查看文本差异");
    return {
      side: {
        exists: true,
        path: file,
        previewKind: kind,
        mimeType,
        byteSize: size,
        snapshotAvailable: false,
        localPath: null,
      },
    };
  }
  const bytes = await blob(repo, oid),
    side = await describe(file, bytes.subarray(0, 8192), bytes.length, null);
  if (side.previewKind === "text" && bytes.length > TEXT_LIMIT)
    throw new Error("文件超过 1 MiB，无法直接查看文本差异");
  return { side, bytes };
}
export async function commitVersions(
  repo: GitRepository,
  hash: string,
  file: string
) {
  const commit = (
    await repo.command([
      "rev-parse",
      "--verify",
      "--end-of-options",
      hash + "^{commit}",
    ])
  ).stdout
    .toString()
    .trim();
  const parents = (
    await repo.command(["rev-list", "--parents", "-n", "1", commit])
  ).stdout
    .toString()
    .trim()
    .split(" ")
    .slice(1);
  const range = parents.length ? [parents[0], commit] : ["--root", commit];
  const entries = (
    await repo.command([
      "diff-tree",
      "--no-commit-id",
      "--no-abbrev",
      "-M",
      "-r",
      "--no-ext-diff",
      "--no-textconv",
      "--raw",
      "-z",
      ...range,
    ])
  ).stdout
    .toString("utf8")
    .split("\0");
  const versions = findVersions(entries, file);
  if (!versions) throw new Error("提交中不存在该文件变更");
  return versions;
}
function findVersions(entries: string[], file: string) {
  for (let i = 0; i < entries.length;) {
    const header = entries[i++];
    if (!header) continue;
    const fields = header.split(" "),
      oldPath = entries[i++];
    let newPath = oldPath;
    if (/^[RC]/.test(fields[4])) newPath = entries[i++];
    if (oldPath === file || newPath === file)
      return {
        original: /^0+$/.test(fields[2]) ? undefined : fields[2],
        modified: /^0+$/.test(fields[3]) ? undefined : fields[3],
        originalPath: oldPath,
        modifiedPath: newPath,
      };
  }
}
async function worktreeVersions(
  repo: GitRepository,
  file: string,
  staged: boolean
) {
  let original = await blobOid(repo, staged ? "HEAD" : ":", file);
  if (!original && !staged) original = await blobOid(repo, "HEAD", file);
  const modified = staged ? await blobOid(repo, ":", file) : undefined;
  if (staged && !original && modified) {
    const raw = await repo.command([
      "diff",
      "--cached",
      "--raw",
      "--no-abbrev",
      "-M",
      "-z",
      "--no-ext-diff",
      "--no-textconv",
    ]);
    const renamed = findVersions(raw.stdout.toString("utf8").split("\0"), file);
    if (renamed?.original) return renamed;
  }
  return { original, modified, originalPath: file, modifiedPath: file };
}
export async function fileDiff(
  repo: GitRepository,
  file: string,
  staged: boolean,
  hash?: string
) {
  const versions = hash
    ? await commitVersions(repo, hash, file)
    : await worktreeVersions(repo, file, staged);
  const original = await version(
    repo,
    versions.originalPath,
    versions.original
  );
  const modified = await version(
    repo,
    versions.modifiedPath,
    versions.modified,
    !staged && !hash
  );
  const isBinary = [original.side, modified.side].some(
    (s) => s.exists && s.previewKind !== "text"
  );
  return {
    path: file,
    original: isBinary ? "" : (original.bytes?.toString("utf8") ?? ""),
    modified: isBinary ? "" : (modified.bytes?.toString("utf8") ?? ""),
    isBinary,
    originalSide: original.side,
    modifiedSide: modified.side,
  };
}
export async function previewBinary(
  repo: GitRepository,
  args: Record<string, unknown>
): Promise<ArrayBuffer> {
  const file = relativeFile(args.filePath),
    side = args.side;
  if (side !== "original" && side !== "modified")
    throw new Error("无效的文件版本侧");
  let oid: string | undefined;
  if (typeof args.commitHash === "string" && args.commitHash.trim())
    oid = (await commitVersions(repo, args.commitHash, file))[side];
  else if (args.isStaged === true)
    oid = (await worktreeVersions(repo, file, true))[side];
  else {
    if (side === "modified")
      throw new Error("工作区文件应通过本地路径流式预览");
    oid =
      (await blobOid(repo, ":", file)) ?? (await blobOid(repo, "HEAD", file));
  }
  if (!oid) throw new Error("该版本不存在");
  const bytes = await blob(repo, oid),
    result = new ArrayBuffer(bytes.length);
  new Uint8Array(result).set(bytes);
  return result;
}
export async function worktreeBinary(
  repo: GitRepository,
  file: string
): Promise<boolean> {
  try {
    return (
      (await version(repo, file, undefined, true, true)).side.previewKind !==
      "text"
    );
  } catch (error) {
    if (String(error).includes("1 MiB")) return false;
    return false;
  }
}
