import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import type { Asset, AssetImportOptions } from "@/types/asset-management";
import { getExtensionFromMimeType } from "@/utils/mimeToLanguage";

const logger = createModuleLogger("useAttachmentProcessor");
const errorHandler = createModuleErrorHandler("useAttachmentProcessor");

/**
 * 内联数据处理结果
 */
export interface ProcessedResult {
  /** 处理后的文本（符合条件的 Base64 已替换为 appdata:// 链接） */
  processedText: string;
  /** 新创建的附件列表 */
  newAssets: Asset[];
}

/**
 * 内联数据处理选项
 */
export interface ProcessOptions {
  /** 转换的大小阈值（KB）。只有大于此大小的 Base64 数据才会被转换。 */
  sizeThresholdKB?: number;
  /** 传递给资产管理器的导入选项 */
  assetImportOptions?: AssetImportOptions;
}

/**
 * 正则表达式：匹配 Markdown 格式的内联 Base64 数据
 * 格式：![alt](data:media/type;base64,...)
 * 捕获组:
 * 1: alt 文本
 * 2: media type (e.g., "image/png")
 * 3: base64 数据
 */
const INLINE_BASE64_REGEX = /!\[([^\]]*)\]\(data:([^;]+);base64,([^)]+)\)/g;

/**
 * 从 Base64 字符串解码为 ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 估算 Base64 字符串解码后的字节大小
 * @param base64Length Base64 字符串的长度
 * @returns 估算的字节数
 */
const estimateDecodedSize = (base64Length: number): number => {
  // Base64 编码会使数据大小增加约 1/3。
  // 更精确的计算是 (n * 3) / 4，再考虑 padding。
  // 这里使用 0.75 作为快速估算的乘数。
  return base64Length * 0.75;
};

/**
 * 处理文本中的内联 Base64 数据，将其智能转换为附件
 *
 * 此函数会：
 * 1. 识别文本中所有的内联 Base64 数据（`![alt](data:...)`）
 * 2. 检查数据大小是否超过设定的阈值
 * 3. 对超过阈值的数据，解码并保存到资产管理系统
 * 4. 用 `![alt](appdata://...)` 链接替换原始的 Base64 数据
 *
 * @param text 原始文本
 * @param options 处理选项，包括大小阈值和资产导入选项
 * @returns 处理结果，包含净化后的文本和新创建的附件列表
 */
export async function processInlineData(
  text: string,
  options?: ProcessOptions
): Promise<ProcessedResult> {
  const newAssets: Asset[] = [];
  let processedText = text;
  const sizeThresholdBytes = options?.sizeThresholdKB ? options.sizeThresholdKB * 1024 : 0;

  const matches = Array.from(text.matchAll(INLINE_BASE64_REGEX));

  if (matches.length === 0) {
    return { processedText: text, newAssets: [] };
  }

  logger.info(`检测到 ${matches.length} 个内联 Base64 数据，开始处理`, {
    matchCount: matches.length,
    sizeThreshold: `${options?.sizeThresholdKB ?? 0} KB`,
  });

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const [fullMatch, altText, mimeType, base64Data] = match;

    // 检查大小是否超过阈值
    const estimatedSize = estimateDecodedSize(base64Data.length);
    if (sizeThresholdBytes > 0 && estimatedSize < sizeThresholdBytes) {
      logger.debug(`跳过转换：数据大小（~${(estimatedSize / 1024).toFixed(2)} KB）小于阈值`, {
        altText,
        mimeType,
      });
      continue; // 小于阈值，不处理
    }

    try {
      const arrayBuffer = base64ToArrayBuffer(base64Data);
      const extension = getExtensionFromMimeType(mimeType) || "bin";
      const fileName = `inline-data-${Date.now()}-${i}.${extension}`;

      logger.debug(`处理第 ${i + 1} 个内联数据`, {
        altText,
        mimeType,
        fileName,
        dataSize: arrayBuffer.byteLength,
      });

      const asset = await assetManagerEngine.importAssetFromBytes(
        arrayBuffer,
        fileName,
        {
          generateThumbnail: true,
          enableDeduplication: true,
          ...options?.assetImportOptions,
          // 优先使用传入的 origin，如果没有则使用默认值
          origin: options?.assetImportOptions?.origin || {
            type: "clipboard", // 假设来自粘贴或类似操作
            source: "base64-inline",
            sourceModule: options?.assetImportOptions?.sourceModule || "unknown",
          },
        }
      );

      const newTag = `![${altText}](appdata://${asset.path})`;
      processedText = processedText.replace(fullMatch, newTag);
      newAssets.push(asset);

      logger.debug(`第 ${i + 1} 个数据转换成功`, { assetId: asset.id, newTag });
    } catch (error) {
      errorHandler.error(error, `转换第 ${i + 1} 个内联数据失败`, {
        altText,
        mimeType,
        base64Length: base64Data.length,
      });
    }
  }

  if (newAssets.length > 0) {
    logger.info("内联数据处理完成", {
      totalFound: matches.length,
      converted: newAssets.length,
      skipped: matches.length - newAssets.length,
    });
  }

  return {
    processedText,
    newAssets,
  };
}

/**
 * useAttachmentProcessor Composable
 *
 * 为 Vue 组件提供附件处理功能
 */
export function useAttachmentProcessor() {
  return {
    processInlineData,
  };
}