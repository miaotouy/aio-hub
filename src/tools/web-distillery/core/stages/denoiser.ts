/**
 * Stage 2: 去噪 (Denoiser)
 * 职责：依据规则和启发式算法移除干扰元素
 */

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

    // 2. 移除常见的干扰语义标签
    const noisyTags = ["nav", "header", "footer", "aside", "form", "button"];
    noisyTags.forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });

    // 3. 基于 ID 和 Class 模式移除
    const noisyPatterns = [
      "sidebar",
      "nav",
      "menu",
      "ad-",
      "-ad",
      "banner",
      "comment",
      "related",
      "share",
      "social",
      "widget",
      "popup",
      "modal",
    ];

    const elements = doc.querySelectorAll("div, section, aside, span");
    elements.forEach((el) => {
      const id = el.id.toLowerCase();
      const className = el.className.toString().toLowerCase();

      if (noisyPatterns.some((p) => id.includes(p) || className.includes(p))) {
        // 如果文本密度很低，则确认为噪声
        const textLen = el.textContent?.trim().length || 0;
        if (textLen < 100) {
          el.remove();
        }
      }
    });

    // 4. 移除隐藏元素
    doc.querySelectorAll("*").forEach((el) => {
      const element = el as HTMLElement;
      if (element.style.display === "none" || element.style.visibility === "hidden") {
        el.remove();
      }
    });
  }
}
