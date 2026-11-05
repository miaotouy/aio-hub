// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, reactive, ref, type EffectScope } from "vue";
import type {
  ChatSessionIndex,
  ChatSessionDetail,
} from "../../../types/session";
import type { ContextPreviewData } from "../../../types/context";

const probe = vi.hoisted(() => ({
  chat: { isSending: false },
  input: { temporaryModel: { value: null as unknown } },
  calls: [] as Array<{
    session: string;
    resolve: (value: ContextPreviewData | null) => void;
    reject: (error: Error) => void;
  }>,
  preview: vi.fn(
    (detail: ChatSessionDetail) =>
      new Promise<ContextPreviewData | null>((resolve, reject) => {
        probe.calls.push({ session: detail.id, resolve, reject });
      })
  ),
}));
vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: "agent" } }),
}));
vi.mock("@/tools/llm-chat/composables/chat/useChatHandler", () => ({
  useChatHandler: () => ({ getLlmContextForPreview: probe.preview }),
}));
vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => probe.chat,
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: () => ({ modelId: "fixture" }) }),
}));
vi.mock("@/tools/llm-chat/composables/input/useChatInputManager", () => ({
  useChatInputManager: () => probe.input,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug() {}, warn() {} }),
}));
import { useChatContextStats } from "../useChatContextStats";

let scope: EffectScope;
function fixture() {
  const index = ref({
    id: "A",
    name: "A",
    messageCount: 1,
    createdAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:00:00Z",
  } satisfies ChatSessionIndex);
  const detail = ref({ id: "A", activeLeafId: "a" } as ChatSessionDetail);
  const id = ref<string | null>("A");
  const stats = scope.run(() => useChatContextStats(index, detail, id))!;
  const select = (session: string) => {
    index.value = {
      ...index.value,
      id: session,
      updatedAt: "2026-10-28T00:00:01Z",
    };
    detail.value = {
      id: session,
      activeLeafId: session.toLowerCase(),
    } as ChatSessionDetail;
    id.value = session;
  };
  return { ...stats, select };
}
function finish(index: number, count: number) {
  probe.calls[index].resolve({
    statistics: { totalTokenCount: count },
  } as ContextPreviewData);
}
beforeEach(() => {
  vi.useFakeTimers();
  probe.calls = [];
  probe.preview.mockClear();
  probe.chat = reactive({ isSending: false });
  probe.input = { temporaryModel: ref(null) };
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("context statistics scheduling", () => {
  it("会话切换立即拒绝旧结果，等待防抖后刷新当前会话", async () => {
    const stats = fixture();
    const first = stats.refreshContextStats();
    await vi.advanceTimersByTimeAsync(1);
    stats.select("B");
    finish(0, 111);
    await first;
    expect(stats.contextStats.value).toBeNull();
    await vi.advanceTimersByTimeAsync(501);
    expect(probe.calls.map((c) => c.session)).toEqual(["A", "B"]);
    finish(1, 222);
    await vi.advanceTimersByTimeAsync(1);
    expect(stats.contextStats.value?.totalTokenCount).toBe(222);
  });

  it("计算期间多次刷新合并到最新会话，loading 持续到队列完成", async () => {
    const stats = fixture();
    const first = stats.refreshContextStats();
    await vi.advanceTimersByTimeAsync(1);
    stats.select("B");
    stats.refreshContextStats();
    stats.select("C");
    const last = stats.refreshContextStats();
    expect(probe.calls).toHaveLength(1);
    finish(0, 111);
    await vi.advanceTimersByTimeAsync(1);
    expect(probe.calls.map((c) => c.session)).toEqual(["A", "C"]);
    expect(stats.contextStats.value).toBeNull();
    expect(stats.isLoadingContextStats.value).toBe(true);
    finish(1, 333);
    await Promise.all([first, last]);
    expect(stats.contextStats.value?.totalTokenCount).toBe(333);
    expect(stats.isLoadingContextStats.value).toBe(false);
  });

  it("发送结束取消待执行的防抖刷新", async () => {
    probe.chat.isSending = true;
    const stats = fixture();
    await vi.advanceTimersByTimeAsync(100);
    probe.chat.isSending = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(probe.calls).toHaveLength(1);
    finish(0, 42);
    await vi.advanceTimersByTimeAsync(600);
    expect(probe.calls).toHaveLength(1);
    expect(stats.contextStats.value?.totalTokenCount).toBe(42);
  });

  it("临时模型改变使在途结果失效，异常后仍可刷新，销毁后停止回写和排队", async () => {
    const stats = fixture();
    const first = stats.refreshContextStats();
    await vi.advanceTimersByTimeAsync(1);
    probe.input.temporaryModel.value = { modelId: "other" };
    finish(0, 111);
    await first;
    expect(stats.contextStats.value).toBeNull();
    const retry = stats.refreshContextStats();
    await vi.advanceTimersByTimeAsync(1);
    probe.calls[1].reject(new Error("temporary"));
    await retry;
    expect(stats.isLoadingContextStats.value).toBe(false);
    const pending = stats.refreshContextStats();
    await vi.advanceTimersByTimeAsync(1);
    stats.select("B");
    stats.refreshContextStats();
    scope.stop();
    finish(2, 222);
    await pending;
    await vi.advanceTimersByTimeAsync(1000);
    expect(probe.calls).toHaveLength(3);
    expect(stats.contextStats.value).toBeNull();
    expect(stats.isLoadingContextStats.value).toBe(false);
  });
});
