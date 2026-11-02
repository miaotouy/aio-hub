// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** 优先展示 Git / 钩子的失败原因，完整输出由错误处理器用于复制和日志。 */
export function summarizeGitError(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const reasons = lines.filter((line) => {
    const diagnostic = line.replace(/^remote:\s*/, "");
    return (
      (/^(?:fatal:|error:|ERROR:)/.test(diagnostic) ||
        diagnostic.includes("Permission denied") ||
        /^!\s+\[(?:remote )?rejected\]/.test(diagnostic)) &&
      !diagnostic.startsWith("error: failed to push some refs")
    );
  });
  const details = reasons.length
    ? [...reasons, ...lines.filter((line) => line.startsWith("hint:"))]
    : lines.filter((line) => !line.startsWith("warning:"));
  return details.length
    ? [...new Set(details)].slice(0, 6).join("\n")
    : message;
}
