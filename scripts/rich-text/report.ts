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

import {
  firstDifference,
  normalizeAst,
  UnsupportedAstNodeError,
  type SemanticDifference,
  type SemanticNode,
} from "./semantics";
import type { AstNode } from "../../src/tools/rich-text-renderer/types";

export interface SpecExample {
  example: number;
  section: string;
  markdown: string;
  html: string;
  start_line: number;
  end_line: number;
}
export type ParseOutcome =
  | { status: "parsed"; ast: AstNode[] }
  | { status: "parse-error" | "timeout"; error: string };
export type CaseStatus =
  "match" | "mismatch" | "parse-error" | "timeout" | "adapter-unsupported";
export type Classification =
  | "match"
  | "product-convention"
  | "pending-contract"
  | "parser-difference"
  | "reference-difference"
  | "adapter-unsupported"
  | "parse-error"
  | "timeout";
export interface ReferenceOutput {
  html: string;
  semantics: SemanticNode[];
}
export interface ReferenceComparison {
  commonmark: ReferenceOutput;
  project: ReferenceOutput;
}
export interface CaseResult extends SpecExample {
  /** Historical strict comparison with official HTML. */
  status: CaseStatus;
  classification: Classification;
  expected: SemanticNode[];
  actual?: SemanticNode[];
  reference?: ReferenceComparison;
  officialDefaultDifference?: SemanticDifference;
  productConfigurationDifference?: SemanticDifference;
  projectDifference?: SemanticDifference;
  difference?: SemanticDifference;
  error?: string;
  unsupportedNode?: string;
  rawAst?: AstNode[];
}

// The owner's trailing-newline preference remains open. Only a single br at
// the end of the final top-level paragraph qualifies; earlier paragraphs stay strict.
function onlyPendingTrailingBreak(
  example: SpecExample,
  actual: SemanticNode[],
  project: SemanticNode[]
) {
  if (!/[^\n]\n$/.test(example.markdown)) return false;
  const last = actual.at(-1);
  if (last?.type !== "p" || last.children?.at(-1)?.type !== "br") return false;
  const withoutTrailingBreak = [
    ...actual.slice(0, -1),
    { ...last, children: last.children.slice(0, -1) },
  ];
  return !firstDifference(project, withoutTrailingBreak);
}

export function evaluateExample(
  example: SpecExample,
  expected: SemanticNode[],
  outcome: ParseOutcome,
  reference?: ReferenceComparison,
  projectNodes = false
): CaseResult {
  const officialDefaultDifference =
    reference && firstDifference(expected, reference.commonmark.semantics);
  const productConfigurationDifference =
    reference &&
    firstDifference(
      reference.commonmark.semantics,
      reference.project.semantics
    );
  const base = {
    ...example,
    expected,
    ...(reference ? { reference } : {}),
    ...(officialDefaultDifference ? { officialDefaultDifference } : {}),
    ...(productConfigurationDifference
      ? { productConfigurationDifference }
      : {}),
  };
  if (outcome.status !== "parsed")
    return { ...base, ...outcome, classification: outcome.status };
  const rawAst = outcome.ast;
  let actual: SemanticNode[];
  try {
    actual = normalizeAst(rawAst, projectNodes);
  } catch (error) {
    if (!(error instanceof UnsupportedAstNodeError)) throw error;
    return {
      ...base,
      rawAst,
      status: "adapter-unsupported",
      classification: "adapter-unsupported",
      error: error.message,
      unsupportedNode: error.nodeType,
    };
  }
  const difference = firstDifference(expected, actual);
  const projectDifference =
    reference && firstDifference(reference.project.semantics, actual);
  let classification: Classification;
  if (!reference) classification = difference ? "parser-difference" : "match";
  else if (officialDefaultDifference) classification = "reference-difference";
  else if (!projectDifference)
    classification = difference ? "product-convention" : "match";
  else if (
    onlyPendingTrailingBreak(example, actual, reference.project.semantics)
  )
    classification = "pending-contract";
  else classification = "parser-difference";
  return {
    ...base,
    rawAst,
    actual,
    classification,
    status: difference ? "mismatch" : "match",
    ...(difference ? { difference } : {}),
    ...(officialDefaultDifference ? { officialDefaultDifference } : {}),
    ...(productConfigurationDifference
      ? { productConfigurationDifference }
      : {}),
    ...(projectDifference ? { projectDifference } : {}),
  };
}

export function countResults(results: CaseResult[]) {
  const counts: Record<CaseStatus, number> = {
    match: 0,
    mismatch: 0,
    "parse-error": 0,
    timeout: 0,
    "adapter-unsupported": 0,
  };
  for (const result of results) counts[result.status]++;
  return { total: results.length, ...counts };
}
export function countClassifications(results: CaseResult[]) {
  const counts: Record<Classification, number> = {
    match: 0,
    "product-convention": 0,
    "pending-contract": 0,
    "parser-difference": 0,
    "reference-difference": 0,
    "adapter-unsupported": 0,
    "parse-error": 0,
    timeout: 0,
  };
  for (const result of results) counts[result.classification]++;
  return counts;
}

