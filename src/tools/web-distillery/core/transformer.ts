/**
 * 管道入口 (Transformer)
 * 职责：按阶段编排清洗任务
 */
import { Preprocessor } from "./stages/preprocessor";
import { MetadataScraper } from "./stages/metadata-scraper";
import { Denoiser } from "./stages/denoiser";
import { Extractor } from "./stages/extractor";
import { Converter } from "./stages/converter";
import { Postprocessor } from "./stages/postprocessor";
import type { FetchResult, QuickFetchOptions, FetchFormat, SiteRecipe } from "../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/transformer");

export class Transformer {
  private preprocessor = new Preprocessor();
  private metadataScraper = new MetadataScraper();
  private denoiser = new Denoiser();
  private extractor = new Extractor();
  private converter = new Converter();
  private postprocessor = new Postprocessor();

  /**
   * 执行完整的蒸馏过程
   */
  public async transform(html: string, options: QuickFetchOptions, recipe?: SiteRecipe): Promise<FetchResult> {
    const format: FetchFormat = options.format || "markdown";
    const url = options.url;
    const startTime = performance.now();

    logger.info("Starting transformation pipeline", { url, htmlLength: html.length });

    // 检测是否为 RSS/XML 格式
    const trimmedHtml = html.trim();
    if (trimmedHtml.startsWith("<?xml") || trimmedHtml.startsWith("<rss") || trimmedHtml.startsWith("<feed")) {
      logger.info("Detected RSS/Atom feed, using native XML parser");
      return await this.processRss(trimmedHtml, url, format);
    }

    // 预处理 (Preprocessor)
    const preStart = performance.now();
    const { doc, scriptContents, rawHtml } = this.preprocessor.process(html, url);
    const preEnd = performance.now();
    logger.info(`Preprocessor finished`, { duration: `${(preEnd - preStart).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 元数据提取 (MetadataScraper)
    const metaStart = performance.now();
    const scrapedMetadata = this.metadataScraper.process(scriptContents, recipe?.metadataScrapers, doc, rawHtml);
    const metaEnd = performance.now();
    logger.info(`MetadataScraper finished`, { duration: `${(metaEnd - metaStart).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 去噪 (Denoiser)
    const denoiseStart = performance.now();
    // 排除选择器优先级：options.excludeSelectors (如果有) > recipe.excludeSelectors
    const excludeSelectors = (options as any).excludeSelectors || recipe?.excludeSelectors || [];
    this.denoiser.process(doc, excludeSelectors, recipe?.protectedSelectors);
    const denoiseEnd = performance.now();
    logger.info(`Denoiser finished`, { duration: `${(denoiseEnd - denoiseStart).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 提取 (Extractor)
    const extractStart = performance.now();
    const extractSelectors = options.extractSelectors || recipe?.extractSelectors || [];
    const { title, mainElement, metadata } = this.extractor.process(doc, extractSelectors, scrapedMetadata);
    const extractEnd = performance.now();
    logger.info(`Extractor finished`, { duration: `${(extractEnd - extractStart).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 转换 (Converter)
    const convertStart = performance.now();
    // 设置纯净模式
    this.converter.setCleanMode(options.cleanMode || false);
    const convertedContent = this.converter.process(mainElement, format);
    const convertEnd = performance.now();
    logger.info(`Converter finished`, { duration: `${(convertEnd - convertStart).toFixed(2)}ms` });

    // 后处理 (Postprocessor)
    const postStart = performance.now();
    const result = await this.postprocessor.process(convertedContent, title, url, format, metadata);

    // 注入配方信息
    if (recipe) {
      result.recipeId = recipe.id;
      result.recipeName = recipe.name;
    }

    const postEnd = performance.now();
    logger.info(`Postprocessor finished`, { duration: `${(postEnd - postStart).toFixed(2)}ms` });

    const totalDuration = performance.now() - startTime;
    logger.info("Transformation pipeline completed", { totalDuration: `${totalDuration.toFixed(2)}ms` });

    return result;
  }

  /**
   * 专门处理 RSS / Atom feed
   */
  private async processRss(xml: string, url: string, format: FetchFormat): Promise<FetchResult> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const isAtom = !!doc.querySelector("feed");

    let title = "";
    let content = "";
    let metadata: any = {};

    if (isAtom) {
      title = doc.querySelector("feed > title")?.textContent?.trim() || "Atom Feed";
      metadata.description = doc.querySelector("feed > subtitle")?.textContent?.trim() || "";
      const entries = Array.from(doc.querySelectorAll("entry"));
      for (const entry of entries) {
        const itemTitle = entry.querySelector("title")?.textContent?.trim() || "Untitled";
        const itemLink = entry.querySelector("link")?.getAttribute("href") || "";
        const itemSummary =
          entry.querySelector("summary")?.textContent?.trim() ||
          entry.querySelector("content")?.textContent?.trim() ||
          "";
        const pubDate =
          entry.querySelector("published")?.textContent?.trim() ||
          entry.querySelector("updated")?.textContent?.trim() ||
          "";

        content += `### [${itemTitle}](${itemLink})\n\n`;
        if (pubDate) content += `*发布时间: ${pubDate}*\n\n`;
        if (itemSummary) {
          content += `${this.htmlToMarkdown(itemSummary)}\n\n`;
        }
        content += `---\n\n`;
      }
    } else {
      title = doc.querySelector("channel > title")?.textContent?.trim() || "RSS Feed";
      metadata.description = doc.querySelector("channel > description")?.textContent?.trim() || "";
      const items = Array.from(doc.querySelectorAll("item"));
      for (const item of items) {
        const itemTitle = item.querySelector("title")?.textContent?.trim() || "Untitled";
        const itemLink = item.querySelector("link")?.textContent?.trim() || "";
        const itemDesc = item.querySelector("description")?.textContent?.trim() || "";
        const pubDate = item.querySelector("pubDate")?.textContent?.trim() || "";

        content += `### [${itemTitle}](${itemLink})\n\n`;
        if (pubDate) content += `*发布时间: ${pubDate}*\n\n`;
        if (itemDesc) {
          content += `${this.htmlToMarkdown(itemDesc)}\n\n`;
        }
        content += `---\n\n`;
      }
    }

    if (format === "html") {
      // 退化处理：如果是 HTML 输出需求，给一个简单的包装
      content =
        `<h1>${title}</h1>\n<p>${metadata.description}</p>\n` +
        content.replace(/\n### \[(.*?)\]\((.*?)\)/g, '<h3><a href="$2">$1</a></h3>').replace(/\n\n/g, "<br>");
    } else if (format === "json") {
      content = JSON.stringify({ text: content });
    }

    // 交给后处理器进行空白清理与组装
    const result = await this.postprocessor.process(content, title, url, format, metadata);
    // RSS 结构极为明确，将提取质量设定为最高
    result.quality = 1.0;
    return result;
  }

  private htmlToMarkdown(htmlString: string): string {
    const doc = new DOMParser().parseFromString(htmlString, "text/html");
    // 复用 Converter 的 HTML 到 Markdown 的转换逻辑
    return this.converter.process(doc.body, "markdown");
  }
}

// 导出单例以便复用
export const transformer = new Transformer();
