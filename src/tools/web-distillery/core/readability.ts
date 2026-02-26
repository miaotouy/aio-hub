/**
 * 简化版 Readability 算法实现
 * 核心逻辑：基于文本密度和节点类型评分
 */

export interface ReadabilityResult {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  dir: string;
  siteName: string;
  lang: string;
  publishedTime: string;
}

export class Readability {
  private doc: Document;
  constructor(doc: Document, _options = {}) {
    this.doc = doc;
  }

  public parse() {
    // 1. 查找标题
    const title = this.getArticleTitle();

    // 2. 预清理内容
    this.prepDocument();

    // 3. 寻找文章主体节点
    const articleContent = this.grabArticle();
    if (!articleContent) {
      return null;
    }

    return {
      title,
      content: articleContent.innerHTML,
      textContent: articleContent.textContent || "",
      length: articleContent.textContent?.length || 0,
      excerpt: this.getArticleExcerpt(articleContent),
      byline: "",
      dir: "",
      siteName: "",
      lang: this.doc.documentElement.lang || "",
      publishedTime: "",
    } as ReadabilityResult;
  }

  private prepDocument() {
    const tagsToRemove = [
      "script",
      "style",
      "noscript",
      "iframe",
      "object",
      "embed",
      "footer",
      "header",
      "aside",
      "nav",
    ];
    tagsToRemove.forEach((tag) => {
      const els = this.doc.getElementsByTagName(tag);
      for (let i = els.length - 1; i >= 0; i--) {
        els[i].parentNode?.removeChild(els[i]);
      }
    });
  }

  private grabArticle() {
    const body = this.doc.body;
    if (!body) return null;

    // 简单的评分逻辑：寻找包含最多文本的节点
    let topNode = null;
    let maxScore = -1;

    const walker = this.doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode() as HTMLElement;

    while (node) {
      const score = this.calculateNodeScore(node);
      if (score > maxScore) {
        maxScore = score;
        topNode = node;
      }
      node = walker.nextNode() as HTMLElement;
    }

    return topNode;
  }

  private calculateNodeScore(node: HTMLElement): number {
    const text = node.innerText || "";
    if (text.length < 25) return 0;

    // 基础分：基于文本长度
    let score = Math.log(text.length);

    // 基于标签的分数调整
    const tagName = node.tagName.toLowerCase();
    if (tagName === "div") score += 5;
    if (tagName === "article") score += 20;
    if (tagName === "section") score += 10;
    if (tagName === "p") score += 10;

    // 基于 class/id 的调整
    const className = node.className || "";
    const id = node.id || "";
    if (/article|content|main|body/i.test(className + id)) score += 20;
    if (/sidebar|footer|header|nav|menu|comment/i.test(className + id)) score -= 50;

    return score;
  }

  private getArticleTitle(): string {
    const h1 = this.doc.querySelector("h1");
    if (h1) return h1.textContent?.trim() || "";
    return this.doc.title || "";
  }

  private getArticleExcerpt(node: HTMLElement): string {
    const p = node.querySelector("p");
    return p?.textContent?.trim().slice(0, 150) || "";
  }
}
