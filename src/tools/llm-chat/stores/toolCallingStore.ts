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

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type {
  ParsedToolRequest,
  ToolApprovalResult,
} from "@/tools/tool-calling/types";
import { createModuleLogger } from "@/utils/logger";
import { useChatSettings } from "../composables/settings/useChatSettings";

const logger = createModuleLogger("llm-chat/tool-approval");
export const DEFAULT_TOOL_APPROVAL_TIMEOUT_MS = 60_000;
export const MIN_TOOL_APPROVAL_TIMEOUT_SECONDS = 5;
export const MAX_TOOL_APPROVAL_TIMEOUT_SECONDS = 24 * 60 * 60;

export interface ToolApprovalOptions {
  /** 正数表示显式超时；0 或 null 表示显式禁用；省略时跟随全局设置。 */
  timeoutMs?: number | null;
  signal?: AbortSignal;
}

export interface PendingToolRequest {
  id: string;
  /** 外部 ID (例如 VCP 的 requestId)，用于同步状态 */
  externalId?: string;
  sessionId: string;
  request: ParsedToolRequest;
  createdAt: number;
  expiresAt: number | null;
  /** 是否跟随全局审批超时设置，显式 timeoutMs 的请求不受开关变化影响。 */
  usesDefaultTimeout: boolean;
  resolve: (result: ToolApprovalResult) => void;
}

interface PendingLifecycle {
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortHandler?: () => void;
}

