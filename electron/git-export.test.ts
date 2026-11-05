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

import { describe, expect, it } from "vitest";
import { GitCommands } from "./git";
import { exportCommits } from "./git-export";

const commit = {
  hash: "1234567890abcdef",
  author: 'A "quoted", 中文',
  email: 'x"y@example.test',
  date: "2026-11-05",
  message: 'fix: "quoted", title\nsecond line',
  full_message: "full body\n\n详细说明",
  parents: ["parent"],
  tags: ["v1"],
  branches: ["main"],
  stats: { additions: 3, deletions: 1, files: 1 },
  files: [{ path: "文档.txt", status: "modified", additions: 3, deletions: 1 }],
};
describe("Git commit exports", () => {
  it("exports JSON without requiring a repository and preserves enrichment metadata", async () => {
    const service = new GitCommands({ trash: async () => {} });
    try {
      const output = await service.runCommand(1, "git_export_commits", {
        commits: [commit],
        format: "json",
      });
      expect(JSON.parse(output as string)).toEqual([commit]);
    } finally {
      await service.shutdown();
    }
  });
  it("quotes every CSV field and preserves multiline messages and Markdown full bodies", () => {
    expect(exportCommits({ commits: [commit], format: "csv" })).toBe(
      'Hash,Author,Email,Date,Message\n"1234567890abcdef","A ""quoted"", 中文","x""y@example.test","2026-11-05","fix: ""quoted"", title\nsecond line"\n'
    );
    expect(exportCommits({ commits: [commit], format: "markdown" })).toContain(
      "full body\n\n详细说明\n\n---"
    );
    expect(
      exportCommits({
        commits: [{ ...commit, hash: "abc", full_message: undefined }],
        format: "markdown",
      })
    ).toContain("## abc - " + commit.message);
  });
  it("renders untrusted commit fields as HTML text and rejects invalid export inputs", () => {
    const output = exportCommits({
      commits: [
        {
          ...commit,
          author: '<svg onload="alert(1)">',
          message: "<script>&'\"",
        },
      ],
      format: "html",
    });
    expect(output).toContain("&lt;svg onload=&quot;alert(1)&quot;&gt;");
    expect(output).toContain(
      '<div class="message">&lt;script&gt;&amp;&#39;&quot;</div>'
    );
    expect(() =>
      exportCommits({ commits: [{ hash: "x" }], format: "json" })
    ).toThrow("文本字段");
    expect(() => exportCommits({ commits: [commit], format: "xml" })).toThrow(
      "导出格式"
    );
  });
});
