// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { readFile } from "@tauri-apps/plugin-fs";
import { smartDecode } from "@/utils/encoding";
import { parseDocx } from "@/utils/docxParser";
import {
  getKnowledgeFileExtension,
  getKnowledgeFileName,
  getKnowledgeMimeType,
  resolveKnowledgeFormat,
  type KnowledgeFormatCapability,
} from "./formats";
import type { KnowledgeImportStage } from "./types";

export interface ParsedKnowledgeFile {
  sourcePath: string;
  title: string;
  mimeType: string;
  content: string;
  sourceChecksum: string;
  parserVersion: string;
}

export const KNOWLEDGE_PARSER_VERSION = "knowledge-parser-v1";

export class KnowledgeFileParseError extends Error {
  constructor(
    public readonly sourcePath: string,
    public readonly stage: Exclude<KnowledgeImportStage, "ingest">,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeFileParseError";
  }
}

function titleFromPath(path: string): string {
  return getKnowledgeFileName(path).replace(/\.[^.]+$/, "") || "Untitled";
}

function isUtf16Text(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff))
  );
}

export function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || isUtf16Text(bytes)) return true;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let controlBytes = 0;
  for (const value of sample) {
    if (value === 0) return false;
    if (value < 32 && value !== 9 && value !== 10 && value !== 13) {
      controlBytes += 1;
    }
  }
  return controlBytes / sample.length <= 0.03;
}

async function parsePdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  let extractedCharacters = 0;
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const text = await page.getTextContent();
    const content = text.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    extractedCharacters += content.length;
    pages.push(`# 第 ${index} 页\n\n${content}`);
  }
  if (extractedCharacters === 0) {
    throw new Error("PDF 没有可提取文本；扫描 PDF 和图片 OCR 尚未支持");
  }
  return pages.join("\n\n");
}

async function parseHtml(bytes: Uint8Array): Promise<string> {
  const html = smartDecode(bytes);
  const [{ Readability }, { default: TurndownService }] = await Promise.all([
    import("@mozilla/readability"),
    import("turndown"),
  ]);
  const document = new DOMParser().parseFromString(html, "text/html");
  const article = new Readability(document.cloneNode(true) as Document).parse();
  const source = article?.content || document.body?.innerHTML || html;
  return new TurndownService({ headingStyle: "atx" }).turndown(source);
}

async function parseByCapability(
  capability: KnowledgeFormatCapability | null,
  bytes: Uint8Array
): Promise<string> {
  const parser = capability?.parser ?? "text";
  if (parser === "pdf") return parsePdf(bytes);
  if (parser === "docx") {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    return (await parseDocx(buffer)).text;
  }
  if (parser === "html") return parseHtml(bytes);
  return smartDecode(bytes);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join(
    ""
  );
}

export async function parseKnowledgeFile(
  sourcePath: string
): Promise<ParsedKnowledgeFile> {
  const fileName = getKnowledgeFileName(sourcePath);
  const extension = getKnowledgeFileExtension(sourcePath);
  const capability = resolveKnowledgeFormat(sourcePath);
  if (capability?.validation === "unsupported") {
    throw new KnowledgeFileParseError(
      sourcePath,
      "validation",
      `文件「${fileName}」属于${capability.label}，${capability.description}`
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(sourcePath);
  } catch (error) {
    throw new KnowledgeFileParseError(
      sourcePath,
      "read",
      `读取文件「${fileName}」失败：${error instanceof Error ? error.message : String(error)}`
    );
  }
  if ((!capability || capability.parser === "text") && !isProbablyText(bytes)) {
    throw new KnowledgeFileParseError(
      sourcePath,
      "validation",
      capability
        ? `文件「${fileName}」与声明的文本格式不符，检测到二进制内容`
        : `无法识别文件「${fileName}」的格式，且内容检测为二进制`
    );
  }

  let content: string;
  try {
    content = await parseByCapability(capability, bytes);
  } catch (error) {
    throw new KnowledgeFileParseError(
      sourcePath,
      "parse",
      error instanceof Error
        ? `解析文件「${fileName}」失败：${error.message}`
        : `解析文件「${fileName}」失败`
    );
  }
  if (!content.trim()) {
    throw new KnowledgeFileParseError(
      sourcePath,
      "parse",
      `文件「${fileName}」没有可索引文本`
    );
  }
  return {
    sourcePath,
    title: titleFromPath(sourcePath),
    mimeType: getKnowledgeMimeType(capability, extension),
    content,
    sourceChecksum: await sha256Hex(bytes),
    parserVersion: KNOWLEDGE_PARSER_VERSION,
  };
}