export function createReport(
  results: CaseResult[],
  runtime: { bun: string; timeoutMs: number; markdownIt?: string },
  generatedAt = new Date().toISOString()
) {
  return {
    specification: "CommonMark",
    version: "0.31.2",
    source: "https://spec.commonmark.org/0.31.2/spec.json",
    attribution:
      "John MacFarlane and CommonMark contributors; specification examples: CC BY-SA 4.0",
    parser: "CustomParser.parse (default project options)",
    comparison:
      "static AST semantics; explicit project node mappings; raw HTML leaf nodes may be adapter-unsupported; no UI rendering",
    referenceConfiguration: {
      preset: "commonmark",
      official: { breaks: false },
      project: { breaks: true },
    },
    generatedAt,
    runtime,
    summary: countResults(results),
    classifications: countClassifications(results),
    // These independent axes remain visible even when multiple differences coexist.
    comparisonSummary: {
      officialDefaultDifferences: results.filter(
        (r) => r.officialDefaultDifference
      ).length,
      productConfigurationDifferences: results.filter(
        (r) => r.productConfigurationDifference
      ).length,
      projectMatches: results.filter(
        (r) => r.actual && r.reference && !r.projectDifference
      ).length,
      projectDifferences: results.filter((r) => r.projectDifference).length,
    },
    sections: [...new Set(results.map((r) => r.section))].map((section) => ({
      section,
      ...countResults(results.filter((r) => r.section === section)),
      classifications: countClassifications(
        results.filter((r) => r.section === section)
      ),
    })),
    results,
  };
}

export function renderMarkdown(
  report: ReturnType<typeof createReport>
): string {
  const { summary: s, classifications: c, comparisonSummary: axes } = report;
  const rows = report.sections.map(
    (s) =>
      `| ${[s.section, s.total, s.match, s.classifications["product-convention"], s.classifications["pending-contract"], s.classifications["parser-difference"], s.classifications["reference-difference"], s["adapter-unsupported"], s["parse-error"] + s.timeout].join(" | ")} |`
  );
  const failures = report.results
    .filter((r) => r.classification !== "match")
    .map((r) => {
      const d =
        r.classification === "reference-difference"
          ? r.officialDefaultDifference
          : (r.projectDifference ?? r.difference);
      const info = d
        ? `${d.path}: expected=${JSON.stringify(d.expected)}, actual=${JSON.stringify(d.actual)}`
        : r.error;
      const encoded = JSON.stringify(info) ?? "";
      const delimiter = "`".repeat(
        Math.max(0, ...(encoded.match(/`+/g) ?? []).map((run) => run.length)) +
          1
      );
      return `- Example ${r.example} (${r.section}, ${r.classification}; strict=${r.status}): ${delimiter} ${encoded} ${delimiter}`;
    });
  return [
    "# CommonMark 规范差异报告",
    "",
    "生成时间：" + report.generatedAt,
    "",
    `规范：CommonMark ${report.version}；解析器：${report.parser}；Bun ${report.runtime.bun}；markdown-it ${report.runtime.markdownIt ?? "unknown"}；单例解析超时 ${report.runtime.timeoutMs} ms。`,
    "",
    `共 ${s.total} 例：官方严格一致 ${s.match}，差异 ${s.mismatch}，解析异常 ${s["parse-error"]}，超时 ${s.timeout}，适配器待支持 ${s["adapter-unsupported"]}。`,
    "",
    `官方严格一致率：${s.total ? ((100 * s.match) / s.total).toFixed(2) : "0.00"}%。所有状态均计入分母。`,
    "",
    "## 同输入对照与分类",
    "",
    "markdown-it 使用 commonmark preset，分别输出 breaks: false（官方默认）和 breaks: true（项目段内可见换行）。文本、代码、嵌套、段落包装和属性保持严格比较。",
    "",
    `已确认产品约定 ${c["product-convention"]}；末尾换行约定待确认 ${c["pending-contract"]}；实际解析差异 ${c["parser-difference"]}；参考库与官方差异 ${c["reference-difference"]}。`,
    "",
    `独立比较轴：参考库默认输出与官方有差异 ${axes.officialDefaultDifferences}；breaks 配置改变输出 ${axes.productConfigurationDifferences}；V2 与项目配置参考库一致 ${axes.projectMatches}，有差异 ${axes.projectDifferences}。`,
    "",
    "产品约定仅在 V2 完整匹配 breaks: true 且参考库默认输出匹配官方时成立。末尾换行待确认仅识别最终顶层段落多出一个 br 的情形，其他语义必须一致。混合差异继续保留项目对照路径。参考库与官方有分歧时单列复核。",
    "",
    "## 按规范章节汇总",
    "",
    "| 章节 | 总数 | 官方一致 | 产品约定 | 末尾待确认 | 解析差异 | 参考库差异 | 适配器待支持 | 异常/超时 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    "## 差异索引",
    "",
    "report.json 保留原始输入、官方 HTML、markdown-it 两种配置的 HTML/语义树、V2 原始 AST/语义树，以及各比较轴的首个差异。extensions.json / extensions.md 单独记录 GFM 与项目扩展。",
    "",
    "比较范围为静态解析语义；相邻文本合并，结构容器排版空白和 br 后一个排版 LF 被忽略。原始 HTML 通过惰性 DOM 解析，最终 DOM、附件解析、交互和安全策略沿用相应组件验证。",
    "",
    ...failures,
    "",
    "## 数据来源与许可",
    "",
    `CommonMark ${report.version}：${report.source}；John MacFarlane and CommonMark contributors；规范与用例采用 CC BY-SA 4.0。`,
    "",
  ].join("\n");
}
