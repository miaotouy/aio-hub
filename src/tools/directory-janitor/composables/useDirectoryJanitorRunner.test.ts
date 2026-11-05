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
import { createPinia, setActivePinia } from "pinia";
import { invoke } from "@/platform/native/core";
import { useDirectoryJanitorStore } from "../stores/store";
import { useDirectoryJanitorRunner } from "./useDirectoryJanitorRunner";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/platform/native/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));
vi.mock("@/platform/native/path", () => ({ sep: () => "/", homeDir: vi.fn() }));
const first = "E:/fixture/a",
  second = "E:/fixture/a-long";
function prepare() {
  const store = useDirectoryJanitorStore();
  store.allItems = [first, second].map((path) => ({
    path,
    name: path,
    isDir: false,
    size: 4,
    modified: 0,
  }));
  store.selectedPaths = new Set([first, second]);
  return { store, runner: useDirectoryJanitorRunner() };
}
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});
describe("directory janitor partial-operation results", () => {
  it("retains untouched rows and selections when cleanup is cancelled after one file", async () => {
    const { store, runner } = prepare();
    vi.mocked(invoke).mockResolvedValue({
      successCount: 1,
      errorCount: 0,
      freedSpace: 4,
      errors: [],
      cleanedPaths: [first],
      cancelled: true,
    });
    await runner.cleanupItems([first, second]);
    expect(store.allItems.map((item) => item.path)).toEqual([second]);
    expect([...store.selectedPaths]).toEqual([second]);
    expect(store.isCleaning).toBe(false);
  });
  it("uses explicit completed paths even when a failed filename contains the successful filename", async () => {
    const { store, runner } = prepare();
    vi.mocked(invoke).mockResolvedValue({
      successCount: 1,
      errorCount: 1,
      freedSpace: 4,
      errors: ["failed " + second],
      cleanedPaths: [first],
    });
    await runner.cleanupItems([first, second]);
    expect(store.allItems.map((item) => item.path)).toEqual([second]);
  });
  it("keeps previous results intact after an acknowledged scan cancellation", async () => {
    const { store, runner } = prepare();
    vi.mocked(invoke).mockRejectedValue(
      Object.assign(new Error("扫描已被用户取消"), {
        code: "DIRECTORY_SCAN_CANCELLED",
      })
    );
    expect(await runner.analyzePath({ path: "E:/fixture" })).toBeNull();
    expect(store.allItems.map((item) => item.path)).toEqual([first, second]);
    expect(invoke).toHaveBeenCalledWith(
      "analyze_directory_for_cleanup",
      expect.objectContaining({ path: "E:/fixture" })
    );
    expect(store.isAnalyzing).toBe(false);
    expect(store.showProgress).toBe(false);
  });
  it("keeps the running cleanup active when a duplicate action is requested", async () => {
    const { store, runner } = prepare();
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const firstCall = runner.cleanupItems([first]);
    expect(store.isCleaning).toBe(true);
    const duplicate = runner.cleanupItems([second]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await duplicate).toBeNull();
    expect(store.isCleaning).toBe(true);
    finish({
      successCount: 1,
      errorCount: 0,
      freedSpace: 4,
      errors: [],
      cleanedPaths: [first],
    });
    await firstCall;
    expect(store.isCleaning).toBe(false);
    expect(store.allItems.map((item) => item.path)).toEqual([second]);
  });
  it("removes displayed descendants of a recycled directory without affecting sibling names", async () => {
    const { store, runner } = prepare();
    const folder = "/fixture/cache",
      child = folder + "/child",
      sibling = folder + "-other",
      literal = folder + "\\literal";
    store.allItems = [folder, child, sibling, literal].map((path) => ({
      path,
      name: path,
      isDir: path === folder,
      size: 4,
      modified: 0,
    }));
    store.selectedPaths = new Set([folder]);
    vi.mocked(invoke).mockResolvedValue({
      successCount: 1,
      errorCount: 0,
      freedSpace: 4,
      errors: [],
      cleanedPaths: [folder],
    });
    await runner.cleanupItems([folder]);
    expect(store.allItems.map((item) => item.path)).toEqual([sibling, literal]);
  });
});
