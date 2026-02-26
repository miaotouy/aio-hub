/**
 * 管道入口 (Transformer)
 * 职责：按阶段编排清洗任务
 */
import { Preprocessor } from "./stages/preprocessor";
import { Denoiser } from "./stages/denoiser";
import { Extractor } from "./stages/extractor";
import { Converter } from "./stages/converter";
import { Postprocessor } from "./stages/postprocessor";
import type { FetchResult, QuickFetchOptions, FetchFormat } from "../types";

export class Transformer {
  private preprocessor = new Preprocessor();
  private denoiser = new Denoiser();
  private extractor = new Extractor();
  private converter = new Converter();
  private postprocessor = new Postprocessor();

  /**
   * 执行完整的蒸馏过程
   */
  public async transform(html: string, options: QuickFetchOptions): Promise<FetchResult> {
    const format: FetchFormat = options.format || "markdown";
    const url = options.url;

    // Stage 1: 预处理
    const { doc } = this.preprocessor.process(html, url);

    // Stage 2: 去噪
    this.denoiser.process(doc, options.extractSelectors);

    // Stage 3: 提取
    const { title, mainElement, metadata } = this.extractor.process(doc, options.extractSelectors);

    // Stage 4: 转换
    const convertedContent = this.converter.process(mainElement, format);

    // Stage 5: 后处理
    return this.postprocessor.process(convertedContent, title, url, format, metadata);
  }
}

// 导出单例以便复用
export const transformer = new Transformer();
