/**
 * Stage 3: 正文提取 (Extractor)
 * 职责：确定核心正文节点，提取元数据
 */
import { Readability } from "../readability";

export interface ExtractedData {
  title: string;
  mainElement: HTMLElement;
  metadata: {
    description?: string;
    author?: string;
    publishDate?: string;
    language?: string;
  };
}

export class Extractor {
  /**
   * 提取正文和元数据
   */
  public process(doc: Document, targetSelectors: string[] = []): ExtractedData {
    let mainElement: HTMLElement | null = null;
    let title = doc.title;

    // 1. 如果指定了选择器，优先使用
    if (targetSelectors.length > 0) {
      for (const selector of targetSelectors) {
        const found = doc.querySelector(selector);
        if (found) {
          mainElement = found as HTMLElement;
          break;
        }
      }
    }

    // 2. 如果没找到，使用 Readability
    if (!mainElement) {
      const readability = new Readability(doc);
      const result = readability.parse();
      if (result) {
        title = result.title;
        // 重新查询提取出的内容（或者直接使用生成的 HTML）
        // 这里我们简单处理，直接创建一个临时容器放 result.content
        const container = doc.createElement("div");
        container.innerHTML = result.content;
        mainElement = container;
      }
    }

    // 3.兜底：使用 body
    if (!mainElement) {
      mainElement = doc.body;
    }

    return {
      title,
      mainElement,
      metadata: this.extractMetadata(doc),
    };
  }

  private extractMetadata(doc: Document) {
    const meta: any = {};

    const getMeta = (names: string[]) => {
      for (const name of names) {
        const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        if (el) return el.getAttribute("content");
      }
      return undefined;
    };

    meta.description = getMeta(["description", "og:description", "twitter:description"]);
    meta.author = getMeta(["author", "article:author", "og:site_name"]);
    meta.publishDate = getMeta(["publish_date", "article:published_time", "og:pubdate"]);
    meta.language = doc.documentElement.lang || getMeta(["language"]);

    return meta;
  }
}
