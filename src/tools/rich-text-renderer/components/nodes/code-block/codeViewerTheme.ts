// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { EditorView } from "@codemirror/view";

export const codeViewerFontFamily =
  'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace';
export const codeViewerLineHeight = 1.4;

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
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "0 12px 0 4px",
  },
});
