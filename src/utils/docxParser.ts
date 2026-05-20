import mammoth from "mammoth";
import DOMPurify from "dompurify";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

function toStandaloneArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buffer instanceof Uint8Array) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  return buffer.slice(0);
}

function normalizeDocxText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function htmlToTextWithImagePlaceholders(html: string, images: DocxImage[]): string {
  if (images.length === 0 || typeof DOMParser === "undefined") {
    return "";
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const lines: string[] = [];
  let inlineText = "";
  let imageIndex = 0;

  const flushInline = () => {
    const text = inlineText.replace(/[ \t]+/g, " ").trim();
    if (text) lines.push(text);
    inlineText = "";
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineText += node.textContent || "";
      return;
    }

    if (!(node instanceof Element)) return;

    const tagName = node.tagName.toLowerCase();
    if (tagName === "img") {
      flushInline();
      const image = images[imageIndex++];
      lines.push(image?.placeholder || `[图片 ${imageIndex}]`);
      return;
    }

    if (tagName === "br") {
      flushInline();
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }

    if (
      [
        "address",
        "article",
        "aside",
        "blockquote",
        "div",
        "figcaption",
        "figure",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "li",
        "p",
        "pre",
        "section",
        "table",
        "tr",
      ].includes(tagName)
    ) {
      flushInline();
    }
  };

  visit(doc.body);
  flushInline();

  return lines.join("\n\n").trim();
}

function appendMessages(html: string, messages: MammothMessage[]): string {
  const warnings = messages.filter((message) => message.type === "warning");
  if (warnings.length === 0) return html;

  const list = warnings.map((warning) => `<li>${warning.message}</li>`).join("");
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

export function isDocxAssetLike(asset: { type?: string; mimeType?: string; name?: string }): boolean {
  return (
    asset.type === "document" && (isDocxMime(asset.mimeType) || asset.name?.toLowerCase().endsWith(".docx") === true)
  );
}

export async function parseDocx(buffer: ArrayBuffer | Uint8Array): Promise<DocxParseResult> {
  const arrayBuffer = toStandaloneArrayBuffer(buffer);
  const images: DocxImage[] = [];

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
        };
      }),
    },
  );

  const rawTextResult = await mammoth.extractRawText({ arrayBuffer });
  let text = normalizeDocxText(rawTextResult.value);

  if (images.length > 0) {
    const positionedText = htmlToTextWithImagePlaceholders(htmlResult.value, images);
    if (positionedText) {
      text = positionedText;
    } else {
      const placeholders = images.map((image) => image.placeholder).join("\n\n");
      text = text ? `${text}\n\n${placeholders}` : placeholders;
    }
  }

  const html = sanitizeDocxHtml(appendMessages(htmlResult.value, htmlResult.messages as MammothMessage[]));

  return {
    text,
    html,
    images,
    hasImages: images.length > 0,
  };
}

export async function docxToHtml(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  return (await parseDocx(buffer)).html;
}
