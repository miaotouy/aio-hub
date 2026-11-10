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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@/platform/native/core";
import { createOpenAiHeaders } from "@/llm-apis/adapters/openai/headers";
import type { LlmProfile } from "@/types/llm-profiles";
import { generateCommitMessage } from "./useGitCommitterRunner";
import {
  addRepository,
  defaultModel,
  repositories,
  repoStatuses,
} from "./useGitCommitterState";

const { sendRequest, reportError } = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest }),
}));
vi.mock("@/llm-apis/common", () => ({ isAbortError: () => false }));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("./useGitCommitterErrorHandler", () => ({
  errorHandler: {
    wrapAsync: (operation: () => Promise<unknown>) => operation(),
    error: reportError,
  },
}));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({ saveDebounced: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  defaultModel.value = "fixture-profile:fixture-model";
  repositories.value = [];
  repoStatuses.value = {};
  vi.mocked(invoke).mockResolvedValue({
    original: "const value = 1;",
    modified: "const value = 2;",
    isBinary: false,
  });
});

describe("Git 提交信息生成的请求头兼容性", () => {
  it.each([
    "E:/works/GitStudyNotes/项目调查笔记",
    "C:\\repos\\项目🚀（副本）",
    "/tmp/ordinary-repository",
  ])("仓库 %s 可构造请求头并独立关联连续生成", async (repoPath) => {
    addRepository({ path: repoPath, name: repoPath.split(/[/\\]/).pop()! });
    const repositoryId = repositories.value[0].id;
    repoStatuses.value[repoPath] = {
      branch: "main",
      headCommitHash: "",
      staged: [{ path: "example.ts", status: "M", isBinary: false }],
      unstaged: [],
      ahead: 0,
      behind: 0,
    };
    const requestIds: string[] = [];
    const content = "fix: update fixture";
    sendRequest.mockImplementation(async ({ requestId, onStream }) => {
      // 经过真实适配器构造与浏览器 Headers 校验，覆盖发送前的编码失败。
      const headers = new Headers(
        createOpenAiHeaders(
          { apiKeys: [] } as unknown as LlmProfile,
          requestId,
          () => ({})
        )
      );
      const headerId = headers.get("X-Request-ID");
      expect(headerId).toBeTruthy();
      requestIds.push(headerId!);
      onStream(content);
      return { content };
    });
    const onStream = vi.fn();

    for (let index = 0; index < 2; index += 1) {
      expect(await generateCommitMessage(repoPath, onStream)).toBe(content);
    }

    expect(new Set(requestIds).size).toBe(2);
    for (const requestId of requestIds) {
      expect(requestId).toContain(repositoryId);
    }
    expect(onStream.mock.calls).toEqual([[content], [content]]);
    expect(reportError).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("git_get_file_diff", {
      path: repoPath,
      filePath: "example.ts",
      isStaged: true,
    });
  });
});
