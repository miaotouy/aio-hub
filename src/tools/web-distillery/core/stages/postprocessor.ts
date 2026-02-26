/**
 * Stage 5: 后处理 (Postprocessor)
 * 职责：质量评估、格式微调、链接修复
 */
import type { FetchResult } from "../../types";

export class Postprocessor {
  /**
   * 最后加工并封装结果
   */
  public process(content: string, title: string, url: string, format: any, metadata: any): FetchResult {
    // 1. 简单的质量评估
    const quality = this.calculateQuality(content, metadata);
    const warnings: string[] = [];

    if (quality < 0.3) {
      warnings.push("内容质量较低，可能提取不完整。");
    }
    if (content.toLowerCase().includes("captcha") || content.includes("验证码")) {
      warnings.push("检测到反爬验证码。");
    }

    return {
      url,
      title,
      content: this.refineContent(content),
      contentLength: content.length,
      format,
      quality,
      level: 0, // Level 0 结果
      fetchedAt: new Date().toISOString(),
      metadata,
      warnings,
    };
  }

  private calculateQuality(content: string, metadata: any): number {
    let score = 0;

    // 长度评分
    if (content.length > 1000) score += 0.4;
    else if (content.length > 300) score += 0.2;

    // 元数据丰富度
    if (metadata.description) score += 0.2;
    if (metadata.author) score += 0.1;

    // 结构评分 (Markdown 标签密度)
    const mdTags = (content.match(/#|\[|!\[/g) || []).length;
    if (mdTags > 5) score += 0.3;

    return Math.min(1.0, score);
  }

  private refineContent(content: string): string {
    // 合并三个以上的多余换行
    return content.replace(/\n{3,}/g, "\n\n").trim();
  }
}
