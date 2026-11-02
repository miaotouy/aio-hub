// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

export const STREAM_TEXT_CONTAINERS =
  ".markdown-paragraph, .markdown-heading, .markdown-list-item, .markdown-html-block, .markdown-html-inline, .generic-node-wrapper > [data-node-id], .pure-markdown-renderer";
const EXCLUDED =
  "pre, code, table, script, style, noscript, template, form, button, input, select, option, textarea, iframe, audio, video, canvas, svg, math, [contenteditable]:not([contenteditable='false']), [role='button'], .katex, .markdown-code-block, .mermaid-node, .vcp-tool-node, .file-placeholder-preview, .audio-fallback-ctrl, [hidden], [aria-hidden='true']";

export function isStreamText(text: Text, html = false) {
  const parent = text.parentElement;
  return (
    !!parent &&
    !!text.data.trim() &&
    (html || !!parent.closest(STREAM_TEXT_CONTAINERS)) &&
    !parent.closest(EXCLUDED)
  );
}

/** Bounded DOM-order snapshots work for v-html replacement and iframe navigation. */
export function scanStreamText(root: Node, limit = 128) {
  const result: Text[] = [];
  if (root.nodeType === 3) {
    if (isStreamText(root as Text, true)) result.push(root as Text);
    return { texts: result, visited: 1 };
  }
  const doc = root.ownerDocument!;
  const walker = doc.createTreeWalker(root, 0xffffffff);
  let visited = 0;
  while (visited < limit && walker.nextNode()) {
    visited++;
    const node = walker.currentNode;
    if (node.nodeType === 3 && isStreamText(node as Text, true))
      result.push(node as Text);
  }
  return { texts: result, visited };
}

export function collectStreamText(root: Node, limit = 128) {
  return scanStreamText(root, limit).texts;
}
