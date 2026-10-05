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
 * 静态危险特征检测（红线 6）
 *
 * 语义与 mmcode「danger-marker 命令不送决策模型」一致：
 * 命中任一特征的请求直接跳过仲裁转人工，不消耗 JEV。
 * 注意：这里只做「转人工」，不做拒绝（拒绝仍是安全策略死区的职责），
 * 因此允许一定误报，宁可多转人工。
 */

import type { ParsedToolRequest } from "@/tools/tool-calling/types";

export interface DangerFeature {
  id: string;
  label: string;
  pattern: RegExp;
  /** 限定检测的参数键（可正则），undefined 表示全部参数值。 */
  argFilter?: RegExp;
}

const PRIVILEGE_PATTERNS: RegExp[] = [
  /\bsudo\b/i,
  /\brunas\b/i,
  /\bStart-Process\b[^\n]*-Verb\s+RunAs/i,
  /\bdoas\b/i,
  /\bsu\s+-/i,
  /\belevation\b[^\n]*admin/i,
  /管理员身份|权限提升/,
];

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/i,
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f/i,
  /Remove-Item\b[^\n]*-Recurse/i,
  /\brd\s+\/s\b/i,
  /\bdel\s+\/[sq]/i,
  /\bformat\b\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdiskpart\b/i,
  /\bdd\s+if=/i,
  /\bshred\b/i,
  /\bgit\s+reset\b[^\n]*--hard\b/i,
  /\bdrop\s+(?:table|database)\b/i,
  /\btruncate\s+table\b/i,
];

const SYSTEM_SCOPE_PATTERNS: RegExp[] = [
  /(?:^|[\s"'=])(?:[A-Za-z]:\\?\/?Windows\\|C:\/Windows\b)/i,
  /(?:^|[\s"'=])C:\\?\/?Program Files/i,
  /(?:^|[\s"'=])\/etc\/(?:passwd|shadow|sudoers)/i,
  /(?:^|[\s"'=])~?\/?\.ssh\/(?:id_|authorized_keys)/,
  /(?:^|[\s"'=])\/(?:usr|bin|sbin|boot)\//i,
  /\bregedit\b/i,
  /\bicacls\b/i,
  /\battrib\b[^\n]*-?[sh]/i,
  /\bchmod\s+(?:777|[67][67][67])\b/i,
  /\bchown\b[^\n]*root/i,
];

const NETWORK_EXPOSURE_PATTERNS: RegExp[] = [
  /\bnetsh\b[\s\S]{0,80}\badvfirewall\b/i,
  /\bufw\s+disable\b/i,
  /\biptables\b[^\n]*-F\b/i,
  /0\.0\.0\.0(?:\/0)?\b/,
  /\bnc\s+-l\b/i,
  /\b--privileged\b/i,
  /\bset\s+allprofiles\s+state\s+off\b/i,
];

/** 内嵌脚本入口特征：node -e / python -c / sh -c / bash -c / powershell -Command 等。 */
export const INLINE_SCRIPT_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "node -e", pattern: /\bnode\s+(?:--[\w-]+\s+)*-(?:e|p|eval)\b/i },
  { label: "python -c", pattern: /\bpython3?\s+(?:--[\w-]+\s+)*-c\b/i },
  { label: "sh/bash -c", pattern: /\b(?:ba|z|da|fi)?sh\s+-c\b/i },
  { label: "powershell -Command", pattern: /\bpowershell(?:\.exe)?\s+(?:-[^\s]+\s+)*-(?:Command|EncodedCommand)\b/i },
  { label: "perl -e", pattern: /\bperl\s+-e\b/i },
  { label: "ruby -e", pattern: /\bruby\s+-e\b/i },
];

/** 脚本正文中的危险调用（叠加在入口特征之上）。 */
const SCRIPT_DANGER_PATTERNS: RegExp[] = [
  /child_process/i,
  /\beval\s*\(/i,
  /(?:fetch|curl|wget|Invoke-WebRequest|Invoke-Expression|iex)\b/i,
  /require\s*\(\s*["'](fs|child_process|os)["']\s*\)/i,
  /process\s*\.\s*(?:exit|kill)/i,
  /(?:rm|del)\s+-?[rf]/i,
  /\bexec(?:Sync)?\s*\(/i,
  /\bspawn\s*\(/i,
  /\bwriteFile(?:Sync)?\s*\(/i,
  /\bunlink(?:Sync)?\s*\(/i,
];

function extractScriptBodies(text: string): string[] {
  const bodies: string[] = [];
  // 常见引号包裹形式：node -e "script" / 'script'
  const quoted =
    /(?:node\s+-(?:e|p|eval)|python3?\s+-c|(?:ba|z|da|fi)?sh\s+-c|powershell(?:\.exe)?\s+-(?:Command|EncodedCommand))\s+(['"])([\s\S]{0,4000}?)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = quoted.exec(text)) !== null) {
    bodies.push(match[2]);
  }
  return bodies;
}

/** 从 args 中提取所有字符串值并拼接为待检测文本。 */
function flattenArgsText(args: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 3 || value === null || value === undefined) return;
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.values(value).forEach((item) => walk(item, depth + 1));
    }
  };
  Object.values(args ?? {}).forEach((value) => walk(value, 0));
  return parts.join("\n");
}

export interface DangerFeatureReport {
  /** 命中特征 ID 列表（空数组表示未命中）。 */
  features: string[];
}

/**
 * 检测工具请求中的静态危险特征。
 * 检测范围：toolName / methodName / 全部参数值 / 内嵌脚本正文。
 */
export function detectDangerFeatures(
  request: ParsedToolRequest
): DangerFeatureReport {
  const features: string[] = [];
  const text = [
    request.toolName ?? "",
    request.toolId ?? "",
    request.methodName ?? "",
    flattenArgsText(request.args as Record<string, unknown>),
  ].join("\n");

  const hitOnce = (patterns: RegExp[], id: string) => {
    if (patterns.some((p) => p.test(text))) {
      features.push(id);
    }
  };

  hitOnce(PRIVILEGE_PATTERNS, "privilege-escalation");
  hitOnce(DESTRUCTIVE_PATTERNS, "destructive-command");
  hitOnce(SYSTEM_SCOPE_PATTERNS, "system-scope-path");
  hitOnce(NETWORK_EXPOSURE_PATTERNS, "network-exposure");

  // 内嵌脚本：入口特征 + 正文危险调用叠加判定
  const scriptBodies = extractScriptBodies(text);
  for (const body of scriptBodies) {
    if (SCRIPT_DANGER_PATTERNS.some((p) => p.test(body))) {
      features.push("dangerous-inline-script");
      break;
    }
  }

  return { features };
}
