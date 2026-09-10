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

/**
 * 模型分组名自然排序比较器
 *
 * 分组名同样可能包含版本号（如 "Gemini 3"），中文分组名按 zh-CN 排序。
 */
export function compareModelGroup(left: string, right: string): number {
  return left.localeCompare(right, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}
