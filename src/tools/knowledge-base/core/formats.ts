// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

/** Central capability table for files accepted by Knowledge imports. */
export type KnowledgeFormatCategory =
  | "document"
  | "web"
  | "structured"
  | "text"
  | "code"
  | "image"
  | "archive";

export type KnowledgeFormatValidation =
  | "verified"
  | "experimental"
  | "unsupported";

export type KnowledgeParserKind =
  | "pdf"
  | "docx"
  | "html"
  | "text"
  | "unsupported";

export interface KnowledgeFormatCapability {
  id: string;
  category: KnowledgeFormatCategory;
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  parser: KnowledgeParserKind;
  validation: KnowledgeFormatValidation;
  description: string;
}

export const KNOWLEDGE_FORMAT_CAPABILITIES = [
  {
    id: "pdf",
    category: "document",
    label: "PDF",
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    parser: "pdf",
    validation: "experimental",
    description: "提取文本层；扫描件和图片文字暂不执行 OCR",
  },
  {
    id: "docx",
    category: "document",
    label: "Word",
    extensions: ["docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    parser: "docx",
    validation: "verified",
    description: "解析 DOCX 正文文本",
  },
  {
    id: "html",
    category: "web",
    label: "HTML",
    extensions: ["html", "htm"],
    mimeTypes: ["text/html"],
    parser: "html",
    validation: "verified",
    description: "提取可读正文并转换为 Markdown",
  },
  {
    id: "markdown",
    category: "text",
    label: "Markdown",
    extensions: ["md", "markdown"],
    mimeTypes: ["text/markdown"],
    parser: "text",
    validation: "verified",
    description: "按文本编码读取",
  },
  {
    id: "plain-text",
    category: "text",
    label: "纯文本",
    extensions: ["txt"],
    mimeTypes: ["text/plain"],
    parser: "text",
    validation: "verified",
    description: "按文本编码读取",
  },
  {
    id: "structured-text",
    category: "structured",
    label: "结构化文本",
    extensions: ["json", "csv"],
    mimeTypes: ["application/json", "text/csv"],
    parser: "text",
    validation: "verified",
    description: "保留原始文本结构",
  },
  {
    id: "source-code",
    category: "code",
    label: "代码",
    extensions: ["ts", "js", "vue", "py", "rs"],
    mimeTypes: ["text/plain"],
    parser: "text",
    validation: "verified",
    description: "按文本编码读取常用源代码",
  },
  {
    id: "legacy-office",
    category: "document",
    label: "其他 Office 文档",
    extensions: ["doc", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"],
    mimeTypes: [],
    parser: "unsupported",
    validation: "unsupported",
    description: "当前没有对应的专用解析器",
  },
  {
    id: "images",
    category: "image",
    label: "图片",
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"],
    mimeTypes: ["image/*"],
    parser: "unsupported",
    validation: "unsupported",
    description: "图片 OCR 尚未接入",
  },
  {
    id: "archives",
    category: "archive",
    label: "压缩包",
    extensions: ["zip", "7z", "rar", "tar", "gz"],
    mimeTypes: [],
    parser: "unsupported",
    validation: "unsupported",
    description: "不自动展开压缩包",
  },
] as const satisfies readonly KnowledgeFormatCapability[];

export const KNOWLEDGE_SUPPORTED_FORMATS = KNOWLEDGE_FORMAT_CAPABILITIES.filter(
  (capability) => capability.validation !== "unsupported"
);

export const KNOWLEDGE_UNSUPPORTED_FORMATS =
  KNOWLEDGE_FORMAT_CAPABILITIES.filter(
    (capability) => capability.validation === "unsupported"
  );

export const KNOWLEDGE_IMPORT_EXTENSIONS = Array.from(
  new Set(KNOWLEDGE_SUPPORTED_FORMATS.flatMap((item) => item.extensions))
);

export const KNOWLEDGE_DROP_ACCEPT = KNOWLEDGE_IMPORT_EXTENSIONS.map(
  (extension) => `.${extension}`
);

export const KNOWLEDGE_FILE_DIALOG_FILTERS = [
  {
    name: "支持的文档",
    extensions: KNOWLEDGE_IMPORT_EXTENSIONS,
  },
];

export const KNOWLEDGE_FORMAT_SUMMARY =
  "PDF、DOCX、HTML、Markdown、文本与常用代码文件";

export function getKnowledgeFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function getKnowledgeFileExtension(path: string): string {
  const name = getKnowledgeFileName(path);
  const separator = name.lastIndexOf(".");
  return separator > 0 ? name.slice(separator + 1).toLowerCase() : "";
}

export function resolveKnowledgeFormat(
  path: string
): KnowledgeFormatCapability | null {
  const extension = getKnowledgeFileExtension(path);
  return (
    KNOWLEDGE_FORMAT_CAPABILITIES.find((capability) =>
      capability.extensions.includes(extension as never)
    ) ?? null
  );
}

export function getKnowledgeMimeType(
  capability: KnowledgeFormatCapability | null,
  extension: string
): string {
  if (!capability) return "text/plain";
  if (capability.id === "structured-text") {
    return extension === "json" ? "application/json" : "text/csv";
  }
  return capability.mimeTypes[0] ?? "text/plain";
}
