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
import type { ParsedToolRequest } from "@/tools/tool-calling/types";

export type ToolApprovalResult = "approved" | "rejected";

export interface PendingToolRequest {
  id: string;
  /** 外部 ID (例如 VCP 的 requestId)，用于同步状态 */
  externalId?: string;
  sessionId: string;
  request: ParsedToolRequest;
  resolve: (result: ToolApprovalResult) => void;
}

export const useToolCallingStore = defineStore("toolCalling", () => {
  const pendingRequests = ref<PendingToolRequest[]>([]);

  /**
   * 请求批准
   */
  function requestApproval(
    sessionId: string,
    request: ParsedToolRequest,
    externalId?: string
  ): Promise<ToolApprovalResult> {
    return new Promise((resolve) => {
      pendingRequests.value.push({
        id: Math.random().toString(36).substring(2, 11),
        externalId,
        sessionId,
        request,
        resolve,
      });
    });
  }

  /**
   * 批准请求
   */
  function approveRequest(requestId: string) {
    const index = pendingRequests.value.findIndex((r) => r.id === requestId);
    if (index !== -1) {
      const pending = pendingRequests.value[index];
      pending.resolve("approved");
      pendingRequests.value.splice(index, 1);
    }
  }

  /**
   * 拒绝请求
   */
  function rejectRequest(requestId: string) {
    const index = pendingRequests.value.findIndex((r) => r.id === requestId);
    if (index !== -1) {
      const pending = pendingRequests.value[index];
      pending.resolve("rejected");
      pendingRequests.value.splice(index, 1);
    }
  }

  /**
   * 批准所有（针对当前会话）
   *
   * 注意：该方法只按 sessionId 精确匹配，不会处理外部（VCP 等）请求。
   * 如果需要批量处理"UI 当前可见的所有请求"（含外部），请使用
   * approveByIds / rejectByIds。
   */
  function approveAll(sessionId: string) {
    const requestsToApprove = pendingRequests.value.filter(
      (r) => r.sessionId === sessionId
    );
    requestsToApprove.forEach((r) => {
      r.resolve("approved");
    });
    pendingRequests.value = pendingRequests.value.filter(
      (r) => r.sessionId !== sessionId
    );
  }

  /**
   * 拒绝所有（针对当前会话）
   *
   * 见 approveAll 的同名说明。
   */
  function rejectAll(sessionId: string) {
    const requestsToReject = pendingRequests.value.filter(
      (r) => r.sessionId === sessionId
    );
    requestsToReject.forEach((r) => {
      r.resolve("rejected");
    });
    pendingRequests.value = pendingRequests.value.filter(
      (r) => r.sessionId !== sessionId
    );
  }

  /**
   * 按 ID 列表批准请求
   *
   * 用于"UI 当前可见请求"的批量处理，可同时覆盖本地会话与外部（VCP 等）请求。
   * UI 决定要批量处理哪些 ID，store 不做会话归属过滤。
   */
  function approveByIds(ids: string[]) {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const toApprove = pendingRequests.value.filter((r) => idSet.has(r.id));
    toApprove.forEach((r) => {
      r.resolve("approved");
    });
    pendingRequests.value = pendingRequests.value.filter(
      (r) => !idSet.has(r.id)
    );
  }

  /**
   * 按 ID 列表拒绝请求
   *
   * 见 approveByIds 的同名说明。
   */
  function rejectByIds(ids: string[]) {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const toReject = pendingRequests.value.filter((r) => idSet.has(r.id));
    toReject.forEach((r) => {
      r.resolve("rejected");
    });
    pendingRequests.value = pendingRequests.value.filter(
      (r) => !idSet.has(r.id)
    );
  }

  /**
   * 处理外部响应（用于同步状态，例如 VCP 另一端已经批准了）
   */
  function handleExternalResponse(externalId: string, approved: boolean) {
    const index = pendingRequests.value.findIndex(
      (r) => r.externalId === externalId
    );
    if (index !== -1) {
      const pending = pendingRequests.value[index];
      // 如果外部已经处理了，我们这边静默完成
      pending.resolve(approved ? "approved" : "rejected");
      pendingRequests.value.splice(index, 1);
    }
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
    handleExternalResponse,
  };
});
