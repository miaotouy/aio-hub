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
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/transformer");

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
    const startTime = performance.now();

    logger.info("Starting transformation pipeline", { url, htmlLength: html.length });

    // Stage 1: 预处理
    const s1Start = performance.now();
    const { doc } = this.preprocessor.process(html, url);
    const s1End = performance.now();
    logger.info(`Stage 1 (Preprocessor) finished`, { duration: `${(s1End - s1Start).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Stage 2: 去噪
    const s2Start = performance.now();
    this.denoiser.process(doc, options.extractSelectors);
    const s2End = performance.now();
    logger.info(`Stage 2 (Denoiser) finished`, { duration: `${(s2End - s2Start).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Stage 3: 提取
    const s3Start = performance.now();
    const { title, mainElement, metadata } = this.extractor.process(doc, options.extractSelectors);
    const s3End = performance.now();
    logger.info(`Stage 3 (Extractor) finished`, { duration: `${(s3End - s3Start).toFixed(2)}ms` });

    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Stage 4: 转换
    const s4Start = performance.now();
    const convertedContent = this.converter.process(mainElement, format);
    const s4End = performance.now();
    logger.info(`Stage 4 (Converter) finished`, { duration: `${(s4End - s4Start).toFixed(2)}ms` });

    // Stage 5: 后处理
    const s5Start = performance.now();
    const result = await this.postprocessor.process(convertedContent, title, url, format, metadata);
    const s5End = performance.now();
    logger.info(`Stage 5 (Postprocessor) finished`, { duration: `${(s5End - s5Start).toFixed(2)}ms` });

    const totalDuration = performance.now() - startTime;
    logger.info("Transformation pipeline completed", { totalDuration: `${totalDuration.toFixed(2)}ms` });

    return result;
  }
}

// 导出单例以便复用
export const transformer = new Transformer();
