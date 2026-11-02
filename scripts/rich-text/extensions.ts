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

import { extensionCorpus, type ExtensionCase } from "./extension-corpus";
import {
  countResults,
  evaluateExample,
  type ParseOutcome,
  type CaseResult,
  type ReferenceOutput,
} from "./report";
import {
  firstDifference,
  normalizeHtml,
  type SemanticDifference,
} from "./semantics";
import { createReference } from "./reference";

type ExtensionResult = CaseResult &
  ExtensionCase & {
    library?: ReferenceOutput;
    libraryDifference?: SemanticDifference;
  };

export async function evaluateExtensions(
  parse: (markdown: string) => Promise<ParseOutcome>,
  fragment: (html: string) => DocumentFragment
) {
  const reference = createReference(fragment);
  const results: ExtensionResult[] = [];
  for (const [index, item] of extensionCorpus.entries()) {
    const expected = item.expected ?? normalizeHtml(fragment(item.html!));
    const result = evaluateExample(
      {
        example: index + 1,
        section: item.family,
        markdown: item.markdown,
        html: item.html ?? "",
        start_line: 0,
        end_line: 0,
      },
      expected,
      await parse(item.markdown),
      undefined,
      true
    );
    const library =
      item.family === "GFM" && item.librarySupport !== "unavailable"
        ? reference.extensions(item.markdown)
        : undefined;
    results.push({
      ...result,
      ...item,
      expected,
      ...(library
        ? {
            library,
            libraryDifference: firstDifference(expected, library.semantics),
          }
        : {}),
      reference: reference.compare(item.markdown),
    });
  }
  return {
    specification: "Authored GFM and AIO Hub project cases",
    sources: [
      "https://github.github.com/gfm/#tables-extension-",
      "https://github.github.com/gfm/#strikethrough-extension-",
      "https://github.github.com/gfm/#task-list-items-extension-",
    ],
    configuration: {
      preset: "commonmark",
      breaks: true,
      enabled: ["table", "strikethrough"],
      taskLists:
        "authored GFM expectations; markdown-it core has no task-list plugin",
      projectContract:
        "src/tools/rich-text-renderer/docs/markdown-syntax-contract.md",
    },
    summary: countResults(results),
    families: ["GFM", "project"].map((family) => ({
      family,
      ...countResults(results.filter((r) => r.family === family)),
    })),
    results,
  };
}

export function renderExtensions(
  report: Awaited<ReturnType<typeof evaluateExtensions>>
) {
  return [
    "# GFM 与项目扩展对照",
    "",
    "固定语料为项目自编示例；预期独立于 V2 和 markdown-it。GFM 表格/删除线对照启用 commonmark + breaks: true + table/strikethrough。任务列表使用 GFM 预期，库未安装相应插件。",
    "",
    "数学、思考、VCP 与附件按 markdown-syntax-contract.md 比较解析语义；组件渲染、资源解析和执行权限沿用专项测试。",
    "",
    ...report.families.map(
      (f) =>
        `${f.family}：${f.total} 例，一致 ${f.match}，差异 ${f.mismatch}，异常 ${f["parse-error"]}，超时 ${f.timeout}，适配器待支持 ${f["adapter-unsupported"]}。`
    ),
    "",
    "| 用例 | 契约 | V2 | 扩展参考库 | 首个差异 |",
    "| --- | --- | --- | --- | --- |",
    ...report.results.map(
      (r) =>
        `| ${r.id} | ${r.contract} | ${r.status} | ${r.library ? (r.libraryDifference ? "差异" : "一致") : r.family === "project" ? "项目契约" : "待接入插件"} | ${r.difference?.path ?? r.error ?? "—"} |`
    ),
    "",
    "extensions.json 保存每例输入、独立预期、库输出、V2 原始 AST 及差异路径。",
    "",
  ].join("\n");
}
