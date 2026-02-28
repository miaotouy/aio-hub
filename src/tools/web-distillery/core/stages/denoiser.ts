/**
 * Stage 2: 去噪 (Denoiser)
 * 职责：依据规则和启发式算法移除干扰元素
 */

import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/denoiser");

export class Denoiser {
  /**
   * 去除噪声元素
   */
  public process(doc: Document, excludeSelectors: string[] = []): void {
    // 1. 移除指定的选择器
    if (excludeSelectors.length > 0) {
      excludeSelectors.forEach((selector) => {
        try {
          doc.querySelectorAll(selector).forEach((el) => el.remove());
        } catch (e) {
          console.warn(`Invalid exclude selector: ${selector}`, e);
        }
      });
    }

    // 2. 移除常见的干扰语义标签（合并选择器以提升性能）
    // 不再默认移除 header 和 nav，因为它们可能包含核心导航
    const noisyTags = "aside, footer, form, button, select, textarea";
    doc.querySelectorAll(noisyTags).forEach((el) => el.remove());

    // 2.1 移除 B 站首页常见的导航链接堆叠（通常是文字极少但链接极多的容器）
    // 增加对更多导航类的清理，并降低文字长度阈值，只要是纯导航链接堆叠就移除
    const biliNavSelectors =
      ".left-entry, .right-entry, .channel-items__left, .channel-icons, .bili-header__bar, .bili-header__channel";
    doc.querySelectorAll(biliNavSelectors).forEach((el) => {
      // 如果链接数量很多但正文很少，基本就是导航噪声
      const linkCount = el.querySelectorAll("a").length;
      const textLen = el.textContent?.trim().length || 0;
      if (linkCount > 5 && textLen < 150) {
        el.remove();
      }
    });
    // 3. 基于 ID 和 Class 模式移除
    // 性能优化：预先编译正则表达式，避免循环内多次创建和 toLowerCase
    const noisyRegex =
      /(sidebar|nav|menu|ad-|ad_|banner|comment|related|share|social|widget|popup|modal|breadcrumb|pagination)/i;

    // 性能优化：不再遍历 span，主要噪声集中在块级容器中
    const elements = doc.querySelectorAll("div, section, aside, ul, ol");
    logger.info(`Checking ${elements.length} elements for noise patterns`);
    let removedCount = 0;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      // 性能优化：先检查 id，再检查 className
      const id = el.id;
      const className = typeof el.className === "string" ? el.className : "";

      if (noisyRegex.test(id) || noisyRegex.test(className)) {
        // 如果文本密度很低，则确认为噪声
        // 性能优化：textContent 会触发重排，尽量减少调用
        const textLen = el.textContent?.trim().length || 0;
        // 噪声容器通常包含很多链接但正文字数较少
        if (textLen < 200) {
          // 特殊处理：如果是 B 站这种带图的列表，即使文字少也可能是核心内容
          // 检查是否包含图片、SVG 图标或视频/Canvas 等多媒体内容
          const hasVisualContent = el.querySelector("img, svg, picture, video, canvas, iframe");
          if (!hasVisualContent) {
            el.remove();
            removedCount++;
          }
        }
      }
    }

    logger.info(`Removed ${removedCount} noisy elements based on patterns`);

    // 4. 移除隐藏元素 - 性能优化：只检查特定的容器
    const hiddenSelectors = '[style*="display: none"], [style*="visibility: hidden"], [hidden]';
    const hiddenElements = doc.querySelectorAll(hiddenSelectors);
    logger.info(`Removing ${hiddenElements.length} hidden elements`);
    hiddenElements.forEach((el) => el.remove());
  }
}
