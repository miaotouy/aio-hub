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
import type { DiffTabRef, RepoSession } from "../types";
import { buildTabKey } from "../utils";
import {
  keepSessionTab,
  openSessionTab,
  shouldPreviewFile,
} from "../utils/gitTabs";

const file = (path: string): DiffTabRef => ({ path, isStaged: false });
const session = (): RepoSession => ({
  openTabs: [],
  activeTabPath: "",
  commitDraft: "draft",
});

describe("Git preview tabs", () => {
  it("uses Alt as a one-shot preview override without changing the configured default", () => {
    expect(shouldPreviewFile(true)).toBe(false);
    expect(shouldPreviewFile(true, { altKey: false })).toBe(false);
    expect(shouldPreviewFile(true, { altKey: true })).toBe(true);
    expect(shouldPreviewFile(false)).toBe(true);
    expect(shouldPreviewFile(false, { altKey: true })).toBe(true);
  });
  it("reuses the preview position while retaining fixed tabs on either side", () => {
    const state = session();
    openSessionTab(state, file("fixed-left.ts"));
    openSessionTab(state, file("preview-a.ts"), { preview: true });
    openSessionTab(state, file("fixed-right.ts"));
    openSessionTab(state, file("preview-b.ts"), { preview: true });
    expect(state.openTabs).toEqual([
      file("fixed-left.ts"),
      { ...file("preview-b.ts"), isPreview: true },
      file("fixed-right.ts"),
    ]);
    expect(state.activeTabPath).toBe(buildTabKey(file("preview-b.ts")));
    expect(state.commitDraft).toBe("draft");
  });

  it("keeps a preview in place without duplicating it and preserves it when another file is previewed", () => {
    const state = session();
    const first = file("first.ts");
    openSessionTab(state, first, { preview: true });
    keepSessionTab(state, first);
    openSessionTab(state, file("next.ts"), { preview: true });
    expect(state.openTabs).toEqual([
      first,
      { ...file("next.ts"), isPreview: true },
    ]);
  });

  it("does not downgrade a fixed tab or evict the preview when the fixed file is selected", () => {
    const state = session();
    const fixed = file("fixed.ts");
    openSessionTab(state, fixed);
    openSessionTab(state, file("preview.ts"), { preview: true });
    openSessionTab(state, fixed, { preview: true });
    expect(state.openTabs).toEqual([
      fixed,
      { ...file("preview.ts"), isPreview: true },
    ]);
    expect(state.activeTabPath).toBe(buildTabKey(fixed));
  });

  it("promotes an already open preview when opened explicitly as permanent", () => {
    const state = session();
    const target = file("target.ts");
    openSessionTab(state, target, { preview: true });
    openSessionTab(state, target);
    openSessionTab(state, file("next.ts"), { preview: true });
    expect(state.openTabs).toEqual([
      target,
      { ...file("next.ts"), isPreview: true },
    ]);
  });

  it("keeps worktree, staged, file content and different commits distinct for the same path", () => {
    const state = session();
    const tabs: DiffTabRef[] = [
      file("a.ts"),
      { path: "a.ts", isStaged: true },
      { ...file("a.ts"), viewMode: "file" },
      { ...file("a.ts"), commitHash: "commit-a" },
      { ...file("a.ts"), commitHash: "commit-b" },
    ];
    for (const tab of tabs) openSessionTab(state, tab);
    for (const tab of tabs) openSessionTab(state, tab, { preview: true });
    expect(state.openTabs).toEqual(tabs);
    expect(state.activeTabPath).toBe(buildTabKey(tabs[4]!));
  });

  it("isolates previews between repositories and resumes a saved preview alongside legacy fixed tabs", () => {
    const first = session();
    first.openTabs = [file("legacy.ts")];
    openSessionTab(first, file("preview.ts"), { preview: true });
    const restored: RepoSession = JSON.parse(JSON.stringify(first));
    const other = session();
    openSessionTab(other, file("other.ts"), { preview: true });
    openSessionTab(restored, file("replacement.ts"), { preview: true });
    expect(first.openTabs[1]?.path).toBe("preview.ts");
    expect(restored.openTabs).toEqual([
      file("legacy.ts"),
      { ...file("replacement.ts"), isPreview: true },
    ]);
    expect(other.openTabs).toEqual([{ ...file("other.ts"), isPreview: true }]);
  });
});
