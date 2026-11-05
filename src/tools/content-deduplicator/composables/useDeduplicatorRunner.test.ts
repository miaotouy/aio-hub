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
import { customMessage } from "@/utils/customMessage";
import { useContentDeduplicatorStore } from "../stores/store";
import { useDeduplicatorRunner } from "./useDeduplicatorRunner";
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
const first = "C:\\fixture\\one.txt",
  second = "C:\\fixture\\two.txt";
function prepare() {
  const store = useContentDeduplicatorStore();
  store.scanPath = "C:\\fixture";
  const file = (path: string) => ({
    path,
    name: path,
    size: 4,
    modified: 1,
    extension: "txt",
    isText: true,
  });
  store.setResult({
    groups: [
      {
        id: "group-1",
        representativeFile: file("C:\\fixture\\keep.txt"),
        similarFiles: [first, second].map((path) => ({
          file: file(path),
          similarity: 1,
          matchType: "exact" as const,
          diffSummary: null,
        })),
        metadata: {
          isSuspicious: false,
          totalWastedBytes: 8,
          avgSimilarity: 1,
        },
      },
    ],
    statistics: {
      totalFilesScanned: 3,
      totalTextFiles: 3,
      totalGroups: 1,
      totalDuplicates: 2,
      totalWastedBytes: 8,
    },
    skippedFiles: [],
  });
  store.selectedPaths = new Set([first, second]);
  return { store, runner: useDeduplicatorRunner() };
}
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});
describe("content deduplicator task results", () => {
  it("accepts void stop acknowledgements as success", async () => {
    const { store, runner } = prepare();
    store.isScanning = true;
    vi.mocked(invoke).mockResolvedValue(null);
    await runner.stopScan();
    expect(invoke).toHaveBeenCalledWith("stop_dedup_scan");
    expect(store.isScanning).toBe(false);
    expect(customMessage.success).toHaveBeenCalled();
  });
  it("preserves previous results and selections after cancellation", async () => {
    const { store, runner } = prepare();
    vi.mocked(invoke).mockRejectedValue(
      Object.assign(new Error("扫描已被用户取消"), {
        code: "DEDUP_SCAN_CANCELLED",
      })
    );
    expect(await runner.scanDirectory()).toBeNull();
    expect(store.result?.statistics.totalDuplicates).toBe(2);
    expect([...store.selectedPaths]).toEqual([first, second]);
    expect(store.isScanning).toBe(false);
    expect(customMessage.error).not.toHaveBeenCalled();
  });
  it("removes only explicitly completed paths after a partial deletion", async () => {
    const { store, runner } = prepare();
    vi.mocked(invoke).mockResolvedValue({
      successCount: 1,
      errorCount: 0,
      errors: [],
      freedSpace: 4,
      cleanedPaths: [first],
      cancelled: true,
    });
    await runner.deleteSelected();
    expect(
      store.result?.groups[0].similarFiles.map((f) => f.file.path)
    ).toEqual([second]);
    expect([...store.selectedPaths]).toEqual([second]);
    expect(store.result?.statistics.totalWastedBytes).toBe(4);
  });
  it("retains failed Windows drive paths returned by older hosts", async () => {
    const { store, runner } = prepare();
    vi.mocked(invoke).mockResolvedValue({
      successCount: 1,
      errorCount: 1,
      errors: ["移入回收站失败 " + second + ": busy"],
      freedSpace: 4,
    });
    await runner.deleteSelected();
    expect(
      store.result?.groups[0].similarFiles.map((f) => f.file.path)
    ).toEqual([second]);
    expect([...store.selectedPaths]).toEqual([second]);
  });
  it("keeps active deletion state when duplicate actions arrive", async () => {
    const { store, runner } = prepare();
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = runner.deleteSelected();
    expect(store.isDeleting).toBe(true);
    expect(await runner.deleteSelected()).toBeNull();
    expect(await runner.scanDirectory()).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(store.isDeleting).toBe(true);
    finish({
      successCount: 2,
      errorCount: 0,
      errors: [],
      freedSpace: 8,
      cleanedPaths: [first, second],
    });
    await pending;
    expect(store.isDeleting).toBe(false);
    expect(store.result?.groups).toEqual([]);
  });
});
