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

/**
 * 路径安全校验工具
 * 用于防止 AI 通过路径穿越、目录前缀碰撞或符号链接访问用户敏感文件
 */
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import type { AioFileOperatorConfig } from "../types";

const logger = createModuleLogger("AioFileOperator/Security");

type SecurityPolicyResult = {
  status: "allow" | "approve" | "block";
  message?: string;
};

function stripWindowsExtendedPrefix(path: string): string {
  if (/^\\\\\?\\UNC\\/i.test(path)) {
    return `\\\\${path.slice(8)}`;
  }
  if (/^\\\\\?\\/.test(path)) {
    return path.slice(4);
  }
  return path;
}

function isAbsolutePath(path: string): boolean {
  const normalized = stripWindowsExtendedPrefix(path).replace(/\\/g, "/");
  return (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    /^\/\/[^/]+\/[^/]+/.test(normalized)
  );
}

/**
 * 词法标准化路径：统一分隔符并消解 `.` / `..`。
 * 真实文件系统边界由 Rust 侧 `resolve_path_for_security` 继续解析符号链接。
 */
function normalizePath(path: string): string {
  let normalized = stripWindowsExtendedPrefix(path).replace(/\\/g, "/");
  let root = "";
  let remainder = normalized;

  const driveMatch = normalized.match(/^([A-Za-z]:)(?:\/|$)/);
  const uncMatch = normalized.match(/^\/\/([^/]+)\/([^/]+)(?:\/|$)/);

  if (driveMatch) {
    root = `${driveMatch[1]}/`;
    remainder = normalized.slice(driveMatch[0].length);
  } else if (uncMatch) {
    root = `//${uncMatch[1]}/${uncMatch[2]}`;
    remainder = normalized.slice(uncMatch[0].length);
  } else if (normalized.startsWith("/")) {
    root = "/";
    remainder = normalized.slice(1);
  }

  const parts: string[] = [];
  for (const part of remainder.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  if (root === "/") return parts.length > 0 ? `/${parts.join("/")}` : "/";
  if (root.endsWith("/")) return `${root}${parts.join("/")}`;
  if (root) return parts.length > 0 ? `${root}/${parts.join("/")}` : root;
  return parts.join("/");
}

function comparisonKey(path: string): string {
  const normalized = normalizePath(path);
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
}

/**
 * 判断目标路径是否等于根目录或位于其真实目录边界内。
 * 不能使用裸 `startsWith(root)`，否则 `C:/safe-copy` 会冒充 `C:/safe` 的子路径。
 */
export function isPathWithinRoot(
  targetPath: string,
  rootPath: string
): boolean {
  const target = comparisonKey(targetPath);
  const root = comparisonKey(rootPath);
  if (!target || !root) return false;
  if (target === root) return true;
  if (root === "/" || /^[a-z]:\/$/i.test(root)) return target.startsWith(root);
  return target.startsWith(`${root.replace(/\/+$/, "")}/`);
}

async function resolvePathForSecurity(path: string): Promise<string> {
  if (!isAbsolutePath(path)) {
    throw new Error(`安全沙箱拦截：路径必须是绝对路径（收到: "${path}"）。`);
  }

  const resolved = await invoke<unknown>("resolve_path_for_security", { path });
  // 单元测试和纯前端 mock 可能不实现该命令；真实 Tauri 命令始终返回字符串。
  return typeof resolved === "string" && resolved.length > 0
    ? normalizePath(resolved)
    : normalizePath(path);
}

/**
 * 获取用户主目录路径
 * 在 Tauri 环境下，通过 document_dir 等获取
 */
export function getUserHomeDir(): string {
  // 在 Tauri 环境下，通过环境变量获取
  // 注意：这里只是一个 fallback，实际路径由 Rust 侧提供
  return process.env.USERPROFILE || process.env.HOME || "";
}

/**
 * 校验目标路径是否在允许的目录列表中。
 * Rust 侧会解析目标及规则的最深已存在祖先，避免符号链接逃逸。
 */
export async function validatePath(
  targetPath: string,
  config: AioFileOperatorConfig
): Promise<boolean> {
  const policy = await checkSecurityPolicy(
    "validate",
    { path: targetPath },
    config
  );
  if (policy.status === "block") {
    logger.warn("路径安全校验失败", {
      targetPath,
      message: policy.message,
    });
    throw new Error(
      policy.message || `路径安全校验失败：不允许访问 "${targetPath}"。`
    );
  }
  return true;
}

/**
 * 动态安全策略校验
 */
export async function checkSecurityPolicy(
  _methodName: string,
  args: Record<string, any>,
  config: AioFileOperatorConfig
): Promise<SecurityPolicyResult> {
  const targetPath = args.path;
  if (!targetPath || typeof targetPath !== "string") {
    return { status: "allow" };
  }

  if (
    config.sandboxMode !== "whitelist" &&
    config.sandboxMode !== "blacklist"
  ) {
    return {
      status: "block",
      message: "安全沙箱配置无效：sandboxMode 必须是 whitelist 或 blacklist。",
    };
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = await resolvePathForSecurity(targetPath);
  } catch (error) {
    return {
      status: "block",
      message:
        error instanceof Error
          ? error.message
          : `安全沙箱拦截：无法解析路径 "${targetPath}"。`,
    };
  }

  // 1. 基础沙箱校验（白名单/黑名单模式）
  if (config.sandboxMode === "whitelist") {
    const allowedDirs = Array.isArray(config.allowedDirectories)
      ? config.allowedDirectories.filter(
          (dir): dir is string =>
            typeof dir === "string" && dir.trim().length > 0
        )
      : [];
    let inWhitelist = false;

    for (const dir of allowedDirs) {
      try {
        const resolvedDir = await resolvePathForSecurity(dir);
        if (isPathWithinRoot(resolvedTarget, resolvedDir)) {
          inWhitelist = true;
          break;
        }
      } catch (error) {
        logger.warn("忽略无法解析的白名单目录", { dir, error });
      }
    }

    if (!inWhitelist) {
      return {
        status: "block",
        message: `安全沙箱拦截：路径 "${targetPath}" 不在允许的白名单目录中。`,
      };
    }
  }

  // 2. 细分规则校验（黑名单规则）
  if (
    config.blackListRules !== undefined &&
    !Array.isArray(config.blackListRules)
  ) {
    return {
      status: "block",
      message: "安全沙箱配置无效：blackListRules 必须是数组。",
    };
  }
  const rules = config.blackListRules || [];
  let matchedRule: { path: string; type: "block" | "approve" } | null = null;

  for (const rule of rules) {
    if (
      !rule ||
      typeof rule.path !== "string" ||
      !rule.path.trim() ||
      (rule.type !== "block" && rule.type !== "approve")
    ) {
      return {
        status: "block",
        message: "安全沙箱配置无效：黑名单规则的 path 或 type 非法。",
      };
    }
    try {
      const resolvedRulePath = await resolvePathForSecurity(rule.path);
      if (isPathWithinRoot(resolvedTarget, resolvedRulePath)) {
        // 如果匹配了多个规则，优先应用 'block' (死区)
        if (!matchedRule || rule.type === "block") {
          matchedRule = rule;
        }
      }
    } catch (error) {
      logger.warn("忽略无法解析的黑名单规则", { rule, error });
    }
  }

  if (matchedRule) {
    if (matchedRule.type === "block") {
      return {
        status: "block",
        message: `安全沙箱拦截：路径 "${targetPath}" 属于完全禁止访问的死区（匹配规则: "${matchedRule.path}"）。`,
      };
    }
    return {
      status: "approve",
      message: `安全沙箱提示：访问路径 "${targetPath}" 属于高风险审批区，必须人工审批（匹配规则: "${matchedRule.path}"）。`,
    };
  }

  return { status: "allow" };
}

/**
 * 校验文件大小是否在限制范围内
 */
export function validateFileSize(size: number, maxSize: number): boolean {
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("文件大小无效，拒绝继续处理。");
  }
  if (!Number.isFinite(maxSize) || maxSize < 0) {
    throw new Error("文件大小限制配置无效，拒绝继续处理。");
  }
  if (size > maxSize) {
    throw new Error(
      `文件大小超过限制：${(size / 1024 / 1024).toFixed(2)}MB > ${(maxSize / 1024 / 1024).toFixed(2)}MB`
    );
  }
  return true;
}
