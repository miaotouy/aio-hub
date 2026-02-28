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
    // 性能优化：在解析 DOM 之前，先用正则快速剔除掉最沉重的 script 和 style 块
    // 这样可以极大地减少 DOMParser 的解析负担和内存占用
    const fastCleanedHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

    const doc = this.parser.parseFromString(fastCleanedHtml, "text/html");

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
    // 合并选择器以减少查询次数
    const selectors = "script, style, noscript, svg, canvas, video, audio, iframe, link, object, embed";
    doc.querySelectorAll(selectors).forEach((el) => el.remove());

    // 移除 HTML 注释
    const iterator = doc.createNodeIterator(doc.documentElement, NodeFilter.SHOW_COMMENT);
    let node;
    while ((node = iterator.nextNode())) {
      node.parentNode?.removeChild(node);
    }
  }
}
