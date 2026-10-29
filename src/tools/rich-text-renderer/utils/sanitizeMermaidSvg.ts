// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import createDOMPurify from "dompurify";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LOCAL_REFERENCE = /^#[^\s"'()<>]+$/;
let purifier: ReturnType<typeof createDOMPurify> | undefined;

function decodeCss(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(
      /\\([0-9a-f]{1,6})(?:\r\n|[\t\n\r\f ])?|\\([^\n\r\f0-9a-f])/gi,
      (_match, hex: string | undefined, char: string | undefined) => {
        if (!hex) return char ?? "";
        const code = parseInt(hex, 16);
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : "\ufffd";
      }
    );
}

/** Diagrams need local marker/filter references; CSS must not load external resources. */
function safeCssValue(value: string): boolean {
  const decoded = decodeCss(value);
  if (
    /(?:javascript|vbscript):|expression\s*\(|@import/i.test(
      decoded.replace(/[\x00-\x20\x7f-\x9f]/g, "")
    )
  )
    return false;
  let safe = true;
  const remainder = decoded.replace(
    /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
    (
      _match,
      double: string | undefined,
      single: string | undefined,
      plain: string | undefined
    ) => {
      if (!LOCAL_REFERENCE.test((double ?? single ?? plain ?? "").trim()))
        safe = false;
      return "";
    }
  );
  return (
    safe &&
    !/(?:url|image|image-set|-webkit-image-set|src)\s*\(/i.test(remainder)
  );
}

function cleanDeclarations(style: CSSStyleDeclaration) {
  for (let index = style.length - 1; index >= 0; index--) {
    const name = style.item(index);
    if (!safeCssValue(style.getPropertyValue(name))) style.removeProperty(name);
  }
}

function cleanStylesheet(source: string): string {
  try {
    const sheet = new CSSStyleSheet();
    // Constructed stylesheets parse without attaching CSS or fetching @import resources.
    sheet.replaceSync(source);
    const serialize = (rules: CSSRuleList): string =>
      Array.from(rules, (rule) => {
        if (rule.type === 1 || rule.type === 8) {
          cleanDeclarations((rule as CSSStyleRule).style);
          return rule.cssText;
        }
        // Keep theme conditions and edge animations, dropping resource-loading at-rules.
        if (rule.type === 4 || rule.type === 7 || rule.type === 12) {
          const group = rule as CSSGroupingRule;
          return (
            rule.cssText.slice(0, rule.cssText.indexOf("{")) +
            "{" +
            serialize(group.cssRules) +
            "}"
          );
        }
        return "";
      }).join("\n");
    return serialize(sheet.cssRules);
  } catch {
    return "";
  }
}

function getPurifier() {
  if (purifier) return purifier;
  const instance = createDOMPurify(window);
  instance.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style")
      node.textContent = cleanStylesheet(node.textContent ?? "");
  });
  instance.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name === "style") {
        const style = element.ownerDocument.createElement("span").style;
        style.cssText = attribute.value;
        cleanDeclarations(style);
        if (style.cssText) element.setAttribute(attribute.name, style.cssText);
        else element.removeAttribute(attribute.name);
      } else if (
        [
          "fill",
          "stroke",
          "filter",
          "clip-path",
          "mask",
          "marker-start",
          "marker-mid",
          "marker-end",
          "cursor",
        ].includes(name) &&
        !safeCssValue(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      } else if (
        (name === "href" || name === "xlink:href") &&
        tag !== "a" &&
        tag !== "image" &&
        !LOCAL_REFERENCE.test(attribute.value.trim())
      ) {
        element.removeAttribute(attribute.name);
      } else if (
        (name === "src" || name === "href" || name === "xlink:href") &&
        /^data:/i.test(attribute.value) &&
        !/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(
          attribute.value
        )
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (
      tag === "a" &&
      element.getAttribute("target")?.toLowerCase() === "_blank"
    ) {
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  purifier = instance;
  return instance;
}

/** Sanitize once at the shared output boundary, preserving rich Mermaid labels. */
export function sanitizeMermaidSvg(source: string): string {
  const fragment = getPurifier().sanitize(source, {
    RETURN_DOM_FRAGMENT: true,
    ADD_TAGS: ["foreignobject"],
    ADD_ATTR: ["dominant-baseline", "target", "rel"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "video",
      "audio",
      "link",
      "meta",
      "base",
      "animate",
      "animatemotion",
      "animatetransform",
      "set",
    ],
  });
  const svg = fragment.firstElementChild;
  if (svg?.localName !== "svg" || svg.namespaceURI !== SVG_NAMESPACE)
    throw new Error("图表生成结果缺少有效 SVG");
  return svg.outerHTML;
}
