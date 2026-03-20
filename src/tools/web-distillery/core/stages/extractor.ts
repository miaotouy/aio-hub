/**
 * 环节：正文提取 (Extractor)
 * 职责：确定核心正文节点，提取元数据
 */
import { ScrapedMetadata } from "../../types";
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
  public process(doc: Document, targetSelectors: string[] = [], scrapedMetadata?: ScrapedMetadata): ExtractedData {
    let mainElement: HTMLElement | null = null;
    let title = doc.title;

    // 1. 如果指定了选择器，收集所有匹配元素并合并到一个容器中
    if (targetSelectors.length > 0) {
      const container = doc.createElement("div");
      let foundAny = false;

      for (const selector of targetSelectors) {
        try {
          const elements = doc.querySelectorAll(selector);
          elements.forEach((el) => {
            // 克隆节点以避免从原 DOM 中移除
            container.appendChild(el.cloneNode(true));
            foundAny = true;
          });
        } catch (e) {
          // 无效选择器，跳过
        }
      }

      if (foundAny) {
        mainElement = container;
      }
    }

    // 2. 如果选择器没匹配到任何内容，使用 Readability
    if (!mainElement) {
      const readability = new Readability(doc);
      const result = readability.parse();
      if (result) {
        title = result.title;
        const container = doc.createElement("div");
        container.innerHTML = result.content;
        mainElement = container;
      }
    }

    // 3. 兜底：使用 body
    if (!mainElement) {
      mainElement = doc.body;
    }

    // 4. 合并元数据
    const metadata = this.extractMetadata(doc);

    // 数据源优先级：ScrapedMetadata (脚本) > Extractor (DOM/Meta)
    if (scrapedMetadata) {
      if (scrapedMetadata.title) title = scrapedMetadata.title;
      if (scrapedMetadata.description) metadata.description = scrapedMetadata.description;
      if (scrapedMetadata.author) metadata.author = scrapedMetadata.author;
      if (scrapedMetadata.publishDate) metadata.publishDate = scrapedMetadata.publishDate;

      // 正文兜底：如果 DOM 提取的正文为空或过短
      const domContentLen = mainElement.textContent?.trim().length || 0;
      if (domContentLen < 100) {
        // 1. 优先尝试使用脚本提取的 content
        if (scrapedMetadata.content) {
          const container = doc.createElement("div");
          container.innerHTML = scrapedMetadata.content;
          mainElement = container;
        }
        // 2. 如果脚本没有 content 但有较长的 description，回退到 description
        else if (scrapedMetadata.description && scrapedMetadata.description.length > domContentLen) {
          const container = doc.createElement("div");
          // 清洗 description 中的 HTML 标签后包装成段落
          const cleanDesc = scrapedMetadata.description.replace(/<[^>]*>/g, "").trim();
          container.innerHTML = `<p>${cleanDesc}</p>`;
          mainElement = container;
        }
      }
    }

    return {
      title,
      mainElement,
      metadata,
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
