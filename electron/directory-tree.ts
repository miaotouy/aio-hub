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
import { DirectoryRules } from "./directory-tree-rules";
import { setImmediate } from "node:timers/promises";
import { filePath } from "./filesystem";

export interface DirectoryTreeNode {
  name: string;
  is_dir: boolean;
  size: number;
  children: DirectoryTreeNode[];
  error: string | null;
}
interface Options {
  root: string;
  showFiles: boolean;
  showHidden: boolean;
  maxDepth: number;
  useGitignore: boolean;
  patterns: string[];
}
interface IgnoreScope {
  base: string;
  matcher: DirectoryRules;
}
interface DirectoryTask {
  filename: string;
  relative: string;
  node: DirectoryTreeNode;
  depth: number;
  scopes: IgnoreScope[];
}
function options(args: Record<string, unknown>): Options {
  if (
    typeof args.showFiles !== "boolean" ||
    typeof args.showHidden !== "boolean"
  )
    throw new Error("请指定文件与隐藏项的显示选项");
  if (!Number.isSafeInteger(args.maxDepth) || (args.maxDepth as number) < 0)
    throw new Error("目录深度需为非负整数，0 表示无限制");
  if (
    !Array.isArray(args.ignorePatterns) ||
    args.ignorePatterns.some((p) => typeof p !== "string" || p.includes("\0"))
  )
    throw new Error("过滤规则需为文本列表");
  return {
    root: filePath(args.path, undefined, {}),
    showFiles: args.showFiles,
    showHidden: args.showHidden,
    maxDepth: args.maxDepth as number,
    useGitignore: args.ignorePatterns.includes("__USE_GITIGNORE__"),
    patterns: args.ignorePatterns.filter(
      (p) => p !== "" && p !== "__USE_GITIGNORE__"
    ),
  };
}
function node(name: string, directory: boolean, size = 0): DirectoryTreeNode {
  return { name, is_dir: directory, size, children: [], error: null };
}
function isGone(error: unknown) {
  return ["ENOENT", "ENOTDIR"].includes(
    (error as NodeJS.ErrnoException).code ?? ""
  );
}
function gitDecision(
  scopes: IgnoreScope[],
  relative: string,
  directory: boolean
) {
  for (let index = scopes.length - 1; index >= 0; index--) {
    const { base, matcher } = scopes[index];
    const result = matcher.test(relative.slice(base.length), directory);
    if (result) return result;
  }
  return null;
}
async function gitignore(
  task: DirectoryTask,
  signal: AbortSignal
): Promise<IgnoreScope[]> {
  const filename = path.join(task.filename, ".gitignore");
  try {
    // A linked ignore file must not read rules from outside the selected tree.
    const info = await fs.lstat(filename);
    signal.throwIfAborted();
    if (!info.isFile() || info.isSymbolicLink()) return task.scopes;
    const content = await fs.readFile(filename, { encoding: "utf8", signal });
    return [
      ...task.scopes,
      {
        base: task.relative ? task.relative + "/" : "",
        matcher: new DirectoryRules(content.split(/\r?\n/)),
      },
    ];
  } catch (error) {
    signal.throwIfAborted();
    if (isGone(error) || (error as NodeJS.ErrnoException).code === "EACCES")
      return task.scopes;
    throw error;
  }
}

