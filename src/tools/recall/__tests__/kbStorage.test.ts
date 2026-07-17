// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({
    load: mocks.load,
    save: mocks.save,
    saveDebounced: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (error) {
        mocks.handle(error);
        return null;
      }
    },
  }),
}));

import { KnowledgeStorage } from "../utils/recallStorage";

describe("KnowledgeStorage.deleteBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({
      version: "2.0.0",
      config: {},
      bases: [{ id: "base-a" }, { id: "base-b" }],
    });
    mocks.save.mockResolvedValue(undefined);
  });

  it("deletes through the scoped backend command and updates the workspace", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    const storage = new KnowledgeStorage();

    await expect(storage.deleteBase("base-a")).resolves.toBe(true);

    expect(mocks.invoke).toHaveBeenCalledWith("recall_delete_base", {
      recallId: "base-a",
    });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ bases: [{ id: "base-b" }] })
    );
  });

  it("reports failure without changing the workspace when deletion fails", async () => {
    const error = new Error("backend rejected deletion");
    mocks.invoke.mockRejectedValue(error);
    const storage = new KnowledgeStorage();

    await expect(storage.deleteBase("base-a")).resolves.toBe(false);

    expect(mocks.handle).toHaveBeenCalledWith(error);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
