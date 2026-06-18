/**
 * 消息截图生成器: 整合 ScreenshotRenderer + screenshotCapture, 暴露
 * `generate(options)` / `copyToClipboard()` / `saveToFile()` 三个高层 API。
 *
 * 用法:
 * ```ts
 * const generator = useScreenshotGenerator();
 * const { canvas } = await generator.generate({ elements, options });
 * await generator.saveToFile(canvas, defaultName);
 * // 或
 * await generator.copyToClipboard(canvas);
 * ```
 */

import { ref } from "vue";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { sanitizeFilename } from "@/utils/fileUtils";
import { formatDateTime } from "@/utils/time";
import {
  captureMessagesAndStitch,
  canvasToPngBytes,
  copyCanvasToClipboard,
  type StitchOptions,
  type StitchResult,
} from "../../utils/screenshotCapture";

const logger = createModuleLogger("llm-chat-screenshot");
const errorHandler = createModuleErrorHandler("llm-chat-screenshot");

export interface GenerateOptions {
  /** 截图元素 (`.message-slot` 节点) 列表 */
  elements: HTMLElement[];
  /** 拼接 / 截图配置 */
  options?: Omit<StitchOptions, "onProgress">;
  /** 进度回调 (会覆盖 options.onProgress) */
  onProgress?: (done: number, total: number, currentLabel: string) => void;
}

export function useScreenshotGenerator() {
  const generating = ref(false);
  const lastResult = ref<StitchResult | null>(null);
  const progress = ref({ done: 0, total: 0, currentLabel: "" });

  /**
   * 执行截图 + 拼接, 返回大画布。
   * 内部使用 module logger + module error handler, 错误向上抛。
   */
  async function generate(args: GenerateOptions): Promise<StitchResult> {
    const { elements, options = {}, onProgress } = args;
    if (elements.length === 0) {
      throw new Error("没有可截图的消息节点");
    }

    generating.value = true;
    progress.value = { done: 0, total: elements.length, currentLabel: "" };
    lastResult.value = null;

    const wrappedOnProgress = (
      done: number,
      total: number,
      label: string
    ) => {
      progress.value = { done, total, currentLabel: label };
      onProgress?.(done, total, label);
    };

    try {
      logger.info("开始生成截图", { count: elements.length });
      const result = await errorHandler.wrapAsync(
        () =>
          captureMessagesAndStitch(elements, {
            ...options,
            onProgress: wrappedOnProgress,
          }),
        { showToUser: true, userMessage: "生成截图失败" }
      );
      if (!result) {
        throw new Error("生成截图返回空结果");
      }
      lastResult.value = result;
      logger.info("截图生成完成", {
        width: result.width,
        height: result.height,
      });
      return result;
    } catch (err) {
      logger.error("生成截图异常", { error: err });
      throw err;
    } finally {
      generating.value = false;
    }
  }

  /**
   * 复制大画布到剪贴板 (PNG)。
   */
  async function copyToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
    try {
      await copyCanvasToClipboard(canvas);
      customMessage.success("图片已复制到剪贴板");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("复制到剪贴板失败", { error: message });
      customMessage.warning(
        `复制失败: ${message}。请使用"保存图片"功能`
      );
      return false;
    }
  }

  /**
   * 通过 Tauri save dialog + writeFile 保存 PNG。
   * 默认文件名格式: `<会话标题>-分享-YYYY-MM-DD_HH-mm.png`。
   */
  async function saveToFile(
    canvas: HTMLCanvasElement,
    defaultName?: string
  ): Promise<boolean> {
    const fileName =
      defaultName ?? `AIO-Hub-分享-${formatDateTime(new Date())}.png`;

    try {
      const target = await save({
        title: "保存消息截图",
        defaultPath: sanitizeFilename(fileName),
        filters: [
          { name: "PNG 图片", extensions: ["png"] },
          { name: "全部文件", extensions: ["*"] },
        ],
      });
      if (!target) {
        return false; // 用户取消
      }

      const bytes = canvasToPngBytes(canvas);
      await writeFile(target, bytes);
      customMessage.success("图片已保存");
      logger.info("截图已保存", { path: target, size: bytes.length });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("保存截图失败", { error: message });
      customMessage.error(`保存失败: ${message}`);
      return false;
    }
  }

  return {
    generating,
    progress,
    lastResult,
    generate,
    copyToClipboard,
    saveToFile,
  };
}
