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
import {
  buildCommitPromptMessages,
  COMMIT_LANGUAGE_MACRO,
  normalizeGeneratedCommitMessage,
  parseRemoteInfo,
  renderCommitPromptMacros,
  resolvePersistedPrompt,
  resolveSystemPrompt,
} from "../utils";

describe("git-committer system prompt inheritance", () => {
  it("prefers a non-empty repository prompt", () => {
    expect(resolveSystemPrompt("Use English commit messages.", "global")).toBe(
      "Use English commit messages."
    );
  });

  it("falls back to the global prompt when the repository prompt is empty", () => {
    expect(resolveSystemPrompt(undefined, "global")).toBe("global");
    expect(resolveSystemPrompt("  \n", "global")).toBe("global");
  });
});

describe("git-committer prompt construction", () => {
  it("separates instructions, repository context, diff data, and final task", () => {
    const messages = buildCommitPromptMessages({
      systemPrompt: `  write in ${COMMIT_LANGUAGE_MACRO}  `,
      language: "English",
      branch: "main",
      files: [
        { path: "src/app.ts", status: "M" },
        { path: "README.md", status: "A" },
      ],
      isStaged: true,
      diff: "+const enabled = true;",
    });

    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({
      role: "system",
      content: "write in English",
    });
    expect(messages[1].content).toContain("当前分支：main");
    expect(messages[1].content).toContain("变更来源：暂存区");
    expect(messages[1].content).toContain("- [M] src/app.ts");
    expect(messages[1].content).not.toContain("+const enabled = true;");
    expect(messages[2].content).toContain("<git_diff>");
    expect(messages[2].content).toContain("+const enabled = true;");
    expect(messages[3].content).toContain("仅输出最终 Conventional Commit");
  });

  it("labels unstaged changes explicitly", () => {
    const messages = buildCommitPromptMessages({
      systemPrompt: "rules",
      language: "简体中文",
      branch: "",
      files: [{ path: "src/app.ts", status: "M" }],
      isStaged: false,
      diff: "diff",
    });

    expect(messages[1].content).toContain("当前分支：未知");
    expect(messages[1].content).toContain("工作区（未暂存）");
  });
});

describe("git-committer generated message normalization", () => {
  it("removes leading whitespace before the first real character", () => {
    expect(
      normalizeGeneratedCommitMessage("\n\n  fix(ui): 修复按钮显示\n\n正文")
    ).toBe("fix(ui): 修复按钮显示\n\n正文");
  });

  it("does not alter an already clean message", () => {
    expect(normalizeGeneratedCommitMessage("feat: 添加功能")).toBe(
      "feat: 添加功能"
    );
  });
});

describe("git-committer language macro", () => {
  it("replaces every language macro and falls back for blank settings", () => {
    expect(
      renderCommitPromptMacros(
        `${COMMIT_LANGUAGE_MACRO}/${COMMIT_LANGUAGE_MACRO}`,
        "日本語"
      )
    ).toBe("日本語/日本語");
    expect(renderCommitPromptMacros(COMMIT_LANGUAGE_MACRO, "  ")).toBe(
      "简体中文"
    );
  });
});

describe("git-committer persisted prompt migration", () => {
  const newDefault = "new default";
  const legacyDefault = "legacy default";

  it("upgrades empty and legacy built-in prompts", () => {
    expect(resolvePersistedPrompt(undefined, newDefault, [legacyDefault])).toBe(
      newDefault
    );
    expect(
      resolvePersistedPrompt(`  ${legacyDefault}  `, newDefault, [
        legacyDefault,
      ])
    ).toBe(newDefault);
  });

  it("preserves a user-customized prompt", () => {
    expect(
      resolvePersistedPrompt("  use English  ", newDefault, [legacyDefault])
    ).toBe("use English");
  });
});

describe("git-committer remote platform detection", () => {
  it("detects GitHub from both scp and https remotes", () => {
    expect(
      parseRemoteInfo("git@github.com:miaotouy/aiohub.git")?.buildCommitUrl(
        "abc123"
      )
    ).toBe("https://github.com/miaotouy/aiohub/commit/abc123");
    expect(
      parseRemoteInfo("https://github.com/miaotouy/aiohub.git")?.name
    ).toBe("GitHub");
  });

  it("uses the gitlab subgroup commit path", () => {
    expect(
      parseRemoteInfo("https://gitlab.com/group/sub/repo.git")?.buildCommitUrl(
        "abc123"
      )
    ).toBe("https://gitlab.com/group/sub/repo/-/commit/abc123");
  });

  it("detects other known hosts", () => {
    expect(parseRemoteInfo("git@bitbucket.org:team/repo.git")?.name).toBe(
      "Bitbucket"
    );
    expect(parseRemoteInfo("https://gitee.com/team/repo.git")?.name).toBe(
      "Gitee"
    );
  });

  it("returns null for unknown hosts, missing repo path, or empty remotes", () => {
    expect(parseRemoteInfo("git@git.internal.corp:team/repo.git")).toBeNull();
    expect(parseRemoteInfo("https://github.com")).toBeNull();
    expect(parseRemoteInfo("")).toBeNull();
  });
});
