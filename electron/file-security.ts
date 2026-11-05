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
import { filePath } from "./filesystem";

export function withinPath(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}
/** Resolve existing ancestors too, so a new target cannot escape through a junction. */
export async function canonicalPath(filename: string): Promise<string> {
  let current = filePath(filename, undefined, {});
  const suffix: string[] = [];
  for (;;) {
    try {
      return path.join(await fs.realpath(current), ...suffix.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const entry = await fs
        .lstat(current)
        .catch((failure: NodeJS.ErrnoException) => {
          if (failure.code !== "ENOENT") throw failure;
          return undefined;
        });
      if (entry?.isSymbolicLink())
        throw new Error("路径包含无法解析的符号链接");
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}
export interface AgentFileSecurity {
  allowedDirectories: string[];
  blackListRules: { path: string; type: "block" | "approve" }[];
  sandboxMode: "whitelist" | "blacklist";
  approvalGranted?: boolean;
  maxFileSize?: number;
}
export class FileSecurity {
  private config: AgentFileSecurity;
  readonly maxSize: number;
  constructor(value: unknown) {
    const config = value as AgentFileSecurity;
    if (
      !config ||
      !["whitelist", "blacklist"].includes(config.sandboxMode) ||
      !Array.isArray(config.allowedDirectories) ||
      !Array.isArray(config.blackListRules) ||
      (config.approvalGranted !== undefined &&
        typeof config.approvalGranted !== "boolean")
    )
      throw new TypeError("文件安全配置无效");
    this.maxSize = config.maxFileSize ?? 10 * 1024 * 1024;
    if (!Number.isSafeInteger(this.maxSize) || this.maxSize < 0)
      throw new TypeError("文件大小限制无效");
    this.config = config;
  }
  ensureSize(size: number) {
    if (size > this.maxSize)
      throw new Error("文件大小超过限制：" + this.maxSize + " 字节");
  }
  async needsApproval(filename: string): Promise<boolean> {
    const resolved = await canonicalPath(filename);
    if (this.config.sandboxMode === "whitelist") {
      let allowed = false;
      for (const directory of this.config.allowedDirectories) {
        try {
          allowed ||= withinPath(resolved, await canonicalPath(directory));
        } catch {
          /* Legacy relative or unresolvable grants do not authorize a path. */
        }
      }
      if (!allowed) throw new Error("安全沙箱拦截：路径不在白名单目录中");
    }
    let approval = false;
    for (const rule of this.config.blackListRules) {
      if (!rule || !["block", "approve"].includes(rule.type))
        throw new TypeError("文件安全规则无效");
      const root = await canonicalPath(rule.path);
      if (withinPath(resolved, root)) {
        if (rule.type === "block")
          throw new Error("安全沙箱拦截：路径属于禁止访问的死区");
        approval = true;
      }
    }
    return approval;
  }
  async ensurePath(filename: string) {
    if ((await this.needsApproval(filename)) && !this.config.approvalGranted)
      throw new Error("路径需要人工审批");
  }
  async allowsChild(filename: string): Promise<boolean> {
    try {
      await this.ensurePath(filename);
      return true;
    } catch {
      return false;
    }
  }
  async inspectTree(
    source: string,
    target?: string,
    rejectLinks = false,
    checkSize = false
  ): Promise<boolean> {
    let approval = false;
    const stack = [{ source, target }];
    while (stack.length) {
      const current = stack.pop()!;
      approval = (await this.needsApproval(current.source)) || approval;
      if (current.target)
        approval = (await this.needsApproval(current.target)) || approval;
      const stat = await fs.lstat(current.source);
      if (checkSize && stat.isFile()) this.ensureSize(stat.size);
      if (stat.isSymbolicLink()) {
        if (rejectLinks)
          throw new Error("目录流转包含符号链接，请单独处理该链接");
        continue;
      }
      if (stat.isDirectory())
        for (const name of await fs.readdir(current.source))
          stack.push({
            source: path.join(current.source, name),
            target: current.target
              ? path.join(current.target, name)
              : undefined,
          });
    }
    return approval;
  }
  async ensureDeletion(filename: string) {
    if ((await this.inspectTree(filename)) && !this.config.approvalGranted)
      throw new Error("目录中包含需要人工审批的路径，请确认后重试");
  }
  async readBytes(filename: string): Promise<Buffer> {
    await this.ensurePath(filename);
    const handle = await fs.open(filename, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("路径必须是普通文件");
      this.ensureSize(info.size);
      const chunks: Buffer[] = [];
      let size = 0;
      for (;;) {
        const chunk = Buffer.alloc(Math.min(65536, this.maxSize - size + 1));
        const { bytesRead } = await handle.read(chunk);
        if (!bytesRead) break;
        size += bytesRead;
        this.ensureSize(size);
        chunks.push(chunk.subarray(0, bytesRead));
      }
      return Buffer.concat(chunks);
    } finally {
      await handle.close();
    }
  }
}
