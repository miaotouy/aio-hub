/**
 * 模型 ID 工具函数
 */

/**
 * 模型 ID 自然排序比较器
 *
 * 使用数字感知的本地化比较，避免纯字典序导致的版本错乱，
 * 例如 "gemini-3.7-flash" 会排在 "gemini-3.5-flash" 之后，
 * 而 "gemini-3.10-flash" 会排在 "gemini-3.7-flash" 之后。
 */
export function compareModelId(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
