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

import type { SemanticNode } from "./semantics";

export interface ExtensionCase {
  id: string;
  family: "GFM" | "project";
  contract: string;
  markdown: string;
  html?: string;
  expected?: SemanticNode[];
  /** markdown-it core has no task-list rule; use the authored GFM expectation. */
  librarySupport?: "unavailable";
}
const t = (value: string): SemanticNode => ({ type: "#text", value });
const e = (
  type: string,
  children: SemanticNode[] = [],
  attrs?: Record<string, string>
): SemanticNode => ({ type, ...(attrs ? { attrs } : {}), children });
const request =
  "<<<[TOOL_REQUEST]>>>\ntool_name:「始」Demo「末」\ntext:「始」hello「末」\n<<<[END_TOOL_REQUEST]>>>";

/** Authored examples, not copies of specification examples. Expectations stay independent of both parsers. */
export const extensionCorpus: ExtensionCase[] = [
  {
    id: "table-alignment",
    family: "GFM",
    contract: "表头、列对齐、数据行保持对应",
    markdown: "| Name | Count |\n| :--- | ---: |\n| apple | 7 |",
    html: '<table><thead><tr><th>Name</th><th align="right">Count</th></tr></thead><tbody><tr><td>apple</td><td align="right">7</td></tr></tbody></table>',
  },
  {
    id: "table-empty-cells",
    family: "GFM",
    contract: "空单元格保留列位置",
    markdown: "| A | B | C |\n| --- | :---: | ---: |\n| | middle | |",
    html: '<table><thead><tr><th>A</th><th align="center">B</th><th align="right">C</th></tr></thead><tbody><tr><td></td><td align="center">middle</td><td align="right"></td></tr></tbody></table>',
  },
  {
    id: "table-ragged-rows",
    family: "GFM",
    contract: "缺失列补空，超出表头宽度的列忽略",
    markdown: "A | B\n--- | ---\none\ntwo | three | extra",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>one</td><td></td></tr><tr><td>two</td><td>three</td></tr></tbody></table>",
  },
  {
    id: "table-final-row",
    family: "GFM",
    contract: "无末尾管道符或回车时仍保留最后一格",
    markdown: "A | B\n--- | ---\nlast | value",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>last</td><td>value</td></tr></tbody></table>",
  },
  {
    id: "table-literal-pipes",
    family: "GFM",
    contract: "转义和实体产生的管道符留在单元格中",
    markdown: "A | B\n--- | ---\nleft\\|right | &#124;",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>left|right</td><td>|</td></tr></tbody></table>",
  },
  {
    id: "table-inline-markup",
    family: "GFM",
    contract: "数据行以行内格式开头仍属于表格",
    markdown: "A | B\n--- | ---\n**bold** | ~~old~~",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><strong>bold</strong></td><td><s>old</s></td></tr></tbody></table>",
  },
  {
    id: "table-invalid-delimiter",
    family: "GFM",
    contract: "无有效分隔行时保留正文与可见换行",
    markdown: "A | B\n--- | typo",
    html: "<p>A | B<br>--- | typo</p>",
  },
  {
    id: "table-header-width",
    family: "GFM",
    contract: "表头与分隔行列数不同，保留正文",
    markdown: "A | B\n--- | --- | ---",
    html: "<p>A | B<br>--- | --- | ---</p>",
  },
  {
    id: "table-code-pipe",
    family: "GFM",
    contract: "代码单元格中的转义管道符显示字面量管道",
    markdown: "A | B\n--- | ---\n`left\\|right` | value",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>left|right</code></td><td>value</td></tr></tbody></table>",
  },
  {
    id: "table-inline-html",
    family: "GFM",
    contract: "行内 HTML 可以位于数据行开头",
    markdown: "A | B\n--- | ---\n<span>label</span> | value",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><span>label</span></td><td>value</td></tr></tbody></table>",
  },
  {
    id: "table-literal-edge-spaces",
    family: "GFM",
    contract: "实体产生的空格保留在单元格内容中",
    markdown: "A | B\n--- | ---\n&#32;edge&#32; | value\n&#32; | &#32;",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td> edge </td><td>value</td></tr><tr><td> </td><td> </td></tr></tbody></table>",
  },
  {
    id: "table-entity-delimiter",
    family: "GFM",
    contract: "实体生成的连字符保持正文，不能充当表格分隔行",
    markdown: "A | B\n--- | &#45;",
    html: "<p>A | B<br>--- | -</p>",
  },
  {
    id: "strikethrough",
    family: "GFM",
    contract: "双波浪线删除线允许内部强调",
    markdown: "keep ~~old **value**~~",
    html: "<p>keep <s>old <strong>value</strong></s></p>",
  },
  {
    id: "task-list",
    family: "GFM",
    contract: "任务标记产生只读复选框，分别保留选中和未选中状态",
    markdown: "- [ ] pending\n- [x] done",
    html: '<ul><li><input type="checkbox" disabled=""> pending</li><li><input type="checkbox" checked="" disabled=""> done</li></ul>',
    librarySupport: "unavailable",
  },
  {
    id: "visible-line-break",
    family: "project",
    contract: "单回车为可见换行，空白行分隔段落",
    markdown: "first\nsecond\n\nthird",
    html: "<p>first<br>second</p><p>third</p>",
  },
  {
    id: "math-dollar-inline",
    family: "project",
    contract: "美元符号公式保留 LaTeX 源码",
    markdown: "value $x+1$",
    expected: [e("p", [t("value "), e("katex_inline", [t("x+1")])])],
  },
  {
    id: "math-dollar-block",
    family: "project",
    contract: "双美元符号公式形成块级节点",
    markdown: "$$x+1$$",
    expected: [e("katex_block", [t("x+1")])],
  },
  {
    id: "math-parentheses",
    family: "project",
    contract: "兼容简单 MathJax 行内公式",
    markdown: "\\(x+1\\)",
    expected: [e("p", [e("katex_inline", [t("x+1")])])],
  },
  {
    id: "math-unclosed",
    family: "project",
    contract: "未闭合美元标记保留为正文",
    markdown: "price $later",
    html: "<p>price $later</p>",
  },
  {
    id: "thinking-block",
    family: "project",
    contract: "默认 think 标签保存原文并解析内部 Markdown",
    markdown: "<think>check **carefully**</think>",
    expected: [
      e("llm_think", [e("p", [t("check "), e("strong", [t("carefully")])])], {
        tag: "think",
        raw: "check **carefully**",
        thinking: "false",
      }),
    ],
  },
  {
    id: "thinking-unclosed",
    family: "project",
    contract: "未闭合 think 内容可见且保持思考中状态",
    markdown: "<think>working",
    expected: [
      e("llm_think", [e("p", [t("working")])], {
        tag: "think",
        raw: "working",
        thinking: "true",
      }),
    ],
  },
  {
    id: "extension-code-boundary",
    family: "project",
    contract: "行内代码中的公式、思考标签和 VCP 标记保持字面量",
    markdown: "`$x$ <think>raw</think> <<<[TOOL_REQUEST]>>>`",
    html: "<p><code>$x$ &lt;think&gt;raw&lt;/think&gt; &lt;&lt;&lt;[TOOL_REQUEST]&gt;&gt;&gt;</code></p>",
  },
  {
    id: "vcp-request",
    family: "project",
    contract: "完整请求保留原文、工具名、参数及闭合状态；解析仅供展示",
    markdown: request,
    expected: [
      e("vcp_tool", [], {
        raw: request,
        closed: "true",
        tool: "Demo",
        command: "",
        args: '{"text":"hello"}',
      }),
    ],
  },
  {
    id: "attachment-boundaries",
    family: "project",
    contract: "裸占位符交给 TextNode，图片目标保留引用，代码保留字面量",
    markdown: "【file::doc】 ![preview](【file::pic】) `【file::pic】`",
    html: '<p>【file::doc】 <img src="【file::pic】" alt="preview"> <code>【file::pic】</code></p>',
  },
];
