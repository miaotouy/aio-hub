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
