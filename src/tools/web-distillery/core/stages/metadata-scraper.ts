import { get } from "lodash-es";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { MetadataScraperRule, ScrapedMetadata } from "../../types";

const logger = createModuleLogger("web-distillery/metadata-scraper");
const errorHandler = createModuleErrorHandler("web-distillery/metadata-scraper");

/**
 * 环节：元数据提取器 (Metadata Scraper)
 * 职责：从脚本文本内容中按规则提取结构化元数据
 */
export class MetadataScraper {
  /**
   * 执行元数据提取流程
   * @param scriptContents 预处理阶段保留的脚本文本内容
   * @param rules 站点配方中定义的提取规则
   */
  public process(scriptContents: string[], rules?: MetadataScraperRule[]): ScrapedMetadata {
    if (!rules || rules.length === 0) {
      return {};
    }

    const metadata: ScrapedMetadata = {
      extras: {},
    };

    for (const rule of rules) {
      errorHandler.handle(
        () => {
          const extracted = this.executeRule(scriptContents, rule);
          if (extracted) {
            this.applyMapping(metadata, extracted, rule.mapping);
          }
        },
        {
          userMessage: "执行提取规则失败",
          showToUser: false,
          context: { ruleType: rule.type, target: rule.target },
        },
      );
    }

    return metadata;
  }

  /**
   * 执行单条提取规则
   */
  private executeRule(scriptContents: string[], rule: MetadataScraperRule): any | null {
    switch (rule.type) {
      case "json-variable":
        return this.extractJsonVariable(scriptContents, rule.target);
      case "json-ld":
        return this.extractJsonLd(scriptContents);
      case "regex":
        return this.extractByRegex(scriptContents, rule.target);
      default:
        return null;
    }
  }

  /**
   * 从 window.XXX = {...} 模式中提取 JSON
   */
  private extractJsonVariable(scriptContents: string[], target: string): any | null {
    // 匹配变量赋值，支持 window.xxx = ..., var xxx = ..., const xxx = ..., xxx = ...
    // 特别是针对 target 变量名进行匹配
    const regex = new RegExp(
      `(?:(?:window|var|let|const)\\s+)?${target}\\s*=\\s*({[\\s\\S]*?});?\\s*(?:$|[\\n;])`,
      "m",
    );

    for (const content of scriptContents) {
      const match = content.match(regex);
      if (match && match[1]) {
        try {
          // 尝试解析提取到的 JSON 字符串
          return JSON.parse(match[1]);
        } catch (e) {
          logger.warn(`解析变量 ${target} 失败`, { error: e, preview: match[1].substring(0, 100) });
        }
      }
    }
    return null;
  }

  /**
   * 从脚本内容中查找 JSON-LD 数据
   */
  private extractJsonLd(scriptContents: string[]): any | null {
    for (const content of scriptContents) {
      // JSON-LD 通常包含 "@context": "https://schema.org"
      if (content.includes("@context")) {
        try {
          const data = JSON.parse(content);
          // 如果是数组，返回第一个元素或根据需要处理
          return Array.isArray(data) ? data[0] : data;
        } catch (e) {
          // 这里的脚本内容可能是混合了 JS 代码的，JSON.parse 失败很正常
          // 我们可以尝试更激进的正则提取 JSON 部分，但通常 JSON-LD 是独立的 script 标签内容
          // 在 preprocessor 中已经按标签提取了，所以这里 content 应该是纯 JSON
        }
      }
    }
    return null;
  }

  /**
   * 正则捕获组提取
   */
  private extractByRegex(scriptContents: string[], target: string): Record<string, string> | null {
    try {
      const regex = new RegExp(target, "m");
      for (const content of scriptContents) {
        const match = content.match(regex);
        if (match) {
          const result: Record<string, string> = {};
          // 将所有捕获组放入结果中，索引作为 key
          match.forEach((val, index) => {
            result[index.toString()] = val;
          });
          return result;
        }
      }
    } catch (e) {
      logger.warn(`无效的正则表达式: ${target}`, { error: e });
    }
    return null;
  }

  /**
   * 根据映射规则将提取到的数据应用到元数据对象
   */
  private applyMapping(metadata: ScrapedMetadata, source: any, mapping: Record<string, string | string[]>) {
    for (const [field, paths] of Object.entries(mapping)) {
      const pathArray = Array.isArray(paths) ? paths : [paths];
      let value: any = null;

      // 按顺序尝试每个路径，取第一个非空值
      for (const path of pathArray) {
        const val = get(source, path);
        if (val !== undefined && val !== null && val !== "") {
          value = val;
          break;
        }
      }

      if (value !== null) {
        // 如果是核心字段，直接赋值
        if (["title", "description", "author", "publishDate", "content"].includes(field)) {
          (metadata as any)[field] = value;
        } else {
          // 否则放入 extras
          if (!metadata.extras) metadata.extras = {};
          metadata.extras[field] = value;
        }
      }
    }
  }
}
