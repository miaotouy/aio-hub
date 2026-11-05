// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

export function parseRegexString(regexString: string): {
  pattern: string;
  flags: string;
} {
  if (!regexString) {
    return { pattern: "", flags: "gm" };
  }

  // 尝试匹配 /pattern/flags 格式
  const regexMatch = regexString.match(/^\/(.*)\/([gimsuy]*)$/s);
  if (regexMatch) {
    const pattern = regexMatch[1]; // 获取捕获组 1
    const flags = regexMatch[2] || ""; // 获取捕获组 2
    return { pattern, flags: flags || "gm" };
  }

  // 如果不是 /pattern/flags 格式，当作纯模式处理
  return { pattern: regexString, flags: "gm" };
}
