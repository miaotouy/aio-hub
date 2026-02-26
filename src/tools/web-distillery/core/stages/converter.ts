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
          md += "[";
          break;
        case "img":
          md += "![" + (el.getAttribute("alt") || "image") + "](";
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
          md += "](" + (el.getAttribute("href") || "#") + ")";
          break;
        case "img":
          md += el.getAttribute("src") + ")";
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
