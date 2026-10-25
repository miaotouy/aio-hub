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
export interface CaseResult extends SpecExample {
  status: CaseStatus;
  expected: SemanticNode[];
  actual?: SemanticNode[];
  difference?: SemanticDifference;
  error?: string;
  unsupportedNode?: string;
  rawAst?: AstNode[];
}

export function evaluateExample(
  example: SpecExample,
  expected: SemanticNode[],
  outcome: ParseOutcome
): CaseResult {
  if (outcome.status !== "parsed") return { ...example, expected, ...outcome };
  let actual: SemanticNode[];
  try {
    actual = normalizeAst(outcome.ast);
  } catch (error) {
    if (!(error instanceof UnsupportedAstNodeError)) throw error;
    return {
      ...example,
      expected,
      status: "adapter-unsupported",
      error: error.message,
      unsupportedNode: error.nodeType,
      rawAst: outcome.ast,
    };
  }
  const difference = firstDifference(expected, actual);
  return {
    ...example,
    expected,
    actual,
    status: difference ? "mismatch" : "match",
    ...(difference ? { difference } : {}),
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

export function createReport(
  results: CaseResult[],
  runtime: { bun: string; timeoutMs: number },
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
      "static AST semantics; raw HTML leaf nodes and project-specific nodes may be adapter-unsupported; no UI rendering",
    generatedAt,
    runtime,
    summary: countResults(results),
    sections: [...new Set(results.map((result) => result.section))].map(
      (section) => ({
        section,
        ...countResults(results.filter((result) => result.section === section)),
      })
    ),
    results,
  };
}

export function renderMarkdown(
  report: ReturnType<typeof createReport>
): string {
  const { summary } = report;
  const rows = report.sections.map(
    (s) =>
      "| " +
      [
        s.section,
        s.total,
        s.match,
        s.mismatch,
        s["parse-error"],
        s.timeout,
        s["adapter-unsupported"],
      ].join(" | ") +
      " |"
  );
  const failures = report.results
    .filter((result) => result.status !== "match")
    .map((result) => {
      const d = result.difference;
      const info = d
        ? d.path +
          ": expected=" +
          JSON.stringify(d.expected) +
          ", actual=" +
          JSON.stringify(d.actual)
        : result.error;
      const encoded = JSON.stringify(info) ?? "";
      const delimiter = "`".repeat(
        Math.max(0, ...(encoded.match(/`+/g) ?? []).map((run) => run.length)) +
          1
      );
      return (
        "- Example " +
        result.example +
        " (" +
        result.section +
        ", " +
        result.status +
        "): " +
        delimiter +
        " " +
        encoded +
        " " +
        delimiter
      );
    });
  return [
    "# CommonMark 规范差异报告",
    "",
    "生成时间：" + report.generatedAt,
    "",
    "规范：CommonMark " +
      report.version +
      "；解析器：" +
      report.parser +
      "；Bun " +
      report.runtime.bun +
      "；单例解析超时 " +
      report.runtime.timeoutMs +
      " ms。",
    "",
    "共 " +
      summary.total +
      " 例：语义一致 " +
      summary.match +
      "，差异 " +
      summary.mismatch +
      "，解析异常 " +
      summary["parse-error"] +
      "，超时 " +
      summary.timeout +
      "，适配器待支持 " +
      summary["adapter-unsupported"] +
      "。",
    "",
    "全体用例语义一致率：" +
      (summary.total
        ? ((100 * summary.match) / summary.total).toFixed(2)
        : "0.00") +
      "%。所有状态均计入分母。",
    "",
    "比较范围：静态 AST 的文本、嵌套、列表段落包装与起始编号、链接属性和代码内容。相邻文本节点合并，结构容器的排版空白和 br 后的一个排版 LF 被忽略。",
    "",
    "原始 HTML 叶节点和项目交互节点缺少映射时单列为适配器待支持。预期 HTML 通过惰性 DOM 片段解析；此报告用于定位解析语义差异，最终 DOM、HTML 沙箱与安全策略仍需专项验证。",
    "",
    "## 按规范章节汇总",
    "",
    "| 章节 | 总数 | 一致 | 差异 | 异常 | 超时 | 适配器待支持 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    "## 差异索引",
    "",
    "JSON 明细 report.json 保存每例的原始 Markdown、官方 HTML、语义树和首个差异路径，可按 example 编号检索。",
    "",
    ...failures,
    "",
    "## 数据来源与许可",
    "",
    "CommonMark " +
      report.version +
      "：" +
      report.source +
      "；John MacFarlane and CommonMark contributors；规范与用例采用 CC BY-SA 4.0。",
    "",
  ].join("\n");
}
