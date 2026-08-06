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
import { ref } from "vue";
import type {
  ParsedToolRequest,
  ToolApprovalResult,
} from "@/tools/tool-calling/types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/tool-approval");
export const DEFAULT_TOOL_APPROVAL_TIMEOUT_MS = 60_000;

export interface ToolApprovalOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface PendingToolRequest {
  id: string;
  /** 外部 ID (例如 VCP 的 requestId)，用于同步状态 */
  externalId?: string;
  sessionId: string;
  request: ParsedToolRequest;
  createdAt: number;
  expiresAt: number;
  resolve: (result: ToolApprovalResult) => void;
}

interface PendingLifecycle {
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortHandler?: () => void;
}

export const useToolCallingStore = defineStore("toolCalling", () => {
  const pendingRequests = ref<PendingToolRequest[]>([]);
  const lifecycles = new Map<string, PendingLifecycle>();

  function cleanupLifecycle(id: string): void {
    const lifecycle = lifecycles.get(id);
    if (!lifecycle) return;
    clearTimeout(lifecycle.timer);
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

  /**
   * 请求批准。所有请求都有强制超时，AbortSignal 中止、会话清理或窗口关闭时
   * 都会默认拒绝并从 pendingRequests 移除。
   */
  function requestApproval(
    sessionId: string,
    request: ParsedToolRequest,
    externalId?: string,
    options: ToolApprovalOptions = {}
  ): Promise<ToolApprovalResult> {
    if (options.signal?.aborted) return Promise.resolve("rejected");
    if (externalId) cancelByExternalId(externalId, "同一外部请求已被替换");

    const timeoutMs =
      typeof options.timeoutMs === "number" && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TOOL_APPROVAL_TIMEOUT_MS;
    const id = Math.random().toString(36).substring(2, 11);
    const createdAt = Date.now();

    return new Promise((resolve) => {
      pendingRequests.value.push({
        id,
        externalId,
        sessionId,
        request,
        createdAt,
        expiresAt: createdAt + timeoutMs,
        resolve,
      });

      const timer = setTimeout(() => {
        settleRequest(id, "rejected", "审批超时");
      }, timeoutMs);
      const abortHandler = options.signal
        ? () => settleRequest(id, "rejected", "调用已取消")
        : undefined;
      if (options.signal && abortHandler) {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }
      lifecycles.set(id, { timer, signal: options.signal, abortHandler });
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
