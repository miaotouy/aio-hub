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

import { flushPromises, mount } from "@vue/test-utils";
import { invoke } from "@tauri-apps/api/core";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentRepoPath,
  repoStatuses,
  setRepoStatus,
} from "../composables/useGitCommitterState";
import RightSidebar from "./RightSidebar.vue";

vi.mock("../composables/useGitCommitterRunner", () => ({
  openCommitChangesTab: vi.fn(),
  openCommitFileDiffTab: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const repoPath = "E:/repos/demo";
const repoStatus = {
  branch: "main",
  headCommitHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  staged: [],
  unstaged: [],
  ahead: 0,
  behind: 0,
};

describe("RightSidebar", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
    currentRepoPath.value = repoPath;
    repoStatuses.value = { [repoPath]: { ...repoStatus } };
  });

  afterEach(() => {
    currentRepoPath.value = "";
    repoStatuses.value = {};
  });

  it("only reloads commit history after the current repository HEAD changes", async () => {
    const wrapper = mount(RightSidebar, {
      global: {
        stubs: {
          CommitChart: true,
          CommitDetailPopover: true,
          FileIcon: true,
          "el-icon": true,
          "el-tooltip": true,
        },
      },
    });
    await nextTick();
    await flushPromises();

    const initialCallCount = invokeMock.mock.calls.length;

    // Worktree/staging refreshes replace RepoStatus without changing the commit history.
    setRepoStatus(repoPath, {
      ...repoStatus,
      unstaged: [{ path: "README.md", status: "M", isBinary: false }],
    });
    await nextTick();
    await flushPromises();
    expect(invokeMock).toHaveBeenCalledTimes(initialCallCount);

    setRepoStatus(repoPath, {
      ...repoStatus,
      headCommitHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await nextTick();
    await flushPromises();

    expect(invokeMock.mock.calls.length).toBeGreaterThan(initialCallCount);
    expect(invokeMock).toHaveBeenLastCalledWith("git_get_incremental_commits", {
      path: repoPath,
      branch: "main",
      skip: 0,
      limit: 200,
    });
    wrapper.unmount();
  });
});
