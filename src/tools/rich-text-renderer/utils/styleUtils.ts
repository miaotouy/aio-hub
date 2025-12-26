import type { RichTextRendererStyleOptions } from "../types";

function isObject(item: any): item is object {
  return item && typeof item === "object" && !Array.isArray(item);
}

/**
 * 合并 Markdown 样式配置
 * 规则：以 globalOptions 为基础，用 overrideOptions 中已启用的分类进行覆盖。
 * 适用于 Agent 或 User 的自定义样式合并。
 *
 * @param globalOptions - 全局样式（低优先级）
 * @param overrideOptions - 覆盖样式（高优先级，如 Agent 或 User 的配置）
 * @returns 合并后的样式配置
 */
export function mergeStyleOptions(
  globalOptions?: RichTextRendererStyleOptions,
  overrideOptions?: RichTextRendererStyleOptions
): RichTextRendererStyleOptions | undefined {
  // 如果都没有，返回 undefined
  if (!globalOptions && !overrideOptions) {
    return undefined;
  }
  // 如果只有一方有，直接返回那一方的深拷贝
  if (!globalOptions) {
    return overrideOptions ? JSON.parse(JSON.stringify(overrideOptions)) : undefined;
  }
  if (!overrideOptions) {
    return globalOptions ? JSON.parse(JSON.stringify(globalOptions)) : undefined;
  }

  // 创建一个最终结果对象，从全局配置的深拷贝开始
  const mergedOptions: RichTextRendererStyleOptions = JSON.parse(JSON.stringify(globalOptions));

  // 遍历覆盖配置的每个分类（如 H1, H2, p, blockquote 等）
  for (const key in overrideOptions) {
    const categoryKey = key as keyof RichTextRendererStyleOptions;
    const overrideCategory = overrideOptions[categoryKey];

    // 检查 overrideCategory 是否是一个表示启用的对象
    if (isObject(overrideCategory) && overrideCategory.enabled) {
      // 如果覆盖配置中的这个分类是启用的，就用它覆盖全局的
      mergedOptions[categoryKey] = overrideCategory as any;
    } else if (isObject(overrideCategory) && !overrideCategory.enabled) {
      // 如果覆盖配置中显式禁用了，那就禁用它
      mergedOptions[categoryKey] = { enabled: false } as any;
    }
    // 如果 overrideCategory 是 boolean 或者不存在，我们保留 mergedOptions 中的全局设置，不做任何操作
  }

  return mergedOptions;
}