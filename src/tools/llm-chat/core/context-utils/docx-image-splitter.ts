/**
 * DOCX 插图临时拆分工具
 *
 * 当主对话模型支持视觉能力时，将 .docx 文件中的内嵌图片提取为
 * 临时 PipelineAttachment（inline source），直接作为多模态内容发送给模型。
 *
 * 设计约束：
 * - 不注册到 AssetManager（不污染资产库）
 * - base64 不进入文本分词器（走 _attachments 路径）
 * - CSP 合规：使用 atob() + Uint8Array 解码，不使用 fetch(dataUrl)
 */

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { parseDocx, isDocxAssetLike } from "@/utils/docxParser";
import { getImageDimensions } from "@/utils/imageProcessor";
import type { DocxImage } from "@/utils/docxParser";
import { getAttachmentBuffer } from "./attachment-binary";
import {
  toPipelineAttachment,
  type AttachmentLike,
  type PipelineAttachment,
} from "../../types/pipeline-attachment";

const logger = createModuleLogger("llm-chat/docx-image-splitter");
const errorHandler = createModuleErrorHandler("llm-chat/docx-image-splitter");

export interface DocxSplitResult {
  /** 含 [图片 N] 占位符的纯文本 */
  text: string;
  /** 拆分出的临时图片附件列表 */
  imageAssets: PipelineAttachment[];
  /** 是否成功拆分（false 表示回退到原始路径） */
  success: boolean;
}

/**
 * 将 base64 字符串解码为 ArrayBuffer（CSP 合规，纯 JS）
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 为单张图片构造临时 Asset
 */
async function buildImageAsset(
  img: DocxImage,
  docxAsset: PipelineAttachment
): Promise<PipelineAttachment | null> {
  try {
    const buffer = base64ToArrayBuffer(img.base64);
    const dims = await getImageDimensions(buffer);

    // 过滤无法被浏览器加载的图片（可能是损坏的图片，或是不支持的格式如 wmf/emf）
    if (dims.width === 0 || dims.height === 0) {
      logger.warn(
        "图片无法被浏览器加载（尺寸为 0），可能是损坏的图片或不支持的格式（如 wmf/emf），将跳过该图片",
        {
          imgIndex: img.index,
          docxAssetId: docxAsset.id,
          mimeType: img.mimeType,
        }
      );
      return null;
    }

    return {
      id: `docx-img-${docxAsset.id}-${img.index}`,
      type: "image",
      name: `${docxAsset.name} - 图片 ${img.index}`,
      mimeType: img.mimeType,
      size: img.estimatedBytes,
      metadata: {
        width: dims.width,
        height: dims.height,
      },
      source: {
        kind: "inline",
        base64: img.base64,
        mimeType: img.mimeType,
      },
    };
  } catch (error) {
    logger.warn("构建临时图片 Asset 失败，跳过该图片", {
      imgIndex: img.index,
      docxAssetId: docxAsset.id,
      error,
    });
    return null;
  }
}

/**
 * 将 DOCX 附件拆分为文本 + 临时图片 Asset 列表
 *
 * @param docxAsset 原始 DOCX 资产
 * @returns 拆分结果；如果 DOCX 无图片或解析失败，返回 success: false
 */
export async function splitDocxIntoImageAssets(
  docxAssetLike: AttachmentLike
): Promise<DocxSplitResult> {
  const docxAsset = toPipelineAttachment(docxAssetLike);

  // 安全检查
  if (!isDocxAssetLike(docxAsset)) {
    return { text: "", imageAssets: [], success: false };
  }

  try {
    // 1. 读取 DOCX 二进制
    const buffer = await getAttachmentBuffer(docxAsset);

    // 2. 解析 DOCX
    const parseResult = await parseDocx(buffer);

    // 无图片则不拆分
    if (!parseResult.hasImages) {
      return { text: parseResult.text, imageAssets: [], success: false };
    }

    // 3. 为每张图片构建临时 Asset
    const imageAssets: PipelineAttachment[] = [];
    for (const img of parseResult.images) {
      const asset = await buildImageAsset(img, docxAsset);
      if (asset) {
        imageAssets.push(asset);
      }
    }

    // 至少有一张图片成功
    if (imageAssets.length === 0) {
      logger.warn("所有图片构建失败，回退到原始路径", {
        docxAssetId: docxAsset.id,
      });
      return { text: parseResult.text, imageAssets: [], success: false };
    }

    logger.info("DOCX 插图拆分完成", {
      docxAssetName: docxAsset.name,
      totalImages: parseResult.images.length,
      successImages: imageAssets.length,
    });

    return {
      text: parseResult.text,
      imageAssets,
      success: true,
    };
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "DOCX 图片拆分失败",
      showToUser: false,
      context: { docxAssetId: docxAsset.id, docxAssetName: docxAsset.name },
    });
    return { text: "", imageAssets: [], success: false };
  }
}
