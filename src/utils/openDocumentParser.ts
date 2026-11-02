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
import DOMPurify from "dompurify";

export const ODT_MIME = "application/vnd.oasis.opendocument.text";
export const OTT_MIME = "application/vnd.oasis.opendocument.text-template";
export const FODT_MIME = "application/vnd.oasis.opendocument.text-flat-xml";

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  xlink: "http://www.w3.org/1999/xlink",
  manifest: "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
};

export function isOpenDocumentTextMime(mime?: string | null): boolean {
  return mime === ODT_MIME || mime === OTT_MIME || mime === FODT_MIME;
}

export function inferOpenDocumentTextMime(hint?: string | null): string | null {
  const value = hint?.trim().toLowerCase();
  if (isOpenDocumentTextMime(value)) return value!;
  const extension = value?.split(/[\\/]/).pop()?.split(".").pop();
  switch (extension) {
    case "odt":
      return ODT_MIME;
    case "ott":
      return OTT_MIME;
    case "fodt":
      return FODT_MIME;
    default:
      return null;
  }
}

export function isOpenDocumentTextAssetLike(asset: {
  mimeType?: string;
  name?: string;
}): boolean {
  return (
    isOpenDocumentTextMime(asset.mimeType) ||
    !!inferOpenDocumentTextMime(asset.name)
  );
}

function parseXml(xml: string): XMLDocument {
  // ODF 内容无需 DTD；提前拒绝实体声明，避免文档引入外部资源。
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error(
      "文档包含不受支持的 XML 实体声明，请重新另存为 ODT 后打开。"
    );
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("文档 XML 已损坏，请使用办公软件修复后重试。");
  }
  return document;
}

function attr(
  element: Element,
  namespace: keyof typeof NS,
  name: string
): string {
  return element.getAttributeNS(NS[namespace], name) || "";
}

function count(value: string): number {
  const number = value ? Number(value) : 1;
  if (!Number.isInteger(number) || number < 1 || number > 1000) {
    throw new Error("文档中的重复行、列或空格数量过大，请精简后重试。");
  }
  return number;
}

const IMAGE_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["bmp", "image/bmp"],
]);

