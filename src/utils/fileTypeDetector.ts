import { fileTypeFromBuffer } from "file-type";
import type { Asset } from "@/types/asset-management";

/**
 * 文件类型检测工具
 * 
 * 使用 file-type 库读取文件魔数进行精确检测，
 * 并使用扩展名映射作为后备方案
 */

/**
 * 从文件路径读取文件头部字节（用于魔数检测）
 * 只读取前 4100 字节（file-type 推荐的最小值）
 */
async function readFileHeader(filePath: string): Promise<Uint8Array | null> {
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    // 读取文件的前 4100 字节用于类型检测
    const bytes = await readFile(filePath);
    return bytes.slice(0, 4100);
  } catch (error) {
    console.error("读取文件头部失败:", error);
    return null;
  }
}

/**
 * 扩展的 MIME 类型映射表
 * 参考 Rust 后端的完整列表，包含更多文件类型
 */
const MIME_TYPE_MAP: Record<string, string> = {
  // 图片
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  
  // 音频
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  
  // 视频
  mp4: "video/mp4",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  
  // 文档
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  
  // 文本和标记语言
  txt: "text/plain",
  text: "text/plain",
  log: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  ini: "text/plain",
  env: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  rst: "text/x-rst",
  adoc: "text/asciidoc",
  asciidoc: "text/asciidoc",
  xml: "text/xml",
  html: "text/html",
  htm: "text/html",
  xhtml: "application/xhtml+xml",
  
  // 数据格式
  json: "application/json",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "text/toml",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  
  // 编程语言
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  py: "text/x-python",
  pyw: "text/x-python",
  pyi: "text/x-python",
  rb: "text/x-ruby",
  php: "text/x-php",
  java: "text/x-java",
  kt: "text/x-kotlin",
  kts: "text/x-kotlin",
  c: "text/x-c",
  cpp: "text/x-c++",
  cc: "text/x-c++",
  cxx: "text/x-c++",
  h: "text/x-c",
  hpp: "text/x-c++",
  hxx: "text/x-c++",
  cs: "text/x-csharp",
  go: "text/x-go",
  rs: "text/x-rust",
  swift: "text/x-swift",
  m: "text/x-objectivec",
  mm: "text/x-objectivec",
  scala: "text/x-scala",
  lua: "text/x-lua",
  perl: "text/x-perl",
  pl: "text/x-perl",
  r: "text/x-r",
  sh: "text/x-sh",
  bash: "text/x-sh",
  zsh: "text/x-sh",
  fish: "text/x-sh",
  ps1: "text/x-powershell",
  bat: "text/x-batch",
  cmd: "text/x-batch",
  
  // Web
  css: "text/css",
  scss: "text/x-scss",
  sass: "text/x-sass",
  less: "text/x-less",
  styl: "text/x-stylus",
  vue: "text/x-vue",
  svelte: "text/x-svelte",
  astro: "text/x-astro",
  
  // 配置和脚本
  gitignore: "text/plain",
  dockerignore: "text/plain",
  editorconfig: "text/plain",
  makefile: "text/x-makefile",
  cmake: "text/x-cmake",
  gradle: "text/x-gradle",
  
  // 其他
  sql: "text/x-sql",
  graphql: "text/x-graphql",
  proto: "text/x-protobuf",
  thrift: "text/x-thrift",
};

/**
 * 文本文件的 MIME 类型列表
 */
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/css",
  "text/javascript",
  "text/typescript",
  "application/json",
  "application/xml",
  "text/xml",
  "text/yaml",
  "text/toml",
  "text/csv",
  // 编程语言
  "text/x-python",
  "text/x-java",
  "text/x-c",
  "text/x-c++",
  "text/x-csharp",
  "text/x-go",
  "text/x-rust",
  "text/x-ruby",
  "text/x-php",
  "text/x-sh",
  "text/x-powershell",
  "text/x-batch",
  // Web
  "text/x-scss",
  "text/x-sass",
  "text/x-less",
  "text/x-vue",
  "text/x-svelte",
]);

/**
 * 从文件名获取扩展名
 */
function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * 基于扩展名推断 MIME 类型（后备方案）
 */
function inferMimeTypeFromExtension(fileName: string): string {
  const ext = getExtension(fileName);
  return MIME_TYPE_MAP[ext] || "application/octet-stream";
}

/**
 * 判断 MIME 类型是否为文本类型
 */
export function isTextMimeType(mimeType: string): boolean {
  return TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith("text/");
}

/**
 * 根据 MIME 类型判断资产类型
 */
export function determineAssetType(mimeType: string): Asset["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType.startsWith("application/pdf") ||
    mimeType.startsWith("application/msword") ||
    mimeType.startsWith("application/vnd.openxmlformats-officedocument") ||
    mimeType.startsWith("text/") ||
    isTextMimeType(mimeType)
  ) {
    return "document";
  }
  return "other";
}

/**
 * 检测文件的 MIME 类型
 * 
 * @param filePath - 文件路径（用于读取文件头部）
 * @param fileName - 文件名（用于扩展名后备检测）
 * @returns MIME 类型字符串
 */
export async function detectMimeType(
  filePath: string,
  fileName: string
): Promise<string> {
  // 1. 尝试使用 file-type 库通过魔数检测
  const fileHeader = await readFileHeader(filePath);
  if (fileHeader) {
    try {
      const fileType = await fileTypeFromBuffer(fileHeader);
      if (fileType) {
        return fileType.mime;
      }
    } catch (error) {
      console.warn("file-type 检测失败，使用扩展名后备方案:", error);
    }
  }

  // 2. 后备方案：基于扩展名推断
  return inferMimeTypeFromExtension(fileName);
}

/**
 * 检测文件是否为文本文件
 * 
 * 基于 MIME 类型和扩展名的组合判断
 */
export function isTextFile(fileName: string, mimeType: string): boolean {
  // 检查 MIME 类型
  if (isTextMimeType(mimeType)) {
    return true;
  }

  // 检查扩展名（某些文本文件可能没有被正确识别 MIME 类型）
  const ext = getExtension(fileName);
  const extMime = MIME_TYPE_MAP[ext];
  if (extMime && isTextMimeType(extMime)) {
    return true;
  }

  return false;
}

/**
 * 完整的文件类型检测
 * 
 * @param filePath - 文件路径
 * @param fileName - 文件名
 * @returns 包含 MIME 类型、资产类型和是否为文本文件的对象
 */
export async function detectFileType(filePath: string, fileName: string) {
  const mimeType = await detectMimeType(filePath, fileName);
  const assetType = determineAssetType(mimeType);
  const isText = isTextFile(fileName, mimeType);

  return {
    mimeType,
    assetType,
    isText,
  };
}