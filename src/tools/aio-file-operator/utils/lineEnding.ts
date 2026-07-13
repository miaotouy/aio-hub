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
 * 换行符归一化工具
 * 用于处理 Windows (CRLF) 和 Unix (LF) 换行符差异
 */

/** 换行符类型 */
export type LineEnding = "CRLF" | "LF";

/** 换行符辅助工具 */
export interface LineEndingHelper {
  /** 检测到的换行符类型 */
  lineEnding: LineEnding;
  /** 将内容归一化为 LF */
  normalize: (content: string) => string;
  /** 将内容还原为原始换行符格式 */
  restore: (content: string) => string;
}

/**
 * 创建换行符辅助工具
 * @param content 原始文件内容
 */
export function createLineEndingHelper(content: string): LineEndingHelper {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length;

  const lineEnding: LineEnding = crlfCount >= lfCount ? "CRLF" : "LF";

  return {
    lineEnding,
    normalize: (text: string) => text.replace(/\r\n/g, "\n"),
    restore: (text: string) =>
      lineEnding === "CRLF" ? text.replace(/\n/g, "\r\n") : text,
  };
}
