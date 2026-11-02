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

import type { AstNode } from "../../src/tools/rich-text-renderer/types";

/** Parser-level semantics, independent of Vue wrappers and runtime metadata. */
export interface SemanticNode {
  type: string;
  attrs?: Record<string, string>;
  value?: string;
  children?: SemanticNode[];
}

export class UnsupportedAstNodeError extends Error {
  constructor(public readonly nodeType: string) {
    super("Semantic adapter does not support AST node: " + nodeType);
    this.name = "UnsupportedAstNodeError";
  }
}

function text(value: string): SemanticNode {
  return { type: "#text", value };
}

function element(
  type: string,
  children: SemanticNode[] = [],
  attrs: Record<string, string> = {}
): SemanticNode {
  attrs = { ...attrs };
  if (type === "th" || type === "td") {
    const alignment = /^text-align:\s*(left|center|right);?$/.exec(
      attrs.style ?? ""
    );
    if (alignment) {
      attrs.align = alignment[1];
      delete attrs.style;
    }
    if (attrs.align === "left") delete attrs.align;
  }
  const normalizedAttrs = Object.fromEntries(
    Object.entries(attrs)
      .filter(
        ([key, value]) => !(type === "ol" && key === "start" && value === "1")
      )
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return {
    type,
    ...(Object.keys(normalizedAttrs).length ? { attrs: normalizedAttrs } : {}),
    children: normalizeChildren(children, type),
  };
}

function mergeText(nodes: SemanticNode[]): SemanticNode[] {
  const result: SemanticNode[] = [];
  for (const node of nodes) {
    if (node.type === "#text" && node.value === "") continue;
    const previous = result.at(-1);
    if (node.type === "#text" && previous?.type === "#text") {
      previous.value = (previous.value ?? "") + node.value;
    } else {
      result.push({ ...node });
    }
  }
  return result;
}

function normalizeChildren(
  nodes: SemanticNode[],
  container: string
): SemanticNode[] {
  const structural =
    [
      "#root",
      "blockquote",
      "ul",
      "ol",
      "table",
      "thead",
      "tbody",
      "tr",
    ].includes(container) ||
    (container === "li" &&
      nodes.some((node) =>
        /^(p|ul|ol|blockquote|pre|h[1-6]|hr)$/.test(node.type)
      ));
  return mergeText(
    nodes.flatMap((node, index) => {
      if (node.type !== "#text") return [node];
      let value = node.value ?? "";
      // Ignore one HTML writer LF following br on both sides of the comparison.
      if (nodes[index - 1]?.type === "br") value = value.replace(/^\n/, "");
      if (structural && /^[ \t\r\n]*$/.test(value)) return [];
      return [text(value)];
    })
  );
}

export function normalizeAst(
  nodes: AstNode[],
  projectNodes = false
): SemanticNode[] {
  return normalizeChildren(normalizeAstNodes(nodes, projectNodes), "#root");
}

function normalizeAstNodes(
  nodes: AstNode[],
  projectNodes: boolean
): SemanticNode[] {
  return mergeText(
    nodes.flatMap((node): SemanticNode[] => {
      const children = () =>
        normalizeAstNodes(node.children ?? [], projectNodes);
      switch (node.type) {
        case "text":
          return [text(node.props.content)];
        case "quote":
          return [
            text(node.props.startMarker),
            ...children(),
            text(node.props.endMarker),
          ];
        case "paragraph":
          return [element("p", children())];
        case "heading":
          return [element("h" + node.props.level, children())];
        case "strong":
          return [element("strong", children())];
        case "em":
          return [element("em", children())];
        case "strikethrough":
          return [element("s", children())];
        case "inline_code":
          return [element("code", [text(node.props.content)])];
        case "code_block":
          return [
            element("pre", [
              element(
                "code",
                [text(node.props.content)],
                node.props.language
                  ? { class: "language-" + node.props.language }
                  : {}
              ),
            ]),
          ];
        case "list":
          return [
            element(
              node.props.ordered ? "ol" : "ul",
              children(),
              node.props.ordered && node.props.start !== undefined
                ? { start: String(node.props.start) }
                : {}
            ),
          ];
        case "list_item":
          return [element("li", children())];
        case "blockquote":
          return [element("blockquote", children())];
        case "link":
          return [
            element("a", children(), {
              href: node.props.href,
              ...(node.props.title !== undefined
                ? { title: node.props.title }
                : {}),
            }),
          ];
        case "image":
          return [
            element("img", [], {
              src: node.props.src,
              alt: node.props.alt ?? "",
              ...(node.props.title ? { title: node.props.title } : {}),
            }),
          ];
        case "hr":
          return [element("hr")];
        case "hard_break":
          return [element("br")];
        case "table": {
          const rows = node.children;
          const headers = rows.filter(
            (row) => row.type === "table_row" && row.props.isHeader
          );
          const body = rows.filter(
            (row) => row.type !== "table_row" || !row.props.isHeader
          );
          return [
            element("table", [
              ...(headers.length
                ? [element("thead", normalizeAstNodes(headers, projectNodes))]
                : []),
              ...(body.length
                ? [element("tbody", normalizeAstNodes(body, projectNodes))]
                : []),
            ]),
          ];
        }
        case "table_row":
          return [element("tr", children())];
        case "table_cell":
          return [
            element(
              node.props.isHeader ? "th" : "td",
              children(),
              node.props.align ? { align: node.props.align } : {}
            ),
          ];
        case "katex_inline":
        case "katex_block":
          if (!projectNodes) throw new UnsupportedAstNodeError(node.type);
          return [element(node.type, [text(node.props.content)])];
        case "llm_think":
          if (!projectNodes) throw new UnsupportedAstNodeError(node.type);
          return [
            element("llm_think", children(), {
              tag: node.props.rawTagName,
              raw: node.props.rawContent ?? "",
              thinking: String(!!node.props.isThinking),
            }),
          ];
        case "vcp_tool":
          if (!projectNodes) throw new UnsupportedAstNodeError(node.type);
          return [
            element("vcp_tool", [], {
              raw: node.props.raw,
              closed: String(node.props.closed),
              tool: node.props.tool_name,
              command: node.props.command,
              args: JSON.stringify(
                Object.fromEntries(Object.entries(node.props.args).sort())
              ),
            }),
          ];
        case "generic_html":
          return [
            element(
              node.props.tagName.toLowerCase(),
              children(),
              node.props.attributes
            ),
          ];
        default:
          throw new UnsupportedAstNodeError(node.type);
      }
    })
  );
}

/** Read an inert HTML fragment supplied by the caller (jsdom in CLI/tests). */
export function normalizeHtml(fragment: DocumentFragment): SemanticNode[] {
  function visitChildren(parent: Node): SemanticNode[] {
    const result: SemanticNode[] = [];
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) {
        const value = child.nodeValue ?? "";
        if (value) result.push(text(value));
      } else if (child.nodeType === 8) {
        result.push({ type: "#comment", value: child.nodeValue ?? "" });
      } else if (child.nodeType === 1) {
        const childElement = child as Element;
        const tag = childElement.localName;
        result.push(
          element(
            tag,
            visitChildren(child),
            Object.fromEntries(
              Array.from(childElement.attributes, (attr) => [
                attr.name,
                attr.value,
              ])
            )
          )
        );
      } else {
        throw new Error("Unsupported HTML node type: " + child.nodeType);
      }
    }
    return mergeText(result);
  }
  return normalizeChildren(visitChildren(fragment), "#root");
}

export interface SemanticDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export function firstDifference(
  expected: unknown,
  actual: unknown,
  path = "$"
): SemanticDifference | undefined {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
      const difference = firstDifference(
        expected[i],
        actual[i],
        path + "[" + i + "]"
      );
      if (difference) return difference;
    }
    if (expected.length === actual.length) return;
    return {
      path: path + ".length",
      expected: expected.length,
      actual: actual.length,
    };
  }
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    for (const key of [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort()) {
      const difference = firstDifference(
        left[key],
        right[key],
        path + "." + key
      );
      if (difference) return difference;
    }
    return;
  }
  return { path, expected: expected ?? null, actual: actual ?? null };
}
