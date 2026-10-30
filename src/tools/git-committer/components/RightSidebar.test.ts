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
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentRepoPath,
  repoStatuses,
  setRepoStatus,
} from "../composables/useGitCommitterState";
import type { GitCommitSummary } from "../types";
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

const makeCommit = (hash: string): GitCommitSummary => ({
  hash,
  author: "tester",
  email: "tester@example.com",
  date: "2026-01-01T00:00:00Z",
  message: `commit ${hash.slice(0, 4)}`,
});

const stubs = {
  CommitChart: true,
  // 透传插槽，保留默认插槽中的 commit-node 以便断言列表内容
  CommitDetailPopover: { template: "<div><slot /></div>" },
  FileIcon: true,
  "el-icon": true,
  "el-tooltip": true,
};

describe("RightSidebar", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
    currentRepoPath.value = repoPath;
    repoStatuses.value = { [repoPath]: { ...repoStatus } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    currentRepoPath.value = "";
    repoStatuses.value = {};
  });

  it("only reloads commit history after the current repository HEAD changes", async () => {
    const wrapper = mount(RightSidebar, { global: { stubs } });
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

  it("keeps the previous commit list visible while refreshing after HEAD changes", async () => {
    const oldCommits = [makeCommit("aaaaaaaa"), makeCommit("bbbbbbbb")];
    const newCommits = [makeCommit("cccccccc"), ...oldCommits];

    // 首屏：历史页返回旧提交，图表页返回空
    invokeMock.mockImplementation(async (_command, args) => {
      const { limit, skip } = args as { limit: number; skip: number };
      if (limit === 30 && skip === 0) return oldCommits;
      return [];
    });

    const wrapper = mount(RightSidebar, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll(".commit-node")).toHaveLength(oldCommits.length);

    // 模拟提交后慢速 IPC：新数据迟迟未返回
    let resolveSlow: (commits: GitCommitSummary[]) => void = () => {};
    invokeMock.mockImplementation(async (_command, args) => {
      const { limit, skip } = args as { limit: number; skip: number };
      if (limit === 30 && skip === 0) {
        return new Promise<GitCommitSummary[]>((resolve) => {
          resolveSlow = resolve;
        });
      }
      return [];
    });

    setRepoStatus(repoPath, {
      ...repoStatus,
      headCommitHash: "cccccccccccccccccccccccccccccccccccccccc",
    });
    await nextTick();
    await flushPromises();

    // 刷新进行中：旧列表不消失，也不出现整块加载占位
    expect(wrapper.findAll(".commit-node")).toHaveLength(oldCommits.length);
    expect(wrapper.find(".loading-wrapper").exists()).toBe(false);

    resolveSlow(newCommits);
    await flushPromises();

    // 新数据到达后无感替换为新列表
    expect(wrapper.findAll(".commit-node")).toHaveLength(newCommits.length);
    wrapper.unmount();
  });
  // 首屏只取一页；零尺寸和大视口都不能驱动后台连续读完整个仓库。
  it.each([0, 3000])(
    "loads only the first history page without scrolling (height %i)",
    async (height) => {
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
        height
      );
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
        height
      );
      const page = Array.from({ length: 30 }, (_, i) =>
        makeCommit(`commit-${i}`)
      );
      invokeMock.mockImplementation(async (_command, args) => {
        const { limit, skip } = args as { limit: number; skip: number };
        return limit === 30 && skip === 0 ? page : [];
      });
      const wrapper = mount(RightSidebar, { global: { stubs } });
      try {
        await flushPromises();
        // 布局或恢复滚动位置触发的顶部 scroll 同样不追加。
        await wrapper.find(".history-content").trigger("scroll");
        await flushPromises();
        const pages = invokeMock.mock.calls.filter(
          ([, args]) => (args as { limit: number }).limit === 30
        );
        expect(pages).toHaveLength(1);
        expect(wrapper.findAll(".commit-node")).toHaveLength(30);
      } finally {
        wrapper.unmount();
      }
    }
  );

  it("loads the next page on scrolling, ignores its late result while cached, and refreshes on return", async () => {
    const visible = ref(true);
    const Host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (visible.value ? h(RightSidebar) : null),
        }),
    });
    const page = Array.from({ length: 30 }, (_, i) =>
      makeCommit(`commit-${i}`)
    );
    let resolvePage!: (value: GitCommitSummary[]) => void;
    invokeMock.mockImplementation(async (_command, args) => {
      const { limit, skip } = args as { limit: number; skip: number };
      if (limit !== 30) return [];
      if (skip === 0) return page;
      return new Promise<GitCommitSummary[]>((resolve) => {
        resolvePage = resolve;
      });
    });
    const wrapper = mount(Host, { global: { stubs } });
    try {
      await flushPromises();
      const sidebar = wrapper.findComponent(RightSidebar);
      const history = wrapper.find(".history-content");
      Object.defineProperties(history.element, {
        clientHeight: { configurable: true, value: 300 },
        scrollHeight: { configurable: true, value: 1800 },
        scrollTop: { configurable: true, value: 1500 },
      });
      await history.trigger("scroll");
      await history.trigger("scroll");
      expect(
        invokeMock.mock.calls.filter(
          ([, args]) => (args as { skip: number }).skip === 30
        )
      ).toHaveLength(1);
      visible.value = false;
      await nextTick();
      const count = invokeMock.mock.calls.length;
      resolvePage([makeCommit("late-page")]);
      await flushPromises();
      expect(sidebar.findAll(".commit-node")).toHaveLength(30);
      setRepoStatus(repoPath, { ...repoStatus, headCommitHash: "new-head" });
      await flushPromises();
      expect(invokeMock).toHaveBeenCalledTimes(count);
      invokeMock.mockImplementation(async (_command, args) =>
        (args as { limit: number }).limit === 30
          ? [makeCommit("fresh-head")]
          : []
      );
      visible.value = true;
      await flushPromises();
      expect(wrapper.findAll(".commit-node")).toHaveLength(1);
      expect(wrapper.text()).toContain("commit fres");
    } finally {
      wrapper.unmount();
    }
  });

  it("preserves loaded history on return and stops an in-flight statistics scan when cached", async () => {
    const visible = ref(true);
    const Host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (visible.value ? h(RightSidebar) : null),
        }),
    });
    let resolveChart!: (value: GitCommitSummary[]) => void;
    let deferChart = false;
    invokeMock.mockImplementation(async (_command, args) => {
      if ((args as { limit: number }).limit === 30)
        return [makeCommit("original")];
      if (!deferChart) return [];
      return new Promise<GitCommitSummary[]>((resolve) => {
        resolveChart = resolve;
      });
    });
    const wrapper = mount(Host, { global: { stubs } });
    try {
      await flushPromises();
      const initialCount = invokeMock.mock.calls.length;
      visible.value = false;
      await nextTick();
      visible.value = true;
      await flushPromises();
      expect(invokeMock).toHaveBeenCalledTimes(initialCount);
      expect(wrapper.text()).toContain("commit orig");
      deferChart = true;
      setRepoStatus(repoPath, { ...repoStatus, headCommitHash: "new-head" });
      await flushPromises();
      visible.value = false;
      await nextTick();
      const count = invokeMock.mock.calls.length;
      resolveChart(
        Array.from({ length: 200 }, (_, i) => ({
          ...makeCommit(`stat-${i}`),
          date: new Date().toISOString(),
        }))
      );
      await flushPromises();
      expect(invokeMock).toHaveBeenCalledTimes(count);
    } finally {
      wrapper.unmount();
    }
  });
});