/** 将 ODT / OTT 包或 FODT XML 转为经过清理的阅读视图。 */
export async function openDocumentToHtml(buffer: Uint8Array): Promise<string> {
  let zip: JSZip | null = null;
  let content: XMLDocument;
  const documents: XMLDocument[] = [];
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new Error("文档压缩包已损坏，请使用办公软件修复后重试。");
    }
    const manifestFile = zip.file("META-INF/manifest.xml");
    if (manifestFile) {
      const manifest = parseXml(await manifestFile.async("string"));
      if (
        manifest.getElementsByTagNameNS(NS.manifest, "encryption-data").length
      ) {
        throw new Error("此文档已加密，请在办公软件中移除密码后重试。");
      }
    }
    const contentFile = zip.file("content.xml");
    if (!contentFile) throw new Error("文档缺少 content.xml，无法读取正文。");
    const stylesFile = zip.file("styles.xml");
    if (stylesFile) documents.push(parseXml(await stylesFile.async("string")));
    content = parseXml(await contentFile.async("string"));
  } else {
    content = parseXml(new TextDecoder("utf-8").decode(buffer));
  }
  documents.push(content);
  const body = content.getElementsByTagNameNS(NS.office, "body")[0];
  const text =
    body &&
    Array.from(body.children).find(
      (element) =>
        element.namespaceURI === NS.office && element.localName === "text"
    );
  if (!text) throw new Error("文件缺少 OpenDocument 文本文档正文。");

  const styles = new Map<string, Element>();
  const orderedLists = new Set<string>();
  for (const document of documents) {
    for (const style of Array.from(
      document.getElementsByTagNameNS(NS.style, "style")
    )) {
      styles.set(
        `${attr(style, "style", "family")}:${attr(style, "style", "name")}`,
        style
      );
    }
    for (const list of Array.from(
      document.getElementsByTagNameNS(NS.text, "list-style")
    )) {
      if (
        list.getElementsByTagNameNS(NS.text, "list-level-style-number").length
      ) {
        orderedLists.add(attr(list, "style", "name"));
      }
    }
  }

  function applyStyle(source: Element, target: HTMLElement, family: string) {
    let name = attr(
      source,
      family === "table-cell" ? "table" : "text",
      "style-name"
    );
    const chain: Element[] = [];
    const seen = new Set<string>();
    while (name && !seen.has(name)) {
      seen.add(name);
      const style = styles.get(`${family}:${name}`);
      if (!style) break;
      chain.unshift(style);
      name = attr(style, "style", "parent-style-name");
    }
    for (const style of chain) {
      for (const properties of Array.from(style.children)) {
        if (properties.namespaceURI !== NS.style) continue;
        const weight = attr(properties, "fo", "font-weight");
        if (/^(normal|bold|[1-9]00)$/.test(weight))
          target.style.fontWeight = weight;
        const italic = attr(properties, "fo", "font-style");
        if (/^(normal|italic|oblique)$/.test(italic))
          target.style.fontStyle = italic;
        const align = attr(properties, "fo", "text-align");
        if (/^(start|end|left|right|center|justify)$/.test(align))
          target.style.textAlign = align;
        const decoration: string[] = [];
        if (
          /^(solid|dotted|dash|wave)$/.test(
            attr(properties, "style", "text-underline-style")
          )
        )
          decoration.push("underline");
        if (
          /^(solid|dotted|dash)$/.test(
            attr(properties, "style", "text-line-through-style")
          )
        )
          decoration.push("line-through");
        if (decoration.length)
          target.style.textDecoration = decoration.join(" ");
      }
    }
  }

  const output = document.createElement("div");
  let renderedNodes = 0;
  async function render(
    source: Node,
    parent: HTMLElement,
    depth = 0
  ): Promise<void> {
    if (++renderedNodes > 100000 || depth > 100) {
      throw new Error("文档内容过于复杂，请拆分后重试。");
    }
    if (source.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(source.textContent || ""));
      return;
    }
    if (source.nodeType !== Node.ELEMENT_NODE) return;
    const element = source as Element;
    const name = element.localName;
    const namespace = element.namespaceURI;
    let tag = "";
    let family = "";
    if (namespace === NS.text) {
      if (["tracked-changes", "note", "annotation"].includes(name)) return;
      if (name === "s") {
        parent.append(
          document.createTextNode(
            "\u00a0".repeat(count(attr(element, "text", "c")))
          )
        );
        return;
      }
      if (name === "tab") {
        parent.append(document.createTextNode("\u00a0".repeat(4)));
        return;
      }
      if (name === "line-break") tag = "br";
      if (name === "p") {
        tag = "p";
        family = "paragraph";
      }
      if (name === "h") {
        const level = Number(attr(element, "text", "outline-level")) || 1;
        tag = `h${Math.min(6, Math.max(1, Math.trunc(level)))}`;
        family = "paragraph";
      }
      if (name === "span") {
        tag = "span";
        family = "text";
      }
      if (name === "a") tag = "a";
      if (name === "list")
        tag = orderedLists.has(attr(element, "text", "style-name"))
          ? "ol"
          : "ul";
      if (name === "list-item" || name === "list-header") tag = "li";
    } else if (namespace === NS.table) {
      if (name === "table-column" || name === "covered-table-cell") return;
      if (name === "table") tag = "table";
      if (name === "table-row") tag = "tr";
      if (name === "table-header-rows") tag = "thead";
      if (name === "table-cell") {
        tag = "td";
        family = "table-cell";
      }
    } else if (namespace === NS.draw) {
      if (name === "image") {
        let src = "";
        const path = attr(element, "xlink", "href").replace(/^\.\//, "");
        const mime = IMAGE_TYPES.get(
          path.split(".").pop()?.toLowerCase() || ""
        );
        if (
          zip &&
          mime &&
          !/^(?:[a-z]+:|[/\\])/i.test(path) &&
          !path.split("/").includes("..")
        ) {
          const image = zip.file(path);
          if (image) src = `data:${mime};base64,${await image.async("base64")}`;
        } else if (!zip) {
          const data = element
            .getElementsByTagNameNS(NS.office, "binary-data")[0]
            ?.textContent?.replace(/\s/g, "");
          const inlineMime =
            attr(element, "draw", "mime-type") ||
            attr(element, "office", "mime-type");
          if (
            data &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(data) &&
            Array.from(IMAGE_TYPES.values()).includes(inlineMime)
          ) {
            src = `data:${inlineMime};base64,${data}`;
          }
        }
        if (src) {
          const image = document.createElement("img");
          image.src = src;
          image.alt =
            attr(element.parentElement || element, "draw", "name") ||
            "文档图片";
          parent.append(image);
        }
        return;
      }
      if (name !== "frame" && name !== "text-box") return;
    } else {
      // 只转换已知文档命名空间，跳过脚本、元数据和嵌入对象。
      return;
    }

    const target = tag ? document.createElement(tag) : parent;
    if (family) applyStyle(element, target, family);
    if (tag === "a") {
      const href = attr(element, "xlink", "href").trim();
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) {
        target.setAttribute("href", href);
        target.setAttribute("target", "_blank");
        target.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (tag === "td") {
      for (const [odf, html] of [
        ["number-columns-spanned", "colspan"],
        ["number-rows-spanned", "rowspan"],
      ]) {
        const value = attr(element, "table", odf);
        if (value) target.setAttribute(html, String(count(value)));
      }
    }
    for (const child of Array.from(element.childNodes))
      await render(child, target, depth + 1);
    if (tag) {
      const repeats =
        tag === "tr"
          ? attr(element, "table", "number-rows-repeated")
          : tag === "td"
            ? attr(element, "table", "number-columns-repeated")
            : "";
      const copies = count(repeats);
      renderedNodes += (copies - 1) * (target.querySelectorAll("*").length + 1);
      if (renderedNodes > 100000)
        throw new Error("文档表格过大，请拆分后重试。");
      parent.append(target);
      for (let index = 1; index < copies; index++)
        parent.append(target.cloneNode(true));
    }
  }
  for (const child of Array.from(text.childNodes)) await render(child, output);
  return DOMPurify.sanitize(output.innerHTML, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    ADD_ATTR: ["target"],
  });
}
