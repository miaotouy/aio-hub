/**
 * Stage 1: 预处理 (Preprocessor)
 * 职责：DOM 解析、基础清理、编码处理
 */

export interface PreprocessedData {
  doc: Document;
  originalUrl: string;
}

export class Preprocessor {
  private parser: DOMParser;

  constructor() {
    this.parser = new DOMParser();
  }

  /**
   * 将 HTML 字符串转换为 Document 对象
   */
  public process(html: string, url: string): PreprocessedData {
    const doc = this.parser.parseFromString(html, "text/html");

    // 注入 <base> 标签以便处理相对路径
    if (!doc.querySelector("base")) {
      const base = doc.createElement("base");
      base.href = url;
      doc.head.appendChild(base);
    }

    // 移除绝对无用的标签
    this.basicClean(doc);

    return {
      doc,
      originalUrl: url,
    };
  }

  private basicClean(doc: Document) {
    const selectors = ["script", "style", "noscript", "svg", "canvas", "video", "audio", "iframe"];
    selectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // 移除 HTML 注释
    const iterator = doc.createNodeIterator(doc.documentElement, NodeFilter.SHOW_COMMENT);
    let node;
    while ((node = iterator.nextNode())) {
      node.parentNode?.removeChild(node);
    }
  }
}
