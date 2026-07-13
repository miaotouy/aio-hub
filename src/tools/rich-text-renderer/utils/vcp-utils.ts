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
 * VCP 转义标记还原工具
 *
 * 用于处理 AI 为了防止误触发而添加的 EXP 后缀
 */

/**
 * 还原 VCP 转义标记
 * @param text 原始文本
 * @returns 还原后的文本
 */
export function unescapeVcpMarkers(text: string): string {
  if (!text) return text;

  return text
    .replace(/「始exp」/g, "「始」")
    .replace(/「末exp」/g, "「末」")
    .replace(/<<<\[TOOL_REQUEST_EXP\]>>>/g, "<<<[TOOL_REQUEST]>>>")
    .replace(/<<<\[END_TOOL_REQUEST_EXP\]>>>/g, "<<<[END_TOOL_REQUEST]>>>");
}
