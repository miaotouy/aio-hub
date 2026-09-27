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
  buildCommitContextMenuItems,
  buildCommitFileContextMenuItems,
  buildFileContextMenuItems,
  buildRepoContextMenuItems,
  buildTabContextMenuItems,
} from "../contextMenus";
import type { DiffTabRef, RepositoryConfig } from "../types";

const repo: RepositoryConfig = {
  path: "C:/work/demo",
  name: "demo",
};

const ids = (items: ReturnType<typeof buildRepoContextMenuItems>) =>
  items.filter((item) => !item.separator).map((item) => item.id);

describe("buildRepoContextMenuItems", () => {
  it("contains the full repository action set", () => {
    expect(ids(buildRepoContextMenuItems(repo, { isCurrent: false }))).toEqual([
      "repo:open",
      "repo:reveal",
      "repo:refresh",
      "repo:pull",
      "repo:push",
      "repo:alias",
      "repo:color",
      "repo:prompt",
      "repo:remove",
    ]);
  });

  it("disables opening the repository when it is already current", () => {
    const items = buildRepoContextMenuItems(repo, { isCurrent: true });
    expect(items.find((i) => i.id === "repo:open")?.disabled).toBe(true);
  });

  it("marks removal as danger", () => {
    const items = buildRepoContextMenuItems(repo, { isCurrent: false });
    expect(items.find((i) => i.id === "repo:remove")?.danger).toBe(true);
  });
});

describe("buildTabContextMenuItems", () => {
  const workspaceDiffTab: DiffTabRef = { path: "src/a.ts", isStaged: false };
  const stagedDiffTab: DiffTabRef = { path: "src/a.ts", isStaged: true };
  const fileViewTab: DiffTabRef = {
    path: "src/a.ts",
    isStaged: false,
    viewMode: "file",
  };
  const commitFileTab: DiffTabRef = {
    path: "src/a.ts",
    isStaged: false,
    commitHash: "abc1234",
  };

  it("always offers the close group and disables close-others for a single tab", () => {
    const items = buildTabContextMenuItems(workspaceDiffTab, {
      openCount: 1,
      tabsAfter: 0,
    });
    expect(items.find((i) => i.id === "tab:close-others")?.disabled).toBe(true);
    expect(items.find((i) => i.id === "tab:close-right")?.disabled).toBe(true);
    expect(items.find((i) => i.id === "tab:close-all")?.disabled).toBeFalsy();
  });

  it("disables close-right only for the last tab", () => {
    const last = buildTabContextMenuItems(workspaceDiffTab, {
      openCount: 3,
      tabsAfter: 0,
    });
    const middle = buildTabContextMenuItems(workspaceDiffTab, {
      openCount: 3,
      tabsAfter: 1,
    });
    expect(last.find((i) => i.id === "tab:close-right")?.disabled).toBe(true);
    expect(middle.find((i) => i.id === "tab:close-right")?.disabled).toBe(
      false
    );
  });

  it("offers staging for workspace tabs and unstaging for staged tabs", () => {
    const workspace = buildTabContextMenuItems(workspaceDiffTab, {
      openCount: 2,
      tabsAfter: 0,
    });
    const staged = buildTabContextMenuItems(stagedDiffTab, {
      openCount: 2,
      tabsAfter: 0,
    });
    expect(ids(workspace)).toContain("tab:stage");
    expect(ids(workspace)).not.toContain("tab:unstage");
    expect(ids(staged)).toContain("tab:unstage");
    expect(ids(staged)).not.toContain("tab:stage");
  });

  it("offers view toggling based on the current view mode", () => {
    const diff = buildTabContextMenuItems(workspaceDiffTab, {
      openCount: 2,
      tabsAfter: 0,
    });
    const file = buildTabContextMenuItems(fileViewTab, {
      openCount: 2,
      tabsAfter: 0,
    });
    expect(ids(diff)).toContain("tab:open-file");
    expect(ids(diff)).not.toContain("tab:open-diff");
    expect(ids(file)).toContain("tab:open-diff");
    expect(ids(file)).not.toContain("tab:open-file");
  });

  it("offers both absolute and relative path copying for file tabs", () => {
    const items = buildTabContextMenuItems(workspaceDiffTab, {
      openCount: 2,
      tabsAfter: 0,
    });
    const list = ids(items);
    expect(list).toContain("tab:copy-path");
    expect(list).toContain("tab:copy-relative");
  });

  it("omits staging actions for commit tabs but keeps hash copying", () => {
    const items = buildTabContextMenuItems(commitFileTab, {
      openCount: 2,
      tabsAfter: 0,
    });
    const list = ids(items);
    expect(list).toContain("tab:copy-hash");
    expect(list).not.toContain("tab:stage");
    expect(list).not.toContain("tab:unstage");
  });

  it("only offers the close group for overview tabs", () => {
    const overview: DiffTabRef = { path: "__changes__", isStaged: true };
    const items = buildTabContextMenuItems(overview, {
      openCount: 2,
      tabsAfter: 0,
    });
    const list = ids(items);
    expect(list).toContain("tab:close-all");
    expect(list).not.toContain("tab:copy-path");
    expect(list).not.toContain("tab:stage");
  });
});

describe("buildFileContextMenuItems", () => {
  it("offers staging and discard for workspace files", () => {
    const items = buildFileContextMenuItems(
      { path: "src/a.ts", status: "M" },
      false
    );
    const list = ids(items);
    expect(list).toContain("file:stage");
    expect(list).toContain("file:discard");
    expect(list).not.toContain("file:unstage");
    expect(list).toContain("file:copy-path");
    expect(list).toContain("file:copy-relative");
  });

  it("offers unstaging for staged files without discard", () => {
    const items = buildFileContextMenuItems(
      { path: "src/a.ts", status: "M" },
      true
    );
    const list = ids(items);
    expect(list).toContain("file:unstage");
    expect(list).not.toContain("file:stage");
    expect(list).not.toContain("file:discard");
  });

  it("disables file-content view and reveal for deleted files", () => {
    const items = buildFileContextMenuItems(
      { path: "src/gone.ts", status: "D" },
      false
    );
    expect(items.find((i) => i.id === "file:open-file")?.disabled).toBe(true);
    expect(items.find((i) => i.id === "file:reveal")?.disabled).toBe(true);
    expect(items.find((i) => i.id === "file:open-diff")?.disabled).toBeFalsy();
  });
});

describe("buildCommitContextMenuItems", () => {
  it("adapts the expand label to the current state", () => {
    const collapsed = buildCommitContextMenuItems({ isExpanded: false });
    const expanded = buildCommitContextMenuItems({ isExpanded: true });
    expect(
      collapsed.find((i) => i.id === "commit:toggle-expand")?.label
    ).toContain("展开");
    expect(
      expanded.find((i) => i.id === "commit:toggle-expand")?.label
    ).toContain("收起");
  });

  it("contains copy and remote actions", () => {
    const list = ids(buildCommitContextMenuItems({ isExpanded: false }));
    expect(list).toEqual([
      "commit:open-changes",
      "commit:toggle-expand",
      "commit:copy-hash",
      "commit:copy-message",
      "commit:open-remote",
    ]);
  });
});

describe("buildCommitFileContextMenuItems", () => {
  it("offers diff opening and both path copying variants", () => {
    expect(ids(buildCommitFileContextMenuItems())).toEqual([
      "commit-file:open-diff",
      "commit-file:copy-path",
      "commit-file:copy-relative",
    ]);
  });
});
