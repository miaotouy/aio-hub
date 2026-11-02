// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { vscodeLightInit, vscodeDarkInit } from "@uiw/codemirror-theme-vscode";

export const codeViewerFontFamily =
  'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace';
export const codeViewerLineHeight = 1.4;

// Keep source glyphs stable when async highlighting adds Markdown emphasis.
const sourceStyles = [
  {
    tag: [tags.heading, tags.strong, tags.emphasis],
    fontWeight: "normal",
    fontStyle: "normal",
  },
];
export const codeViewerLightTheme = vscodeLightInit({ styles: sourceStyles });
export const codeViewerDarkTheme = vscodeDarkInit({ styles: sourceStyles });

// style-mod retains mounted rules for the document lifetime, so all viewers share this theme.
export const codeViewerTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent !important",
  },
  ".cm-scroller": {
    fontFamily: codeViewerFontFamily,
    lineHeight: codeViewerLineHeight,
  },
  ".cm-content": {
    fontWeight: "normal",
    fontStyle: "normal",
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "0 12px 0 4px",
  },
});