export const useToolCallingStore = defineStore("toolCalling", () => {
  const pendingRequests = ref<PendingToolRequest[]>([]);
  const lifecycles = new Map<string, PendingLifecycle>();
  const { settings: chatSettings } = useChatSettings();

  function clearLifecycleTimer(lifecycle: PendingLifecycle): void {
    if (lifecycle.timer) {
      clearTimeout(lifecycle.timer);
      lifecycle.timer = undefined;
    }
  }

  function cleanupLifecycle(id: string): void {
    const lifecycle = lifecycles.get(id);
    if (!lifecycle) return;
    clearLifecycleTimer(lifecycle);
    if (lifecycle.signal && lifecycle.abortHandler) {
      lifecycle.signal.removeEventListener("abort", lifecycle.abortHandler);
    }
    lifecycles.delete(id);
  }

  function settleRequest(
    id: string,
    result: ToolApprovalResult,
    reason: string
  ): boolean {
    const index = pendingRequests.value.findIndex((item) => item.id === id);
    if (index === -1) return false;
    const [pending] = pendingRequests.value.splice(index, 1);
    cleanupLifecycle(id);
    pending.resolve(result);
    logger.info("工具审批请求已结束", {
      id,
      externalId: pending.externalId,
      sessionId: pending.sessionId,
      requestId: pending.request.requestId,
      result,
      reason,
    });
    return true;
  }

  function getConfiguredTimeoutMs(): number {
    const configuredSeconds = Number(
      chatSettings.value.uiPreferences.toolApprovalTimeoutSeconds
    );
    if (!Number.isFinite(configuredSeconds)) {
      return DEFAULT_TOOL_APPROVAL_TIMEOUT_MS;
    }
    const seconds = Math.min(
      MAX_TOOL_APPROVAL_TIMEOUT_SECONDS,
      Math.max(MIN_TOOL_APPROVAL_TIMEOUT_SECONDS, configuredSeconds)
    );
    return seconds * 1000;
  }

  function resolveTimeoutMs(options: ToolApprovalOptions): number | null {
    if (options.timeoutMs !== undefined) {
      return typeof options.timeoutMs === "number" && options.timeoutMs > 0
        ? options.timeoutMs
        : null;
    }
    return chatSettings.value.uiPreferences.toolApprovalTimeoutEnabled
      ? getConfiguredTimeoutMs()
      : null;
  }

  function scheduleTimeout(
    pending: PendingToolRequest,
    lifecycle: PendingLifecycle,
    timeoutMs: number | null
  ): void {
    clearLifecycleTimer(lifecycle);
    pending.expiresAt = timeoutMs === null ? null : Date.now() + timeoutMs;
    if (timeoutMs === null) return;
    lifecycle.timer = setTimeout(() => {
      settleRequest(pending.id, "rejected", "审批超时");
    }, timeoutMs);
  }

  function applyDefaultTimeoutPolicy(enabled: boolean): void {
    const timeoutMs = enabled ? getConfiguredTimeoutMs() : null;
    for (const pending of pendingRequests.value) {
      if (!pending.usesDefaultTimeout) continue;
      const lifecycle = lifecycles.get(pending.id);
      if (lifecycle) scheduleTimeout(pending, lifecycle, timeoutMs);
    }
  }

  /**
   * 请求批准。默认一直等待人工处理；用户启用全局超时或调用方显式传入 timeoutMs
   * 时才会定时拒绝。AbortSignal 中止、会话清理或窗口关闭仍会拒绝并清理请求。
   */
  function requestApproval(
    sessionId: string,
    request: ParsedToolRequest,
    externalId?: string,
    options: ToolApprovalOptions = {}
  ): Promise<ToolApprovalResult> {
    if (options.signal?.aborted) return Promise.resolve("rejected");
    if (externalId) cancelByExternalId(externalId, "同一外部请求已被替换");

    const timeoutMs = resolveTimeoutMs(options);
    const id = Math.random().toString(36).substring(2, 11);
    const createdAt = Date.now();

    return new Promise((resolve) => {
      const pending: PendingToolRequest = {
        id,
        externalId,
        sessionId,
        request,
        createdAt,
        expiresAt: null,
        usesDefaultTimeout: options.timeoutMs === undefined,
        resolve,
      };
      pendingRequests.value.push(pending);

      const abortHandler = options.signal
        ? () => settleRequest(id, "rejected", "调用已取消")
        : undefined;
      if (options.signal && abortHandler) {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }
      const lifecycle: PendingLifecycle = {
        signal: options.signal,
        abortHandler,
      };
      lifecycles.set(id, lifecycle);
      scheduleTimeout(pending, lifecycle, timeoutMs);
    });
  }

  function approveRequest(requestId: string) {
    settleRequest(requestId, "approved", "用户批准");
  }

  function rejectRequest(requestId: string) {
    settleRequest(requestId, "rejected", "用户拒绝");
  }

  function settleByIds(
    ids: string[],
    result: ToolApprovalResult,
    reason: string
  ): void {
    for (const id of [...new Set(ids)]) settleRequest(id, result, reason);
  }

  function approveAll(sessionId: string) {
    settleByIds(
      pendingRequests.value
        .filter((item) => item.sessionId === sessionId)
        .map((item) => item.id),
      "approved",
      "用户批量批准"
    );
  }

  function rejectAll(sessionId: string) {
    cancelBySession(sessionId, "用户批量拒绝");
  }

  function approveByIds(ids: string[]) {
    settleByIds(ids, "approved", "用户批量批准");
  }

  function rejectByIds(ids: string[]) {
    settleByIds(ids, "rejected", "用户批量拒绝");
  }

  function cancelBySession(sessionId: string, reason = "会话已结束"): number {
    const ids = pendingRequests.value
      .filter((item) => item.sessionId === sessionId)
      .map((item) => item.id);
    settleByIds(ids, "rejected", reason);
    return ids.length;
  }

  function cancelByExternalId(externalId: string, reason = "外部请求已取消") {
    const ids = pendingRequests.value
      .filter((item) => item.externalId === externalId)
      .map((item) => item.id);
    settleByIds(ids, "rejected", reason);
    return ids.length;
  }

  function cancelExternalRequests(reason = "外部连接已断开"): number {
    const ids = pendingRequests.value
      .filter((item) => !!item.externalId)
      .map((item) => item.id);
    settleByIds(ids, "rejected", reason);
    return ids.length;
  }

  function cancelAll(reason = "应用窗口已关闭"): number {
    const ids = pendingRequests.value.map((item) => item.id);
    settleByIds(ids, "rejected", reason);
    return ids.length;
  }

  function handleExternalResponse(externalId: string, approved: boolean) {
    const ids = pendingRequests.value
      .filter((item) => item.externalId === externalId)
      .map((item) => item.id);
    settleByIds(ids, approved ? "approved" : "rejected", "收到外部审批结果");
  }

  watch(
    () =>
      [
        chatSettings.value.uiPreferences.toolApprovalTimeoutEnabled,
        chatSettings.value.uiPreferences.toolApprovalTimeoutSeconds,
      ] as const,
    ([enabled]) => applyDefaultTimeoutPolicy(enabled)
  );

  if (typeof window !== "undefined") {
    const cancelForWindowClose = () => cancelAll("应用窗口已关闭");
    window.addEventListener("beforeunload", cancelForWindowClose);
    window.addEventListener("pagehide", cancelForWindowClose);
  }

  return {
    pendingRequests,
    requestApproval,
    approveRequest,
    rejectRequest,
    approveAll,
    rejectAll,
    approveByIds,
    rejectByIds,
    cancelBySession,
    cancelByExternalId,
    cancelExternalRequests,
    cancelAll,
    handleExternalResponse,
  };
});
