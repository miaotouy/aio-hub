/**
 * Stage 4: 结构转换 (Converter)
 * 职责：HTML Element -> Markdown
 */
import type { FetchFormat } from "../../types";

export class Converter {
  /**
   * 转换为目标格式
   */
  public process(element: HTMLElement, format: FetchFormat): string {
    if (format === "html") {
      return element.innerHTML;
    }

    if (format === "text") {
      return element.textContent || "";
    }

    if (format === "json") {
      return JSON.stringify({
        text: element.textContent,
        html: element.innerHTML,
      });
    }

    // 默认转换为 Markdown (简易版实现)
    return this.toMarkdown(element);
  }

  private toMarkdown(element: HTMLElement): string {
    let md = "";

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        md += node.textContent;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      // 性能与质量优化：跳过空元素或无意义的容器
      if (["a", "span", "div", "p"].includes(tag)) {
        // 增加对 SVG 的特殊处理：如果只有 SVG 且没有文字，通常是装饰性图标，直接跳过
        const hasText = !!el.textContent?.trim();
        const hasMedia = !!el.querySelector("img, video, canvas");
        if (!hasText && !hasMedia) return;
      }

      // 防止链接嵌套链接（Markdown 渲染器的噩梦）
      if (tag === "a" && el.querySelector("a")) {
        // 如果内部还有链接，只处理内部内容，不作为链接处理
        for (let i = 0; i < el.childNodes.length; i++) {
          walk(el.childNodes[i]);
        }
        return;
      }

      switch (tag) {
        case "h1":
          md += "\n# ";
          break;
        case "h2":
          md += "\n## ";
          break;
        case "h3":
          md += "\n### ";
          break;
        case "h4":
          md += "\n#### ";
          break;
        case "p":
          md += "\n\n";
          break;
        case "br":
          md += "\n";
          break;
        case "strong":
        case "b":
          md += "**";
          break;
        case "em":
        case "i":
          md += "*";
          break;
        case "ul":
          md += "\n";
          break;
        case "ol":
          md += "\n";
          break;
        case "li":
          md += "\n- ";
          break;
        case "a":
          // 只有当有 href 且不是 javascript: 时才作为链接
          const href = el.getAttribute("href");
          if (href && !href.startsWith("javascript:")) {
            md += "[";
          }
          break;
        case "img":
          const src = el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-actualsrc");
          if (src) {
            md += "![" + (el.getAttribute("alt") || "image") + "](";
          }
          break;
        case "pre":
          md += "\n```\n";
          break;
        case "code":
          if (el.parentElement?.tagName !== "PRE") md += "`";
          break;
        case "blockquote":
          md += "\n> ";
          break;
        case "hr":
          md += "\n---\n";
          break;
      }

      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }

      switch (tag) {
        case "strong":
        case "b":
          md += "**";
          break;
        case "em":
        case "i":
          md += "*";
          break;
        case "a":
          const hrefEnd = el.getAttribute("href");
          if (hrefEnd && !hrefEnd.startsWith("javascript:")) {
            md += "](" + hrefEnd + ")";
          }
          break;
        case "img":
          const srcEnd = el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-actualsrc");
          if (srcEnd) {
            md += srcEnd + ")";
          }
          break;
        case "pre":
          md += "\n```\n";
          break;
        case "code":
          if (el.parentElement?.tagName !== "PRE") md += "`";
          break;
        case "p":
          md += "\n";
          break;
      }
    };

    walk(element);
    return md.trim();
  }
}
