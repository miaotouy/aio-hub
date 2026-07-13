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

import JSZip from "jszip";

export interface ExtractedImage {
  name: string;
  base64: string;
  mimeType: string;
  estimatedBytes: number;
}

export interface ZipDocumentParseResult {
  text: string;
  images: ExtractedImage[];
  hasImages: boolean;
}

/**
 * 从 PPTX 二进制数据中提取文本和图片
 */
export async function parsePptx(
  buffer: ArrayBuffer
): Promise<ZipDocumentParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const images: ExtractedImage[] = [];
  const textParts: string[] = [];

  // 1. 提取图片 (ppt/media/)
  const mediaPromises: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (relativePath.startsWith("ppt/media/") && !file.dir) {
      const ext = relativePath.split(".").pop()?.toLowerCase();
      if (ext && ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
        const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
        const promise = file.async("base64").then((base64) => {
          images.push({
            name: relativePath.substring("ppt/media/".length),
            base64,
            mimeType,
            estimatedBytes: Math.ceil(base64.length * 0.75),
          });
        });
        mediaPromises.push(promise);
      }
    }
  });

  // 2. 提取文本 (ppt/slides/slideN.xml)
  const slideFiles = Object.keys(zip.files)
    .filter(
      (path) => path.startsWith("ppt/slides/slide") && path.endsWith(".xml")
    )
    .sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, ""), 10) || 0;
      return numA - numB;
    });

  const textPromises = slideFiles.map(async (path, index) => {
    const file = zip.file(path);
    if (file) {
      const xmlText = await file.async("text");
      // 使用正则匹配 <a:t>...</a:t> 标签中的文本
      const matches = xmlText.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
      if (matches) {
        const slideText = matches
          .map((m) => m.replace(/<a:t[^>]*>([^<]*)<\/a:t>/, "$1"))
          .join(" ")
          .trim();
        if (slideText) {
          textParts.push(`--- Slide ${index + 1} ---\n${slideText}`);
        }
      }
    }
  });

  await Promise.all([...mediaPromises, ...textPromises]);

  return {
    text: textParts.join("\n\n"),
    images,
    hasImages: images.length > 0,
  };
}

/**
 * 从 XLSX 二进制数据中提取文本和图片
 */
export async function parseXlsx(
  buffer: ArrayBuffer
): Promise<ZipDocumentParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const images: ExtractedImage[] = [];
  const textParts: string[] = [];

  // 1. 提取图片 (xl/media/)
  const mediaPromises: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (relativePath.startsWith("xl/media/") && !file.dir) {
      const ext = relativePath.split(".").pop()?.toLowerCase();
      if (ext && ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
        const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
        const promise = file.async("base64").then((base64) => {
          images.push({
            name: relativePath.substring("xl/media/".length),
            base64,
            mimeType,
            estimatedBytes: Math.ceil(base64.length * 0.75),
          });
        });
        mediaPromises.push(promise);
      }
    }
  });

  // 2. 提取共享字符串 (xl/sharedStrings.xml)
  let sharedStrings: string[] = [];
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  if (sharedStringsFile) {
    const xmlText = await sharedStringsFile.async("text");
    const matches = xmlText.match(/<t[^>]*>([^<]*)<\/t>/g);
    if (matches) {
      sharedStrings = matches.map((m) =>
        m.replace(/<t[^>]*>([^<]*)<\/t>/, "$1")
      );
    }
  }

  // 3. 提取工作表文本 (xl/worksheets/sheetN.xml)
  const sheetFiles = Object.keys(zip.files)
    .filter(
      (path) => path.startsWith("xl/worksheets/sheet") && path.endsWith(".xml")
    )
    .sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/[^0-9]/g, ""), 10) || 0;
      return numA - numB;
    });

  const textPromises = sheetFiles.map(async (path, index) => {
    const file = zip.file(path);
    if (file) {
      const xmlText = await file.async("text");
      const rowParts: string[] = [];

      // 匹配每一行 <row>...</row>
      const rowMatches = xmlText.match(/<row[^>]*>([\s\S]*?)<\/row>/g);
      if (rowMatches) {
        for (const rowXml of rowMatches) {
          const cellParts: string[] = [];
          // 匹配单元格 <c r="A1" t="s">...</c> 或 <c r="B1">...</c>
          const cellMatches = rowXml.match(/<c[^>]*>([\s\S]*?)<\/c>/g);
          if (cellMatches) {
            for (const cellXml of cellMatches) {
              // 判断是否是共享字符串类型 t="s"
              const isShared = /t="s"/.test(cellXml);
              const valMatch = cellXml.match(/<v>([^<]*)<\/v>/);
              if (valMatch) {
                const val = valMatch[1];
                if (isShared) {
                  const strIndex = parseInt(val, 10);
                  cellParts.push(sharedStrings[strIndex] || "");
                } else {
                  cellParts.push(val);
                }
              } else {
                // 尝试直接匹配 <t> 标签
                const tMatch = cellXml.match(/<t[^>]*>([^<]*)<\/t>/);
                if (tMatch) {
                  cellParts.push(tMatch[1]);
                } else {
                  cellParts.push("");
                }
              }
            }
          }
          const rowText = cellParts.filter(Boolean).join("\t");
          if (rowText) {
            rowParts.push(rowText);
          }
        }
      }

      if (rowParts.length > 0) {
        textParts.push(`--- Sheet ${index + 1} ---\n${rowParts.join("\n")}`);
      }
    }
  });

  await Promise.all([...mediaPromises, ...textPromises]);

  return {
    text: textParts.join("\n\n"),
    images,
    hasImages: images.length > 0,
  };
}

/**
 * 判断是否为 PPTX 格式
 */
export function isPptxAssetLike(asset: {
  name?: string;
  mimeType?: string;
}): boolean {
  return (
    asset.mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    asset.name?.toLowerCase().endsWith(".pptx") === true
  );
}

/**
 * 判断是否为 XLSX 格式
 */
export function isXlsxAssetLike(asset: {
  name?: string;
  mimeType?: string;
}): boolean {
  return (
    asset.mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    asset.name?.toLowerCase().endsWith(".xlsx") === true
  );
}
