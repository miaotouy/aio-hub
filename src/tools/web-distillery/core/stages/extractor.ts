// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 环节：正文提取 (Extractor)
 * 职责：确定核心正文节点，提取元数据
 */
import type { ScrapedMetadata, SiteRecipe } from "../../types";
import { Readability } from "@mozilla/readability";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/extractor");

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
  public process(
    doc: Document,
    targetSelectors: string[] = [],
    scrapedMetadata?: ScrapedMetadata,
    recipe?: SiteRecipe
  ): ExtractedData {
    let mainElement: HTMLElement | null = null;
    let title = doc.title;

    // 0. 优先尝试程序化提取器（evaluatorFn）
    if (recipe?.evaluatorFn) {
      try {
        const url = new URL(doc.baseURI || "https://example.com");
        const result = recipe.evaluatorFn(doc, url);
        if (result && result.length > 50) {
          logger.info("Programmatic evaluator produced content", {
            recipeId: recipe.id,
            length: result.length,
          });
          const container = doc.createElement("div");
          // evaluatorFn 返回的是 Markdown 文本，包裹在 <pre> 中保留格式
          // 后续 Converter 会检测到 pre 标签并保留原始内容
          container.setAttribute("data-distillery-raw-markdown", "true");
          container.textContent = result;
          return {
            title: title,
            mainElement: container,
            metadata: this.extractMetadata(doc),
          };
        }
      } catch (e) {
        logger.warn("Programmatic evaluator failed, falling back", {
          recipeId: recipe?.id,
          error: e,
        });
      }
    }

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

    // 2. 聚合页检测：如果页面链接密度极高，按分组提取链接列表
    if (!mainElement) {
      const aggregationResult = this.detectAggregationPage(doc);
      if (aggregationResult) {
        logger.info("Detected aggregation page, using grouped link extraction");
        const container = doc.createElement("div");
        container.setAttribute("data-distillery-raw-markdown", "true");
        container.textContent = aggregationResult;
        mainElement = container;
      }
    }

    // 3. 如果选择器没匹配到任何内容，使用 Mozilla Readability
    if (!mainElement) {
      // Readability 会修改传入的 Document，需要 clone
      const clonedDoc = doc.cloneNode(true) as Document;
      const reader = new Readability(clonedDoc);
      const article = reader.parse();
      if (article && article.content) {
        title = article.title || title;
        const container = doc.createElement("div");
        container.innerHTML = article.content;
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
      if (scrapedMetadata.description)
        metadata.description = scrapedMetadata.description;
      if (scrapedMetadata.author) metadata.author = scrapedMetadata.author;
      if (scrapedMetadata.publishDate)
        metadata.publishDate = scrapedMetadata.publishDate;

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
        else if (
          scrapedMetadata.description &&
          scrapedMetadata.description.length > domContentLen
        ) {
          const container = doc.createElement("div");
          // 清洗 description 中的 HTML 标签后包装成段落
          const cleanDesc = scrapedMetadata.description
            .replace(/<[^>]*>/g, "")
            .trim();
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

  /**
   * 聚合页检测：识别链接密度极高的页面（如新闻聚合、导航站）
   * 按语义分组提取链接列表
   */
  private detectAggregationPage(doc: Document): string | null {
    const body = doc.body;
    if (!body) return null;

    // 统计外链数量
    const allLinks = Array.from(
      body.querySelectorAll("a[href]")
    ) as HTMLAnchorElement[];
    const externalLinks = allLinks.filter((a) => {
      const href = a.href;
      return href && href.startsWith("http") && !href.startsWith("javascript:");
    });

    // 正文文本长度
    const bodyText = body.textContent?.trim() || "";
    const textLength = bodyText.length;

    // 判定条件：外链 > 30 个，且正文文字少于 500 字（排除正常文章页）
    // 或者链接数/文字数比值极高
    const linkDensity =
      textLength > 0 ? externalLinks.length / (textLength / 100) : 0;
    if (externalLinks.length < 30 || (textLength > 2000 && linkDensity < 1.5)) {
      return null;
    }

    // 尝试按语义分组提取
    const groups: {
      heading: string;
      links: { title: string; url: string }[];
    }[] = [];

    // 策略1：查找 heading + 紧随的链接列表
    const headings = Array.from(
      body.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']")
    );
    for (const heading of headings) {
      const headingText = heading.textContent?.trim();
      if (!headingText || headingText.length > 50) continue;

      // 查找 heading 后面的兄弟元素或父容器中的链接
      const container = heading.parentElement;
      if (!container) continue;

      const containerLinks = Array.from(
        container.querySelectorAll("a[href]")
      ) as HTMLAnchorElement[];
      const validLinks = containerLinks
        .filter((a) => {
          const href = a.href;
          const text = a.textContent?.trim();
          return (
            href &&
            href.startsWith("http") &&
            !href.startsWith("javascript:") &&
            text &&
            text.length > 3 &&
            text.length < 200
          );
        })
        .map((a) => ({ title: a.textContent!.trim(), url: a.href }));

      // 去重
      const seen = new Set<string>();
      const uniqueLinks = validLinks.filter((link) => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      });

      if (uniqueLinks.length >= 3) {
        groups.push({ heading: headingText, links: uniqueLinks });
      }
    }

    // 如果分组提取成功，格式化为 Markdown
    if (groups.length >= 2) {
      let md = "";
      for (const group of groups) {
        md += `## ${group.heading}\n`;
        md += group.links
          .map((link) => `- [${link.title}](${link.url})`)
          .join("\n");
        md += "\n\n";
      }
      return md.trim();
    }

    // 策略2：如果没有明确的分组结构，但链接密度确实很高，
    // 提取所有有意义的链接作为平铺列表
    if (externalLinks.length >= 50 && linkDensity >= 3) {
      const meaningfulLinks = externalLinks
        .filter((a) => {
          const text = a.textContent?.trim();
          return text && text.length > 5 && text.length < 200;
        })
        .map((a) => ({ title: a.textContent!.trim(), url: a.href }));

      // 去重
      const seen = new Set<string>();
      const uniqueLinks = meaningfulLinks.filter((link) => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      });

      if (uniqueLinks.length >= 20) {
        let md = "## 链接列表\n";
        md += uniqueLinks
          .map((link) => `- [${link.title}](${link.url})`)
          .join("\n");
        return md;
      }
    }

    return null;
  }

  private extractMetadata(doc: Document) {
    const meta: any = {};

    const getMeta = (names: string[]) => {
      for (const name of names) {
        const el = doc.querySelector(
          `meta[name="${name}"], meta[property="${name}"]`
        );
        if (el) return el.getAttribute("content");
      }
      return undefined;
    };

    meta.description = getMeta([
      "description",
      "og:description",
      "twitter:description",
    ]);
    meta.author = getMeta(["author", "article:author", "og:site_name"]);
    meta.publishDate = getMeta([
      "publish_date",
      "article:published_time",
      "og:pubdate",
    ]);
    meta.language = doc.documentElement.lang || getMeta(["language"]);

    return meta;
  }
}