/** Async, bounded metadata reads; the result keeps the existing directory-tree wire format. */
async function generate(opts: Options, signal: AbortSignal) {
  const rootInfo = await fs.stat(opts.root);
  signal.throwIfAborted();
  if (!rootInfo.isDirectory()) throw new Error("路径不是目录: " + opts.root);
  // Explicitly selected links are allowed; descendant links remain leaf nodes.
  const root = await fs.realpath(opts.root);
  const structure = node(path.basename(opts.root) || opts.root, true);
  const stack: DirectoryTask[] = [
    { filename: root, relative: "", node: structure, depth: 0, scopes: [] },
  ];
  const directories = [structure];
  const overrides = new DirectoryRules(opts.patterns, true);
  // Rust ignore overrides interpret ! rules as a whitelist of matching files.
  const whitelist = overrides.whitelist;
  let total_dirs = 0,
    total_files = 0;
  while (stack.length) {
    signal.throwIfAborted();
    const task = stack.pop()!;
    if (opts.maxDepth > 0 && task.depth >= opts.maxDepth) continue;
    try {
      const info = await fs.lstat(task.filename);
      signal.throwIfAborted();
      if (!info.isDirectory() || info.isSymbolicLink()) {
        task.node.error = "目录已变更，请重新生成";
        continue;
      }
      const real = await fs.realpath(task.filename);
      const relative = path.relative(root, real);
      if (
        relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)
      ) {
        task.node.error = "目录链接已变更，请重新生成";
        continue;
      }
      const scopes = opts.useGitignore ? await gitignore(task, signal) : [];
      const entries = await fs.readdir(task.filename, { withFileTypes: true });
      for (let offset = 0; offset < entries.length; offset += 32) {
        signal.throwIfAborted();
        const inspected = await Promise.all(
          entries.slice(offset, offset + 32).map(async (entry) => {
            const isDirectory = entry.isDirectory() && !entry.isSymbolicLink();
            const relative =
              (task.relative ? task.relative + "/" : "") + entry.name;
            const override = overrides.test(relative, isDirectory);
            if (
              override === "ignored" ||
              (whitelist && !isDirectory && override !== "unignored")
            )
              return;
            if (override !== "unignored") {
              const decision = gitDecision(scopes, relative, isDirectory);
              if (
                decision === "ignored" ||
                (decision === null &&
                  !opts.showHidden &&
                  entry.name.startsWith("."))
              )
                return;
            }
            const filename = path.join(task.filename, entry.name);
            try {
              const stat = await fs.lstat(filename);
              signal.throwIfAborted();
              // Recheck the type after readdir to avoid descending into a replaced link.
              return {
                filename,
                relative,
                directory: stat.isDirectory() && !stat.isSymbolicLink(),
                size: stat.size,
              };
            } catch (error) {
              signal.throwIfAborted();
              if (isGone(error)) return;
              throw error;
            }
          })
        );
        for (const item of inspected) {
          if (!item) continue;
          if (item.directory) total_dirs++;
          else total_files++;
          if (!opts.showFiles && !item.directory) continue;
          const child = node(
            path.basename(item.filename),
            item.directory,
            item.directory ? 0 : item.size
          );
          task.node.children.push(child);
          if (item.directory) {
            directories.push(child);
            stack.push({
              filename: item.filename,
              relative: item.relative,
              node: child,
              depth: task.depth + 1,
              scopes,
            });
          }
        }
        await setImmediate(undefined, { signal });
      }
    } catch (error) {
      signal.throwIfAborted();
      if (task.depth === 0) throw error;
      task.node.error = error instanceof Error ? error.message : String(error);
    }
  }
  // Parents are inserted before descendants: reverse iteration computes sizes without recursion.
  for (let index = directories.length - 1; index >= 0; index--) {
    signal.throwIfAborted();
    const directory = directories[index];
    directory.size = directory.children.reduce(
      (sum, child) => sum + child.size,
      0
    );
    directory.children.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      const left = a.name.toLowerCase(),
        right = b.name.toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    });
    if (index % 128 === 0) await setImmediate(undefined, { signal });
  }
  return {
    structure,
    stats: {
      total_dirs,
      total_files,
      show_files: opts.showFiles,
      show_hidden: opts.showHidden,
      max_depth: opts.maxDepth === 0 ? "无限制" : String(opts.maxDepth),
      filter_count: opts.patterns.length,
    },
  };
}

export class DirectoryTrees {
  private readonly owners = new Map<number, Set<AbortController>>();
  async generate(owner: number, args: Record<string, unknown>) {
    const opts = options(args);
    const controller = new AbortController();
    let tasks = this.owners.get(owner);
    if (!tasks) this.owners.set(owner, (tasks = new Set()));
    tasks.add(controller);
    try {
      return await generate(opts, controller.signal);
    } finally {
      tasks.delete(controller);
      if (!tasks.size && this.owners.get(owner) === tasks)
        this.owners.delete(owner);
    }
  }
  disposeOwner(owner: number) {
    for (const controller of this.owners.get(owner) ?? [])
      controller.abort(
        Object.assign(new Error("窗口已关闭或刷新，目录扫描已取消"), {
          code: "ABORTED",
        })
      );
    this.owners.delete(owner);
  }
  disposeAll() {
    for (const owner of this.owners.keys()) this.disposeOwner(owner);
  }
}
