import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("utils/pdfUtils");

// 初始化 Worker
GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfPageImage {
  pageNumber: number;
  base64: string; // 不带 data URI 前缀的纯 base64
  width: number;
  height: number;
}

/**
 * 将 PDF 二进制数据转换为图片列表
 * @param buffer PDF 文件二进制数据
 * @param scale 渲染缩放比例，默认 1.5 以获得较好的 OCR 清晰度
 */
export async function convertPdfToImages(
  buffer: Uint8Array | ArrayBuffer,
  scale: number = 1.5
): Promise<PdfPageImage[]> {
  try {
    const loadingTask = getDocument({ data: buffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const results: PdfPageImage[] = [];

    logger.debug("开始转换 PDF 为图片", { numPages, scale });

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
            const viewport = page.getViewport({ scale });

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

