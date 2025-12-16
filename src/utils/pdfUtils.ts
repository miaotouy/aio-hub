import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("utils/pdfUtils");

// 初始化 Worker
GlobalWorkerOptions.workerSrc = pdfjsWorker;

// 分辨率限制常量
const MAX_DIMENSION = 4096; // 单边最大像素数
const MAX_TOTAL_PIXELS = 16_000_000; // 约 4000x4000，避免 Canvas 超限

export interface PdfPageImage {
  pageNumber: number;
  base64: string; // 不带 data URI 前缀的纯 base64
  width: number;
  height: number;
}

/**
 * 计算安全的缩放比例，确保不超过分辨率限制
 */
function computeSafeScale(
  originalWidth: number,
  originalHeight: number,
  requestedScale: number
): number {
  const targetWidth = originalWidth * requestedScale;
  const targetHeight = originalHeight * requestedScale;

  let safeScale = requestedScale;

  // 检查单边是否超限
  if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
    const maxSide = Math.max(targetWidth, targetHeight);
    safeScale = (MAX_DIMENSION / maxSide) * requestedScale;
  }

  // 检查总像素数是否超限
  const safeWidth = originalWidth * safeScale;
  const safeHeight = originalHeight * safeScale;
  if (safeWidth * safeHeight > MAX_TOTAL_PIXELS) {
    const ratio = Math.sqrt(MAX_TOTAL_PIXELS / (safeWidth * safeHeight));
    safeScale *= ratio;
  }

  return safeScale;
}

/**
 * 将 PDF 二进制数据转换为图片列表
 * @param buffer PDF 文件二进制数据
 * @param scale 渲染缩放比例，默认 1.5 以获得较好的 OCR 清晰度
 * @param maxPages 最大处理页数，默认 50 页（防止超大 PDF 耗尽内存）
 */
export async function convertPdfToImages(
  buffer: Uint8Array | ArrayBuffer,
  scale: number = 1.5,
  maxPages: number = 50
): Promise<PdfPageImage[]> {
  try {
    const loadingTask = getDocument({ data: buffer });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;
    const numPages = Math.min(totalPages, maxPages);
    const results: PdfPageImage[] = [];

    if (totalPages > maxPages) {
      logger.warn(`PDF 页数 (${totalPages}) 超过最大限制 (${maxPages})，只处理前 ${maxPages} 页`);
    }

    logger.debug("开始转换 PDF 为图片", { totalPages, numPages, scale });

    // 并发控制：同时渲染的页面数量
    const CONCURRENCY = 3;
    const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);

    // 使用 Promise.all 进行分批并发处理
    // 注意：虽然 map + Promise.all 是并行的，但为了避免瞬间内存占用过高，我们手动分批
    for (let i = 0; i < numPages; i += CONCURRENCY) {
      const chunk = pageNumbers.slice(i, i + CONCURRENCY);

      const chunkResults = await Promise.all(
        chunk.map(async (pageNum) => {
          try {
            const page = await pdfDoc.getPage(pageNum);

            // 先获取原始尺寸以计算安全的缩放比例
            const originalViewport = page.getViewport({ scale: 1 });
            const safeScale = computeSafeScale(originalViewport.width, originalViewport.height, scale);

            if (safeScale < scale) {
              logger.debug(`第 ${pageNum} 页分辨率超限，scale 从 ${scale} 降至 ${safeScale.toFixed(2)}`);
            }

            const viewport = page.getViewport({ scale: safeScale });

            // 创建离屏 Canvas
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) {
              throw new Error("无法创建 Canvas 2D 上下文");
            }
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // 渲染页面
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // 转换为 Base64 (image/png)
            const dataUrl = canvas.toDataURL("image/png");
            const base64Parts = dataUrl.split(",");
            const base64Data = base64Parts[1];

            // 手动清理 canvas 引用（虽然会被 GC，但显式清理是个好习惯）
            canvas.width = 0;
            canvas.height = 0;

            if (base64Data) {
              return {
                pageNumber: pageNum,
                base64: base64Data,
                width: viewport.width,
                height: viewport.height,
              };
            } else {
              logger.warn("页面转换结果为空", { page: pageNum });
              return null;
            }
          } catch (pageError) {
            logger.error(`转换第 ${pageNum} 页失败`, pageError as Error);
            return null;
          }
        })
      );

      // 收集成功的结果
      chunkResults.forEach(res => {
        if (res) results.push(res);
      });
    }

    return results;
  } catch (error) {
    logger.error("PDF 文档加载或解析失败", error as Error);
    throw error;
  }
}

