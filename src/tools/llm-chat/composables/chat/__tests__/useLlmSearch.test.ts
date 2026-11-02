// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLlmSearch } from "../useLlmSearch";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/core", () => ({
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
  mocks.invoke.mockClear();
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
