// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import path from "node:path";
import { applicationPath } from "./application-path";
import type { AgentFileSecurity } from "./file-security";
import { DEFAULT_MAX_FILE_SIZE } from "../src/tools/aio-file-operator/security-defaults";

const MAX_POLICY_BYTES = 1024 * 1024;
export type ContextFilePolicy = Omit<AgentFileSecurity, "approvalGranted">;
/** Reads the existing persisted policy on every access; never repairs or rewrites bad storage. */
export class ContextFilePolicyReader {
  constructor(
    private root: string,
    private getDefaultDirectories: () => Promise<string[]>
  ) {}
  async load(): Promise<ContextFilePolicy> {
    const relative = "aio-file-operator/config.json";
    const target = await applicationPath(this.root, relative);
    let loaded: Record<string, unknown> = {};
    let file;
    try {
      file = await fs.open(target, "r");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (file) {
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > MAX_POLICY_BYTES)
          throw new Error("文件安全配置需为 1 MiB 内的普通文件");
        // Bound reads as well as stat: a concurrent writer may grow the opened file.
        const buffer = Buffer.alloc(MAX_POLICY_BYTES + 1);
        let bytes = 0;
        while (bytes < buffer.length) {
          const read = await file.read(
            buffer,
            bytes,
            buffer.length - bytes,
            null
          );
          if (!read.bytesRead) break;
          bytes += read.bytesRead;
        }
        if (bytes > MAX_POLICY_BYTES)
          throw new Error("文件安全配置超过大小限制");
        const parsed: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            buffer.subarray(0, bytes)
          )
        );
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("文件安全配置格式无效");
        loaded = parsed as Record<string, unknown>;
        await applicationPath(this.root, relative);
      } finally {
        await file.close();
      }
    }
    const mode =
      loaded.sandboxMode === undefined ? "whitelist" : loaded.sandboxMode;
    if (mode !== "whitelist" && mode !== "blacklist")
      throw new Error("文件沙箱模式无效");
    const size =
      loaded.maxFileSize === undefined
        ? DEFAULT_MAX_FILE_SIZE
        : loaded.maxFileSize;
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)
      throw new Error("文件大小限制无效");
    const defaults =
      loaded.allowedDirectories === undefined
        ? await this.getDefaultDirectories()
        : [];
    const directories =
      loaded.allowedDirectories === undefined
        ? defaults
        : loaded.allowedDirectories;
    const validPath = (value: unknown): value is string =>
      typeof value === "string" &&
      !!value &&
      !value.includes("\0") &&
      path.isAbsolute(value);
    if (
      !Array.isArray(directories) ||
      directories.length > 4096 ||
      !directories.every(validPath)
    )
      throw new Error("文件白名单目录无效");
    const rules =
      loaded.blackListRules === undefined ? [] : loaded.blackListRules;
    if (!Array.isArray(rules) || rules.length > 4096)
      throw new Error("文件访问规则无效");
    const blackListRules = rules.map((rule) => {
      if (
        !rule ||
        typeof rule !== "object" ||
        !validPath(rule.path) ||
        !["block", "approve"].includes(rule.type)
      )
        throw new Error("文件访问规则无效");
      return {
        path: rule.path as string,
        type: rule.type as "block" | "approve",
      };
    });
    const workspace = await applicationPath(this.root, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    await applicationPath(this.root, "workspace");
    const key = (value: string) =>
      process.platform === "win32"
        ? path.resolve(value).toLowerCase()
        : path.resolve(value);
    const workKey = key(workspace);
    // Matches the file tool: the application-owned workspace remains available in whitelist mode.
    const allowedDirectories = [
      ...new Map(
        directories
          .filter((value) => key(value) !== workKey)
          .map((value) => [key(value), value])
      ).values(),
      workspace,
    ];
    return {
      allowedDirectories,
      blackListRules,
      sandboxMode: mode,
      maxFileSize: size,
    };
  }
}
