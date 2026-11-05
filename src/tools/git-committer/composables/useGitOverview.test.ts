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
import { refreshStatus } from "./useGitCommitterRunner";
import {
  createBranch,
  saveStash,
  pushTag,
  repoOverview,
} from "./useGitOverview";
vi.mock("./useGitCommitterRunner", () => ({
  refreshStatus: vi.fn(async () => {}),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));
const overview = {
  path: "E:/fixture/repo",
  branch: "main",
  tags: [],
  branches: [],
  stashes: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  repoOverview.value = null;
});
describe("Git overview action results", () => {
  it.each([null, undefined])(
    "refreshes the overview after a successful void response (%s)",
    async (response) => {
      vi.mocked(invoke).mockImplementation(async (command) =>
        command === "git_get_repo_overview" ? overview : response
      );
      expect(await createBranch(overview.path, "codex/new")).toBe(true);
      expect(invoke).toHaveBeenNthCalledWith(1, "git_create_branch", {
        path: overview.path,
        branchName: "codex/new",
        startPoint: null,
      });
      expect(invoke).toHaveBeenNthCalledWith(2, "git_get_repo_overview", {
        path: overview.path,
      });
      expect(repoOverview.value).toEqual(overview);
    }
  );
  it("refreshes worktree status as well as the overview after saving a stash", async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "git_get_repo_overview" ? overview : null
    );
    expect(await saveStash(overview.path, "work in progress", true)).toBe(true);
    expect(refreshStatus).toHaveBeenCalledExactlyOnceWith(overview.path);
    expect(repoOverview.value).toEqual(overview);
  });
  it("keeps failure distinguishable and retries only the requested tag push", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(Error("remote fixture rejected"));
    expect(await pushTag(overview.path, "v1.0.0", "origin")).toBe(false);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("git_push_tag", {
      path: overview.path,
      tagName: "v1.0.0",
      remoteName: "origin",
    });
    expect(refreshStatus).not.toHaveBeenCalled();
    expect(repoOverview.value).toBeNull();
    vi.mocked(invoke).mockResolvedValueOnce(null);
    expect(await pushTag(overview.path, "v1.0.0", "origin")).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
