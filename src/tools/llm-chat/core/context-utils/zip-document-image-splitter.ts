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

/**
 * OpenXML (DOCX/PPTX/XLSX) 插图临时拆分工具
 *
 * 当主对话模型支持视觉能力时，将 .docx/.pptx/.xlsx 文件中的内嵌图片提取为
 * 临时 PipelineAttachment（inline source），直接作为多模态内容发送给模型。
 *
 * 设计约束：
 * - 不注册到 AssetManager（不污染资产库）
 * - base64 不进入文本分词器（走 _attachments 路径）
 */

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { parseDocx, isDocxAssetLike } from "@/utils/docxParser";
import {
  parsePptx,
  parseXlsx,
  isPptxAssetLike,
  isXlsxAssetLike,
} from "@/utils/zipDocumentParser";
import { getImageDimensions } from "@/utils/imageProcessor";
import { getAttachmentBuffer } from "./attachment-binary";
import {
  toPipelineAttachment,
  type AttachmentLike,
  type PipelineAttachment,
} from "../../types/pipeline-attachment";

const logger = createModuleLogger("llm-chat/zip-document-image-splitter");
const errorHandler = createModuleErrorHandler(
  "llm-chat/zip-document-image-splitter"
);

// 模块级缓存，避免高频重复解析附件（如 Token 统计高频触发场景）
const splitCache = new Map<string, ZipDocumentSplitResult>();
const MAX_CACHE_SIZE = 20;

function getCachedResult(key: string): ZipDocumentSplitResult | undefined {
  const result = splitCache.get(key);
  if (result) {
    // 移动到末尾，维持 LRU 顺序
    splitCache.delete(key);
    splitCache.set(key, result);
  }
  return result;
}

function setCacheResult(key: string, value: ZipDocumentSplitResult) {
  if (splitCache.size >= MAX_CACHE_SIZE) {
    const firstKey = splitCache.keys().next().value;
    if (firstKey !== undefined) {
      splitCache.delete(firstKey);
    }
  }
  splitCache.set(key, value);
}

export interface ZipDocumentSplitResult {
  /** 含图片占位符的纯文本 */
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
  img: {
    base64: string;
    mimeType: string;
    estimatedBytes: number;
    name?: string;
  },
  index: number,
  parentAsset: PipelineAttachment
): Promise<PipelineAttachment | null> {
  // 提前过滤浏览器已知不支持的图片格式，避免调用 getImageDimensions 触发 imageProcessor 的加载失败警告
  const UNSUPPORTED_MIMES = [
    "image/x-emf",
    "image/x-wmf",
    "image/emf",
    "image/wmf",
  ];

  if (UNSUPPORTED_MIMES.includes(img.mimeType.toLowerCase())) {
    logger.debug("跳过浏览器不支持的图片格式", {
      imgIndex: index,
      parentAssetId: parentAsset.id,
      mimeType: img.mimeType,
    });
    return null;
  }

  try {
    const buffer = base64ToArrayBuffer(img.base64);
    const dims = await getImageDimensions(buffer);

    // 过滤无法被浏览器加载的图片（可能是损坏的图片，或是不支持的格式如 wmf/emf）
    if (dims.width === 0 || dims.height === 0) {
      logger.warn(
        "图片无法被浏览器加载（尺寸为 0），可能是损坏的图片或不支持的格式（如 wmf/emf），将跳过该图片",
        {
          imgIndex: index,
          parentAssetId: parentAsset.id,
          mimeType: img.mimeType,
        }
      );
      return null;
    }

    return {
      id: `zip-img-${parentAsset.id}-${index}`,
      type: "image",
      name: `${parentAsset.name} - 图片 ${index}`,
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
      imgIndex: index,
      parentAssetId: parentAsset.id,
      error,
    });
    return null;
  }
}

/**
 * 将 OpenXML (DOCX/PPTX/XLSX) 附件拆分为文本 + 临时图片 Asset 列表
 *
 * @param assetLike 原始资产
 * @returns 拆分结果；如果无图片或解析失败，返回 success: false
 */
export async function splitZipDocumentIntoImageAssets(
  assetLike: AttachmentLike
): Promise<ZipDocumentSplitResult> {
  const asset = toPipelineAttachment(assetLike);
  const isDocx = isDocxAssetLike(asset);
  const isPptx = isPptxAssetLike(asset);
  const isXlsx = isXlsxAssetLike(asset);

  // 安全检查
  if (!isDocx && !isPptx && !isXlsx) {
    return { text: "", imageAssets: [], success: false };
  }

  // 检查缓存
  const cached = getCachedResult(asset.id);
  if (cached) {
    logger.debug("命中 OpenXML 拆分缓存", { assetId: asset.id });
    return cached;
  }

  try {
    // 1. 读取二进制数据
    const buffer = await getAttachmentBuffer(asset);

    // 2. 根据类型解析
    let text = "";
    let images: Array<{
      base64: string;
      mimeType: string;
      estimatedBytes: number;
    }> = [];
    let hasImages = false;

    if (isDocx) {
      const parseResult = await parseDocx(buffer);
      text = parseResult.text;
      images = parseResult.images;
      hasImages = parseResult.hasImages;
    } else if (isPptx) {
      const parseResult = await parsePptx(buffer);
      text = parseResult.text;
      images = parseResult.images;
      hasImages = parseResult.hasImages;
    } else {
      const parseResult = await parseXlsx(buffer);
      text = parseResult.text;
      images = parseResult.images;
      hasImages = parseResult.hasImages;
    }

    // 无图片则不拆分
    if (!hasImages) {
      const result = { text, imageAssets: [], success: false };
      setCacheResult(asset.id, result);
      return result;
    }

    // 3. 为每张图片构建临时 Asset
    const imageAssets: PipelineAttachment[] = [];
    let imgIndex = 1;
    for (const img of images) {
      const imgAsset = await buildImageAsset(img, imgIndex++, asset);
      if (imgAsset) {
        imageAssets.push(imgAsset);
      }
    }

    // 至少有一张图片成功
    if (imageAssets.length === 0) {
      logger.warn("所有图片构建失败，回退到原始路径", {
        assetId: asset.id,
      });
      const result = {
        text,
        imageAssets: [],
        success: false,
      };
      setCacheResult(asset.id, result);
      return result;
    }

    logger.info("OpenXML 插图拆分完成", {
      assetName: asset.name,
      totalImages: images.length,
      successImages: imageAssets.length,
    });

    const result = {
      text,
      imageAssets,
      success: true,
    };
    setCacheResult(asset.id, result);
    return result;
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "OpenXML 图片拆分失败",
      showToUser: false,
      context: { assetId: asset.id, assetName: asset.name },
    });
    const result = { text: "", imageAssets: [], success: false };
    setCacheResult(asset.id, result);
    return result;
  }
}
