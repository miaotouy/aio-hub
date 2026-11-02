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
import { mount } from "@vue/test-utils";
import { ref, nextTick } from "vue";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar.vue";
import {
  currentRepoPath,
  repoStatuses,
  repoSessions,
  singleClickOpensPermanentTab,
} from "../composables/useGitCommitterState";
import { openDiffTab, openFileTab } from "../composables/useGitCommitterRunner";

vi.mock("../composables/useGitCommitterRunner", () => ({
  stageFile: vi.fn(),
  unstageFile: vi.fn(),
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  discardFile: vi.fn(),
  discardFiles: vi.fn(),
  openDiffTab: vi.fn(),
  openFileTab: vi.fn(),
  openChangesTab: vi.fn(),
  openRepoPromptTab: vi.fn(),
}));
vi.mock("../composables/useGitRepoWorkflow", () => ({
  useGitRepoWorkflow: () => ({
    isGenerating: ref(false),
    isCommitting: ref(false),
    draft: ref(""),
    generateMsg: vi.fn(),
    abortGenerateMsg: vi.fn(),
    commit: vi.fn(),
  }),
}));
vi.mock("../composables/useGitFileContextMenu", () => ({
  useGitFileContextMenu: () => ({ showFileMenu: vi.fn() }),
}));
vi.mock("../composables/useGitOverview", () => ({
  commitAmend: vi.fn(),
  undoLastCommit: vi.fn(),
}));

const stubs = {
  LlmModelSelector: true,
  FileIcon: true,
  ElCollapse: { template: "<div><slot /></div>" },
  ElCollapseItem: { template: "<section><slot /></section>" },
  ElTooltip: { template: "<span><slot /></span>" },
  ElButton: { template: "<button><slot /></button>" },
  ElButtonGroup: { template: "<div><slot /></div>" },
  ElDropdown: { template: "<div><slot /></div>" },
  ElInput: true,
};

describe("Sidebar file opening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRepoPath.value = "E:/repos/preview-test";
    repoSessions.value = {};
    singleClickOpensPermanentTab.value = false;
    repoStatuses.value = {
      [currentRepoPath.value]: {
        branch: "main",
        headCommitHash: "abc",
        ahead: 0,
        behind: 0,
        staged: [{ path: "staged.ts", status: "M", isBinary: false }],
        unstaged: [
          { path: "changed.ts", status: "M", isBinary: false },
          { path: "new.ts", status: "A", isBinary: false },
        ],
      },
    };
  });
  afterEach(() => {
    currentRepoPath.value = "";
    repoStatuses.value = {};
    repoSessions.value = {};
    singleClickOpensPermanentTab.value = false;
  });

  it("previews staged/worktree diffs and new file contents, and fixes them on double click", async () => {
    const wrapper = mount(Sidebar, { global: { stubs } });
    const rows = wrapper.findAll(".file-item");
    await rows[0]!.trigger("click");
    expect(openDiffTab).toHaveBeenLastCalledWith("staged.ts", true, {
      preview: true,
    });
    await rows[1]!.trigger("click");
    expect(openDiffTab).toHaveBeenLastCalledWith("changed.ts", false, {
      preview: true,
    });
    await rows[2]!.trigger("click");
    expect(openFileTab).toHaveBeenLastCalledWith("new.ts", false, {
      preview: true,
    });
    await rows[0]!.trigger("dblclick");
    expect(openDiffTab).toHaveBeenLastCalledWith("staged.ts", true);
    await rows[1]!.trigger("dblclick");
    expect(openDiffTab).toHaveBeenLastCalledWith("changed.ts", false, {
      preview: false,
    });
    await rows[2]!.trigger("dblclick");
    expect(openFileTab).toHaveBeenLastCalledWith("new.ts", false, {
      preview: false,
    });
    wrapper.unmount();
  });

  it("temporarily previews staged/worktree diffs and new files with Alt while keeping the permanent preference", async () => {
    singleClickOpensPermanentTab.value = true;
    const wrapper = mount(Sidebar, { global: { stubs } });
    const rows = wrapper.findAll(".file-item");
    await rows[0]!.trigger("click", { altKey: true });
    expect(openDiffTab).toHaveBeenLastCalledWith("staged.ts", true, {
      preview: true,
    });
    await rows[1]!.trigger("click", { altKey: true });
    expect(openDiffTab).toHaveBeenLastCalledWith("changed.ts", false, {
      preview: true,
    });
    await rows[2]!.trigger("click", { altKey: true });
    expect(openFileTab).toHaveBeenLastCalledWith("new.ts", false, {
      preview: true,
    });
    await rows[1]!.trigger("click");
    expect(openDiffTab).toHaveBeenLastCalledWith("changed.ts", false, {
      preview: false,
    });
    expect(singleClickOpensPermanentTab.value).toBe(true);
    wrapper.unmount();
  });

  it("applies the permanent-click preference immediately and keeps existing previews", async () => {
    const wrapper = mount(Sidebar, { global: { stubs } });
    repoSessions.value[currentRepoPath.value] = {
      openTabs: [{ path: "existing.ts", isStaged: false, isPreview: true }],
      activeTabPath: "W:existing.ts",
      commitDraft: "",
    };
    singleClickOpensPermanentTab.value = true;
    await nextTick();
    await wrapper.findAll(".file-item")[1]!.trigger("click");
    expect(openDiffTab).toHaveBeenLastCalledWith("changed.ts", false, {
      preview: false,
    });
    expect(repoSessions.value[currentRepoPath.value]!.openTabs).toEqual([
      { path: "existing.ts", isStaged: false },
    ]);
    wrapper.unmount();
  });

  it("keeps file-content action button clicks separate from the row double-click action", async () => {
    const wrapper = mount(Sidebar, { global: { stubs } });
    const action = wrapper
      .findAll(".file-item")[1]!
      .find(".file-actions button");
    await action.trigger("click");
    await action.trigger("dblclick");
    expect(openFileTab).toHaveBeenCalledExactlyOnceWith("changed.ts");
    expect(openDiffTab).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
