import { effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PresetMessage, PresetMessageGroup } from "../../types/agent";

const { countTokensBatchMock } = vi.hoisted(() => ({
  countTokensBatchMock: vi.fn(),
}));

vi.mock("@/utils/tokenCounting", () => ({
  countTokensBatch: countTokensBatchMock,
}));

import { usePresetTokenCalculator } from "../usePresetTokenCalculator";

function message(id: string, content: string, groupId?: string): PresetMessage {
  return {
    id,
    parentId: null,
    childrenIds: [],
    content,
    role: "system",
    status: "complete",
    groupId,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("usePresetTokenCalculator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    countTokensBatchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("discards stale results from rapid content changes", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    countTokensBatchMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const messages = ref([message("one", "first")]);
    const scope = effectScope();
    const calculator = scope.run(() => usePresetTokenCalculator(messages))!;

    await vi.advanceTimersByTimeAsync(500);
    messages.value[0].content = "second";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);

    second.resolve({
      counts: [2],
      total: 2,
      tokenizer: "o200k_base",
      estimated: true,
      fallback: false,
    });
    await Promise.resolve();
    expect(calculator.totalTokens.value).toBe(2);

    first.resolve({
      counts: [99],
      total: 99,
      tokenizer: "o200k_base",
      estimated: true,
      fallback: false,
    });
    await Promise.resolve();
    expect(calculator.totalTokens.value).toBe(2);

    scope.stop();
  });

  it("submits only messages enabled directly and through their group", async () => {
    countTokensBatchMock.mockResolvedValue({
      counts: [3],
      total: 3,
      tokenizer: "o200k_base",
      estimated: true,
      fallback: false,
    });
    const messages = ref([
      message("enabled", "included"),
      message("disabled-group", "excluded", "off"),
    ]);
    const groups = ref<PresetMessageGroup[]>([
      { id: "off", name: "Off", selectionMode: "checkbox", enabled: false },
    ]);
    const scope = effectScope();

    scope.run(() => usePresetTokenCalculator(messages, groups));
    await vi.advanceTimersByTimeAsync(500);

    expect(countTokensBatchMock).toHaveBeenCalledWith(["included"]);
    scope.stop();
  });
});
