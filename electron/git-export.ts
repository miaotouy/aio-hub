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

import type { GitCommit } from "../src/tools/git-analyzer/types";

function commitsArg(value: unknown): GitCommit[] {
  if (!Array.isArray(value) || value.length > 100000)
    throw new Error("提交列表无效或超过 100000 条，请缩小导出范围");
  for (const commit of value) {
    if (
      !commit ||
      typeof commit !== "object" ||
      ["hash", "author", "email", "date", "message"].some(
        (key) => typeof commit[key] !== "string"
      ) ||
      (commit.full_message != null && typeof commit.full_message !== "string")
    )
      throw new Error("提交数据缺少必要的文本字段，请重新加载后导出");
  }
  return value;
}
function html(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!
  );
}
export function exportCommits(args: Record<string, unknown>): string {
  const commits = commitsArg(args.commits);
  switch (args.format) {
    case "json":
      return JSON.stringify(commits, null, 2);
    case "csv":
      return (
        "Hash,Author,Email,Date,Message\n" +
        commits
          .map(
            (commit) =>
              [
                commit.hash,
                commit.author,
                commit.email,
                commit.date,
                commit.message,
              ]
                .map((value) => '"' + value.replaceAll('"', '""') + '"')
                .join(",") + "\n"
          )
          .join("")
      );
    case "markdown":
      return (
        "# Git Commits\n\n" +
        commits
          .map(
            (commit) =>
              "## " +
              commit.hash.slice(0, 7) +
              " - " +
              commit.message +
              "\n\n**Author:** " +
              commit.author +
              " <" +
              commit.email +
              ">\n**Date:** " +
              commit.date +
              "\n\n" +
              (commit.full_message ?? commit.message) +
              "\n\n---\n\n"
          )
          .join("")
      );
    case "html":
      return (
        '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Git Commits</title>' +
        "<style>body{font-family:monospace;padding:20px}.commit{margin-bottom:20px;padding:10px;border:1px solid #ddd}.hash{color:#0366d6;font-weight:bold}.author{color:#586069}.date{color:#6a737d}.message{margin-top:10px;white-space:pre-wrap}</style>" +
        "</head><body><h1>Git Commits</h1>\n" +
        commits
          .map(
            (commit) =>
              '<div class="commit"><span class="hash">' +
              html(commit.hash.slice(0, 7)) +
              '</span> <span class="author">' +
              html(commit.author) +
              '</span> <span class="date">' +
              html(commit.date) +
              '</span><div class="message">' +
              html(commit.message) +
              "</div></div>\n"
          )
          .join("") +
        "</body></html>"
      );
    default:
      throw new Error("请选择 json、csv、markdown 或 html 导出格式");
  }
}
