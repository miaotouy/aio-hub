/**
 * CSS 作用域处理工具
 */

/**
 * 为 CSS 选择器添加作用域前缀
 *
 * @param css 原始 CSS 文本
 * @param scopeId 作用域 ID（不带 #）
 * @returns 处理后的 CSS 文本
 */
export function scopeCss(css: string, scopeId: string): string {
  if (!css || !scopeId) return css;

  // 1. 预处理：移除所有 CSS 注释，避免干扰正则匹配
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "");

  let depth = 0;
  let inAtRule = false;
  let skipScopingForAtRule = false;
  let hasFadeInDefinition = false;

  /**
   * 改进的正则：
   * 1. 匹配花括号 { 和 }
   * 2. 匹配选择器或属性内容
   */
  let processedCss = cleanCss.replace(/([^{}]+)|[{}]/g, (m) => {
    if (m === "{") {
      depth++;
      return "{";
    }
    if (m === "}") {
      depth--;
      if (depth === 0) {
        inAtRule = false;
        skipScopingForAtRule = false;
      }
      return "}";
    }

    // 判定是否为选择器：
    // 1. 处于顶层 (depth === 0)
    // 2. 处于 @media 内部 (inAtRule && !skipScopingForAtRule) 的第一层
    // 注意：如果是 keyframes 内部 (skipScopingForAtRule 为 true)，则不加缀

    // 我们需要通过查看下一个非空字符是否为 { 来判定当前内容是否为选择器
    // 但正则回调拿不到上下文，所以我们利用 depth 来判定。
    // depth 为 0 时，内容一定是选择器。
    // depth 为 1 且 inAtRule 为 true 且 skipScopingForAtRule 为 false 时，内容是 @media 内部的选择器。

    const isSelector = depth === 0 || (depth === 1 && inAtRule && !skipScopingForAtRule);

    if (isSelector) {
      const selector = m.trim();
      if (!selector) return m;

      // 处理 @ 规则（如 @keyframes, @media）
      if (selector.startsWith("@")) {
        inAtRule = true;
        const lowerSelector = selector.toLowerCase();

        // 检查是否定义了 fadeIn 动画
        if (lowerSelector.includes("keyframes") && lowerSelector.includes("fadein")) {
          hasFadeInDefinition = true;
        }

        // keyframes 内部是百分比或 from/to，不需要加缀
        if (lowerSelector.includes("keyframes") || lowerSelector.startsWith("@font-face")) {
          skipScopingForAtRule = true;
        }

        // 返回原始 @ 规则行，不进行加缀
        return m;
      }

      // 判定是否需要加缀
      const shouldScope = (depth === 0 && !inAtRule) || (inAtRule && !skipScopingForAtRule);

      if (shouldScope) {
        return m
          .split(",")
          .map((s) => {
            let trimmed = s.trim();
            if (!trimmed) return s;

            // 如果已经是作用域 ID 开头，跳过
            if (trimmed.startsWith(`#${scopeId}`)) return trimmed;

            // 处理 :root, html, body -> 直接指向容器
            if (trimmed === ":root" || trimmed === "html" || trimmed === "body") {
              return `#${scopeId}`;
            }

            // 如果 scopeId 是 style-scope 开头，说明是 StyleNode 的隔离，
            // 我们使用相邻兄弟选择器，让样式作用于该锚点之后的元素
            if (scopeId.startsWith("style-scope")) {
              return `#${scopeId} ~ ${trimmed}, #${scopeId} ~ * ${trimmed}`;
            }

            // 对于 HtmlBlockNode 等容器场景：同时生成“合并”和“后代”形式
            return `#${scopeId}${trimmed}, #${scopeId} ${trimmed}`;
          })
          .join(", ");
      }
    }

    return m;
  });

  // 魔法注入：如果发现了 fadeIn 动画定义，但未在 CSS 中发现 animation 绑定
  // 则自动将其绑定到作用域根节点上，解决 LLM 生成代码时只写 keyframes 忘了引用的问题
  if (hasFadeInDefinition && !processedCss.includes("animation:")) {
    if (scopeId.startsWith("style-scope")) {
      // StyleNode 场景：作用于后续兄弟节点
      processedCss += `\n#${scopeId} ~ * { animation: fadeIn 0.8s ease-out both; }`;
    } else {
      // HtmlBlockNode 场景：作用于容器本身
      processedCss += `\n#${scopeId} { animation: fadeIn 0.8s ease-out both; }`;
    }
  }

  return processedCss;
}

/**
 * 从 HTML 字符串中提取并处理所有 style 标签
 */
export function processHtmlStyles(html: string, scopeId: string): string {
  if (!html.includes("<style")) return html;

  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  return html.replace(styleRegex, (match, css: string) => {
    // 保留 style 标签的属性（如 type="text/css"）
    const tagMatch = match.match(/<style([^>]*)>/i);
    const attrs = tagMatch ? tagMatch[1] : "";
    const scopedCss = scopeCss(css, scopeId);
    return `<style${attrs}>${scopedCss}</style>`;
  });
}

/**
 * 生成一个简单的唯一 ID
 */
export function generateSimpleId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
