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
import type { GitProgressEvent, StreamLoadOptions } from "../useGitLoader";

const loaderMocks = vi.hoisted(() => ({
  fetchBranches: vi.fn(),
  streamLoadRepository: vi.fn(),
  streamIncrementalLoad: vi.fn(),
  cancelLoadRepository: vi.fn(),
  cancelEnrich: vi.fn(),
  streamEnrichCommits: vi.fn(),
  updateCommitMessage: vi.fn(),
}));

vi.mock("../useGitLoader", () => loaderMocks);
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

import { useGitAnalyzerRunner } from "../useGitAnalyzerRunner";
import { useGitAnalyzerState } from "../useGitAnalyzerState";

const branches = [
  { name: "main", current: true, remote: false },
  { name: "feature", current: false, remote: false },
];

describe("git analyzer branch loading", () => {
  const state = useGitAnalyzerState();

  beforeEach(() => {
    vi.clearAllMocks();
    state.resetCommits();
    state.repoPath.value = "C:/repo";
    state.selectedBranch.value = "main";
    state.branches.value = branches;
    state.limitCount.value = 100;
    state.lastLoadedRepo.value = "";
    state.lastLoadedBranch.value = "";
    state.lastLoadedLimit.value = 0;

    loaderMocks.streamLoadRepository.mockImplementation(
      async (
        options: StreamLoadOptions,
        onProgress: (event: GitProgressEvent) => void
      ) => {
        onProgress({
          type: "start",
          total: 100,
          branches,
          branch: options.branch,
        });
      }
    );
  });

  it("loads the selected branch instead of resetting to the checked-out branch", async () => {
    const runner = useGitAnalyzerRunner();

    await expect(runner.onBranchChange("feature")).resolves.toBe(true);

    expect(loaderMocks.streamLoadRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "C:/repo",
        branch: "feature",
      }),
      expect.any(Function)
    );
    expect(state.selectedBranch.value).toBe("feature");
  });

  it("reflects the backend fallback when a saved branch is unavailable", async () => {
    loaderMocks.streamLoadRepository.mockImplementationOnce(
      async (
        _options: StreamLoadOptions,
        onProgress: (event: GitProgressEvent) => void
      ) => {
        onProgress({
          type: "start",
          total: 100,
          branches,
          branch: "main",
        });
      }
    );
    state.selectedBranch.value = "deleted-branch";

    await expect(useGitAnalyzerRunner().loadRepository()).resolves.toBe(true);

    expect(state.selectedBranch.value).toBe("main");
  });
});
