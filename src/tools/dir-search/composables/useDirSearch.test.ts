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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { invoke } from "@/platform/native/core";
import { listen } from "@/platform/native/events";
import { useDirSearch } from "./useDirSearch";
vi.mock("@/platform/native/events", () => ({ listen: vi.fn() }));
vi.mock("@vueuse/core", () => ({ watchDebounced: vi.fn() }));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("./useDirSearchUiState", async () => {
  const { ref } = await import("vue");
  return {
    useDirSearchUiState: () =>
      Object.fromEntries(
        Object.entries({
          lastRootPath: "C:/fixture",
          pattern: "needle",
          replacement: "changed",
          isRegex: false,
          caseSensitive: true,
          wholeWord: false,
          includeGlobs: "",
          excludeGlobs: "",
          useGitignore: false,
          preserveCase: false,
          showReplace: false,
          maxResults: 1000,
          autoExpandResults: true,
          contextLinesEnabled: false,
          contextLinesCount: 2,
          isLoaded: true,
          searchHistory: [],
          replacementHistory: [],
          directoryHistory: [],
          includeHistory: [],
          excludeHistory: [],
        }).map(([key, value]) => [key, ref(value)])
      ),
  };
});
let scope: ReturnType<typeof effectScope>,
  search: ReturnType<typeof useDirSearch>;
let events: Map<string, (event: { payload: any }) => void>;
const response = (searchId: string) => ({
  searchId,
  filesScanned: 1,
  filesMatched: 1,
  totalMatches: 1,
  bytesRead: 6,
  durationMs: 1,
  stopReason: "completed",
  truncated: false,
  cancelled: false,
});
beforeEach(() => {
  vi.clearAllMocks();
  events = new Map();
  vi.mocked(listen).mockImplementation(async (name, handler) => {
    events.set(name, handler as any);
    return () => {
      events.delete(name);
    };
  });
  scope = effectScope();
  search = scope.run(() => useDirSearch())!;
});
afterEach(() => {
  search.dispose();
  scope.stop();
});
describe("directory search UI lifecycle", () => {
  it("flushes the matching final result batch before clearing listeners", async () => {
    vi.mocked(invoke).mockImplementation(async (command, args: any) => {
      if (command !== "dir_search") return null as any;
      const id = args.request.searchId;
      events.get("dir-search-result-batch")?.({
        payload: {
          searchId: "other",
          results: [{ filePath: "other", matches: [] }],
        },
      });
      events.get("dir-search-result-batch")?.({
        payload: {
          searchId: id,
          results: [
            {
              filePath: "a",
              relativePath: "a",
              matches: [
                {
                  lineNumber: 1,
                  lineContent: "needle",
                  matchStart: 0,
                  matchEnd: 6,
                },
              ],
            },
          ],
        },
      });
      return response(id) as any;
    });
    await search.executeSearch();
    expect(search.totalMatches.value).toBe(1);
    expect(search.resultsList.value.map((file) => file.filePath)).toEqual([
      "a",
    ]);
    expect(search.isSearching.value).toBe(false);
    expect(events.size).toBe(0);
  });
  it("cancels the active search when the tool is disposed and ignores its later completion", async () => {
    let finish!: (value: any) => void;
    let id = "";
    vi.mocked(invoke).mockImplementation(async (command, args: any) => {
      if (command === "dir_search") {
        id = args.request.searchId;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return null as any;
    });
    const pending = search.executeSearch();
    await vi.waitFor(() => expect(id).not.toBe(""));
    search.dispose();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("dir_search_cancel", { searchId: id })
    );
    expect(search.isSearching.value).toBe(false);
    finish(response(id));
    await pending;
    expect(search.summary.value).toBeNull();
    expect(events.size).toBe(0);
    await search.executeSearch();
    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "dir_search")
    ).toHaveLength(1);
  });
  it("does not start a native search after cancellation during listener registration", async () => {
    let release!: (value: () => void) => void;
    vi.mocked(listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    vi.mocked(invoke).mockResolvedValue(null);
    const pending = search.executeSearch();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await search.cancelSearch();
    release(vi.fn());
    await pending;
    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "dir_search")
    ).toHaveLength(0);
    expect(search.isSearching.value).toBe(false);
    expect(events.size).toBe(0);
  });
  it("waits for the prior search to settle before invoking its replacement", async () => {
    let finish!: (value: any) => void;
    let firstId = "";
    vi.mocked(invoke).mockImplementation(async (command, args: any) => {
      if (command === "dir_search_cancel") return null as any;
      if (!firstId) {
        firstId = args.request.searchId;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return response(args.request.searchId) as any;
    });
    const first = search.executeSearch();
    await vi.waitFor(() => expect(firstId).not.toBe(""));
    const next = search.executeSearch();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("dir_search_cancel", {
        searchId: firstId,
      })
    );
    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "dir_search")
    ).toHaveLength(1);
    finish({ ...response(firstId), cancelled: true, stopReason: "cancelled" });
    await first;
    await next;
    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "dir_search")
    ).toHaveLength(2);
    expect(search.summary.value?.searchId).not.toBe(firstId);
  });
  it("invalidates only the selected file preview after accepted replacement", async () => {
    const path = "C:/fixture/notes.txt";
    const file = {
      filePath: path,
      relativePath: "notes.txt",
      matches: [
        { lineNumber: 1, lineContent: "needle", matchStart: 0, matchEnd: 6 },
      ],
    };
    search.results.value.set(path, file);
    search.selectFile(path);
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "dir_replace_single")
        return {
          success: true,
          originalText: "needle",
          replacedText: "changed",
        } as any;
      if (command === "dir_replace_preview") return [] as any;
      return {
        filesReplaced: 1,
        filesFailed: 0,
        totalReplacements: 1,
        errors: [],
      } as any;
    });
    await search.replaceSingleMatch(path, 0);
    expect(search.previewRevision.value).toBe(1);
    expect(search.selectedFilePath.value).toBe(path);
    expect(search.results.value.has(path)).toBe(false);
    await search.executeReplace(["C:/fixture/other.txt"]);
    expect(search.previewRevision.value).toBe(1);
    await search.executeReplace([path]);
    expect(search.previewRevision.value).toBe(2);
  });
});
