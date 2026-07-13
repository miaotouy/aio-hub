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

import { invoke } from "@tauri-apps/api/core";
import type { ImageBlock, OcrResult } from "../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("OCR/NativeEngine");
const errorHandler = createModuleErrorHandler("OCR/NativeEngine");

/**
 * Native OCR 引擎 Composable
 * 专门处理 Windows 原生 OCR API
 */
export function useNativeEngine() {
  /**
   * 使用原生 API 识别单个图片
   */
  const recognizeSingle = async (
    canvas: HTMLCanvasElement
  ): Promise<{ text: string; confidence: number }> => {
    try {
      // 将 canvas 转换为 base64
      const imageData = canvas.toDataURL("image/png");

      // 调用 Tauri 命令进行 OCR 识别
      const result = await invoke<{ text: string; confidence: number }>(
        "native_ocr",
        {
          imageData,
        }
      );

      return {
        text: result.text.trim(),
        confidence: result.confidence,
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "Native OCR 识别失败",
        showToUser: false,
      });
      throw error;
    }
  };

  /**
   * 批量识别图片块
   */
  const recognizeBatch = async (
    blocks: ImageBlock[],
    onProgress?: (results: OcrResult[]) => void,
    signal?: AbortSignal
  ): Promise<OcrResult[]> => {
    const results: OcrResult[] = blocks.map((block) => ({
      blockId: block.id,
      imageId: block.imageId,
      text: "",
      status: "pending" as const,
    }));

    // 通知初始状态
    onProgress?.(results);

    logger.info(`使用原生 OCR 引擎识别 (${blocks.length} 块)`, {
      blocksCount: blocks.length,
    });

    // 逐个识别图片块
    for (let i = 0; i < blocks.length; i++) {
      if (signal?.aborted) {
        results[i].status = "cancelled";
        continue;
      }

      const block = blocks[i];

      // 更新状态为处理中
      results[i].status = "processing";
      onProgress?.([...results]);

      try {
        logger.debug(`处理图片块 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          engine: "native",
        });

        const { text, confidence } = await recognizeSingle(block.canvas);

        if (signal?.aborted) {
          results[i].status = "cancelled";
          continue;
        }

        // 更新结果
        results[i].text = text;
        results[i].confidence = confidence;
        results[i].status = "success";

        logger.debug(`图片块识别完成 ${i + 1}/${blocks.length}`, {
          blockId: block.id,
          confidence: `${(confidence * 100).toFixed(1)}%`,
          textLength: text.length,
        });
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: `图片块识别失败 ${i + 1}/${blocks.length}`,
          context: {
            blockId: block.id,
            engine: "native",
          },
          showToUser: false,
        });
        results[i].status = "error";
        results[i].error = (error as Error).message;
      }

      // 通知进度更新
      onProgress?.([...results]);
    }

    if (signal?.aborted) {
      results.forEach((result) => {
        if (result.status === "pending" || result.status === "processing") {
          result.status = "cancelled";
        }
      });
      onProgress?.([...results]);
    }

    return results;
  };

  return {
    recognizeSingle,
    recognizeBatch,
  };
}
