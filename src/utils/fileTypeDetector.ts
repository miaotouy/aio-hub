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
export const MIME_TYPE_MAP: Record<string, string> = {
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
  ass: "text/x-ass",
  ssa: "text/x-ssa",
  srt: "text/x-srt",
  vtt: "text/vtt",
  lrc: "text/plain",
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
  tex: "text/x-tex",
  latex: "text/x-tex",
  bib: "text/x-bibtex",
  sty: "text/x-tex",
  cls: "text/x-tex",

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
  "text/x-ass",
  "text/x-ssa",
  "text/x-srt",
  "text/vtt",
]);

/**
 * 从文件名获取扩展名
 */
export function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * 基于扩展名推断 MIME 类型（后备方案）
 */
function inferMimeTypeFromExtension(fileName: string): string {
  const ext = getExtension(fileName);
  // 优先使用自定义的扩展映射，因为它可能包含更具体的类型（如 text/x-vue）
  // 最后是通用二进制流
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
 * 启发式检测 Buffer 是否可能为文本
 */
function isBufferLikelyText(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return true;

  // 检查前 1024 字节
  const checkLength = Math.min(buffer.length, 1024);
  let nullCount = 0;

  for (let i = 0; i < checkLength; i++) {
    const charCode = buffer[i];
    // 如果包含 NULL 字符，极大概率是二进制文件
    if (charCode === 0) {
      nullCount++;
      if (nullCount > 0) return false;
    }
    // 简单的控制字符检查（除了 TAB, LF, CR）
    if (charCode < 7 || (charCode > 14 && charCode < 32)) {
      // 允许少量的控制字符，但如果太多则认为是二进制
      // 在某些编码下可能会有误判，但对于 UTF-8/ASCII 很准
      return false;
    }
  }

  return true;
}

/**
 * 从 Buffer 检测文件的 MIME 类型
 * @param buffer - 文件内容的 Uint8Array
 * @param fileNameHint - 可选的文件名，用于扩展名后备检测
 * @returns MIME 类型字符串
 */
export async function detectMimeTypeFromBuffer(
  buffer: Uint8Array,
  fileNameHint?: string
): Promise<string> {
  // 1. 尝试使用 file-type 库通过魔数检测
  try {
    const fileType = await fileTypeFromBuffer(buffer.slice(0, 4100));
    if (fileType) {
      return fileType.mime;
    }
  } catch (error) {
    console.warn("file-type from buffer 检测失败，使用后备方案:", error);
  }

  // 2. 启发式文本检测
  // 如果 file-type 没测出来，且看起来像文本，则默认为 text/plain
  if (isBufferLikelyText(buffer)) {
    // 如果有文件名提示，我们还是优先根据扩展名拿更精确的类型（如 .ts -> text/typescript）
    if (fileNameHint) {
      const extMime = inferMimeTypeFromExtension(fileNameHint);
      if (extMime !== "application/octet-stream") {
        return extMime;
      }
    }
    return "text/plain";
  }

  // 3. 后备方案：基于文件名提示的扩展名推断
  if (fileNameHint) {
    // 提示可能本身就是一个 MIME 类型
    if (fileNameHint.includes('/')) {
      return fileNameHint;
    }
    // 否则，将其视为文件名并从扩展名推断
    return inferMimeTypeFromExtension(fileNameHint);
  }

  return "application/octet-stream";
}

/**
 * 基于扩展名或 MIME 类型提示推断 MIME 类型
 * @param hint - 文件名、扩展名或完整的 MIME 类型
 */
export function inferMimeTypeFromHint(hint: string): string | null {
  if (!hint) return null;
  // 检查是否已经是有效的 MIME 类型
  const normalizedHint = hint.trim().toLowerCase();
  if (normalizedHint.includes('/')) {
    return normalizedHint;
  }
  // 否则，尝试从扩展名推断
  return inferMimeTypeFromExtension(normalizedHint);
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
  const fileHeader = await readFileHeader(filePath);
  if (fileHeader) {
    // 复用 buffer 检测逻辑
    return await detectMimeTypeFromBuffer(fileHeader, fileName);
  }
  // 读取文件头部失败时的后备方案
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