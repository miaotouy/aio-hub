import { readFile } from "@tauri-apps/plugin-fs";
import { smartDecode } from "@/utils/encoding";
import { parseDocx } from "@/utils/docxParser";

export interface ParsedKnowledgeFile {
  sourcePath: string;
  title: string;
  mimeType: string;
  content: string;
}

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extension(path: string): string {
  return fileName(path).split(".").pop()?.toLowerCase() || "";
}

function titleFromPath(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "") || "Untitled";
}

async function parsePdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const text = await page.getTextContent();
    const content = text.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(`# 第 ${index} 页\n\n${content}`);
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

export async function parseKnowledgeFile(
  sourcePath: string
): Promise<ParsedKnowledgeFile> {
  const bytes = await readFile(sourcePath);
  const ext = extension(sourcePath);
  let content: string;
  if (ext === "pdf") {
    content = await parsePdf(bytes);
  } else if (ext === "docx") {
    content = (await parseDocx(bytes.buffer as ArrayBuffer)).text;
  } else if (ext === "html" || ext === "htm") {
    content = await parseHtml(bytes);
  } else {
    content = smartDecode(bytes);
  }
  if (!content.trim())
    throw new Error(`文件「${fileName(sourcePath)}」没有可索引文本`);
  return {
    sourcePath,
    title: titleFromPath(sourcePath),
    mimeType: MIME_TYPES[ext] || "text/plain",
    content,
  };
}
