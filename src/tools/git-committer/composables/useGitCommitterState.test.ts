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
import { nextTick } from "vue";
import { validate as validateUuid } from "uuid";

const storage = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: (options: { createDefault: () => object }) => ({
    load: async () => ({
      ...options.createDefault(),
      ...structuredClone(storage.data),
    }),
    saveDebounced: (config: object) => {
      storage.data = JSON.parse(JSON.stringify(config));
    },
  }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn() }),
}));

beforeEach(() => {
  vi.resetModules();
  storage.data = {};
});

describe("Git 仓库持久身份", () => {
  it("添加时分配独立 UUID，重复导入、修改别名及重新加载均保留身份", async () => {
    const state = await import("./useGitCommitterState");
    await state.loadRepositories();
    const path = "E:/repos/项目";
    expect(state.addRepository({ path, name: "项目" })).toBe(true);
    expect(state.addRepository({ path: "E:/other/项目", name: "项目" })).toBe(
      true
    );
    const ids = state.repositories.value.map((repo) => repo.id);
    expect(ids.every(validateUuid)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(
      state.addRepository({ path: "e:\\repos\\项目\\", name: "项目" })
    ).toBe(false);
    state.repositories.value[0].alias = "新的别名🚀";
    await nextTick();

    vi.resetModules();
    const reloaded = await import("./useGitCommitterState");
    await reloaded.loadRepositories();
    expect(reloaded.repositories.value.map((repo) => repo.id)).toEqual(ids);
    expect(reloaded.repositories.value[0].alias).toBe("新的别名🚀");
    expect(reloaded.repositories.value[0].path).toBe(path);
    await nextTick();
  });

  it("迁移旧配置时修复缺失、无效和重复身份，保留会话草稿及已有合法 UUID", async () => {
    const id = "5c329c36-38e1-4c22-a5e7-39f6d8b5df08";
    const path = "E:/repos/项目调查笔记";
    const session = {
      openTabs: [{ path: "notes.md", isStaged: true }],
      activeTabPath: "notes.md",
      commitDraft: "docs: 保留草稿",
    };
    storage.data = {
      repositories: [
        {
          path,
          name: "项目调查笔记",
          alias: "笔记",
          systemPrompt: "保留提示词",
        },
        { path: "/tmp/existing", name: "existing", id },
        { path: "/tmp/duplicate", name: "duplicate", id: id.toUpperCase() },
        { path: "/tmp/invalid", name: "invalid", id: "中文身份" },
      ],
      currentRepoPath: path,
      repoSessions: { [path]: session },
    };
    const state = await import("./useGitCommitterState");
    await state.loadRepositories();
    await nextTick();
    const ids = state.repositories.value.map((repo) => repo.id);
    expect(ids.every(validateUuid)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    expect(ids[1]).toBe(id);
    expect(state.currentRepoPath.value).toBe(path);
    expect(state.repoSessions.value[path]).toEqual(session);
    expect(state.repositories.value[0]).toMatchObject({
      path,
      alias: "笔记",
      systemPrompt: "保留提示词",
    });

    vi.resetModules();
    const reloaded = await import("./useGitCommitterState");
    await reloaded.loadRepositories();
    expect(reloaded.repositories.value.map((repo) => repo.id)).toEqual(ids);
    expect(reloaded.repoSessions.value[path]).toEqual(session);
    await nextTick();
  });
});
