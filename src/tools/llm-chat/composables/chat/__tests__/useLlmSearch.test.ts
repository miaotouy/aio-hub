// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLlmSearch } from "../useLlmSearch";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/platform/native/core", () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage?: unknown;
  },
}));
vi.mock("../../../composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: { uiPreferences: { searchResultLimit: 20 } },
  }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
afterEach(() => {
  vi.useRealTimers();
  mocks.invoke.mockReset().mockResolvedValue(undefined);
});

// Clearing is also the panel-unmount contract: pending debounce work must be invalidated,
// while subsequent searches still reach the backend with the requested query.
describe("LLM search cancellation", () => {
  it("clears a queued query without restarting it and permits a later search", async () => {
    vi.useFakeTimers();
    const search = useLlmSearch({ debounceMs: 300, scope: "session" });
    search.search("旧面板搜索");
    search.clearSearch();
    await vi.advanceTimersByTimeAsync(350);
    expect(
      mocks.invoke.mock.calls.filter(
        ([command]) => command === "search_llm_data_stream"
      )
    ).toHaveLength(0);
    search.search("当前面板搜索");
    await vi.advanceTimersByTimeAsync(350);
    const calls = mocks.invoke.mock.calls.filter(
      ([command]) => command === "search_llm_data_stream"
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(
      expect.objectContaining({ query: "当前面板搜索", scope: "session" })
    );
    search.clearSearch();
  });
});

it("ignores late results and errors from a superseded streaming search", async () => {
  const channels: { onmessage: (payload: unknown) => void }[] = [];
  let rejectOld!: (reason: Error) => void;
  mocks.invoke.mockImplementation((command, args) => {
    if (command === "cancel_llm_chat_search") return Promise.resolve();
    channels.push(args.onEvent);
    if (args.query === "old")
      return new Promise((_resolve, reject) => {
        rejectOld = reject;
      });
    args.onEvent.onmessage({
      type: "resultBatch",
      data: [
        {
          id: "current",
          kind: "session",
          title: "current",
          matches: [],
          path: "current.json",
        },
      ],
    });
    args.onEvent.onmessage({ type: "done", data: { durationMs: 1 } });
    return Promise.resolve();
  });
  const search = useLlmSearch();
  const old = search.searchImmediate("old");
  await search.searchImmediate("new");
  channels[0].onmessage({
    type: "resultBatch",
    data: [{ id: "stale", matches: [] }],
  });
  rejectOld(new Error("old failed late"));
  await old;
  expect(search.searchResults.value.map((result) => result.id)).toEqual([
    "current",
  ]);
  expect(search.searchError.value).toBeNull();
  expect(search.isSearching.value).toBe(false);
});
it("keeps a cleared panel empty when an in-flight channel later publishes", async () => {
  let channel!: { onmessage: (payload: unknown) => void }, finish!: () => void;
  mocks.invoke.mockImplementation((command, args) => {
    if (command === "cancel_llm_chat_search") return Promise.resolve();
    channel = args.onEvent;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const search = useLlmSearch(),
    pending = search.searchImmediate("old");
  search.clearSearch();
  channel.onmessage({
    type: "resultBatch",
    data: [{ id: "stale", matches: [] }],
  });
  channel.onmessage({ type: "done", data: { durationMs: 1 } });
  finish();
  await pending;
  expect(search.searchResults.value).toEqual([]);
  expect(search.filesScanned.value).toBe(0);
  expect(search.isSearching.value).toBe(false);
});
