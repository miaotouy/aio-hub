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

import mammoth from "mammoth";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOC_MIME = "application/msword";

export interface DocxImage {
  index: number;
  base64: string;
  mimeType: string;
  placeholder: string;
  /** base64 解码后的原始字节数（用于判断图片大小） */
  estimatedBytes: number;
}

export interface DocxParseResult {
  text: string;
  html: string;
  images: DocxImage[];
  hasImages: boolean;
}

interface MammothMessage {
  type: "warning" | "error";
  message: string;
}

function toStandaloneArrayBuffer(
  buffer: ArrayBuffer | Uint8Array
): ArrayBuffer {
  if (buffer instanceof Uint8Array) {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  }
  return buffer.slice(0);
}

function normalizeDocxText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * 将 mammoth 生成的 HTML 转换为 Markdown，图片节点通过 data-img-index 精准替换为占位符。
 * 在转换前剔除内联 base64 数据以避免性能问题。
 */
function htmlToMarkdown(html: string): string {
  // 剔除内联 base64 图片数据，将数 MB 的 HTML 缩减至几 KB
  const cleanHtml = html.replace(/src="data:[^"]*"/g, 'src=""');

  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  // 使用 GFM 插件支持表格、删除线、任务列表
  turndownService.use(gfm);

  // 禁用转义：DOCX 内容不需要防止 Markdown 误解析，转义只会引入多余的反斜杠
  turndownService.escape = (str: string) => str;

  // 自定义规则——精准将 <img> 转换为图片占位符
  turndownService.addRule("docx-image", {
    filter: "img",
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const index = element.getAttribute("data-img-index");
      return index ? `[图片 ${index}]` : "";
    },
  });

  return turndownService.turndown(cleanHtml).trim();
}

function appendMessages(html: string, messages: MammothMessage[]): string {
  const warnings = messages.filter((message) => message.type === "warning");
  if (warnings.length === 0) return html;

  const list = warnings
    .map((warning) => `<li>${warning.message}</li>`)
    .join("");
  return `${html}<section class="docx-conversion-warnings"><h3>转换提示</h3><ul>${list}</ul></section>`;
}

function sanitizeDocxHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["class"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  });
}

export function isDocxMime(mimeType?: string | null): boolean {
  return mimeType === DOCX_MIME;
}

export function isDocMime(mimeType?: string | null): boolean {
  return mimeType === DOC_MIME;
}

export function isDocxAssetLike(asset: {
  type?: string;
  mimeType?: string;
  name?: string;
}): boolean {
  return (
    isDocxMime(asset.mimeType) ||
    asset.name?.toLowerCase().endsWith(".docx") === true
  );
}

export function isWordDocumentAssetLike(asset: {
  type?: string;
  mimeType?: string;
  name?: string;
}): boolean {
  const lowerName = asset.name?.toLowerCase();
  return (
    isDocxAssetLike(asset) ||
    isDocMime(asset.mimeType) ||
    lowerName?.endsWith(".doc") === true
  );
}

export async function parseDocx(
  buffer: ArrayBuffer | Uint8Array
): Promise<DocxParseResult> {
  const arrayBuffer = toStandaloneArrayBuffer(buffer);
  const images: DocxImage[] = [];

  // mammoth 解析 HTML，为 <img> 注入 data-img-index 属性以建立精准绑定
  const htmlResult = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const index = images.length + 1;
        const base64 = await image.readAsBase64String();
        const mimeType = image.contentType || "application/octet-stream";
        const placeholder = `[图片 ${index}]`;

        images.push({
          index,
          base64,
          mimeType,
          placeholder,
          estimatedBytes: Math.ceil(base64.length * 0.75),
        });

        return {
          src: `data:${mimeType};base64,${base64}`,
          "data-img-index": String(index),
        };
      }),
    }
  );

  // 使用 turndown 将 HTML 转为 Markdown，保留富文本格式并精准插入图片占位符
  let text: string;
  try {
    text = htmlToMarkdown(htmlResult.value);
  } catch {
    // 回退：turndown 异常时使用 mammoth 纯文本 + 尾部追加占位符
    const rawTextResult = await mammoth.extractRawText({ arrayBuffer });
    text = normalizeDocxText(rawTextResult.value);
    if (images.length > 0) {
      const placeholders = images.map((img) => img.placeholder).join("\n\n");
      text = text ? `${text}\n\n${placeholders}` : placeholders;
    }
  }

  const html = sanitizeDocxHtml(
    appendMessages(htmlResult.value, htmlResult.messages as MammothMessage[])
  );

  return {
    text,
    html,
    images,
    hasImages: images.length > 0,
  };
}

export async function docxToHtml(
  buffer: ArrayBuffer | Uint8Array
): Promise<string> {
  return (await parseDocx(buffer)).html;
}
