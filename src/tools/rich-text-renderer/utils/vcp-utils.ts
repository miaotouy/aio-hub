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
