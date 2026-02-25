import { defineStore } from "pinia";
import { ref } from "vue";
import type { ParsedToolRequest } from "@/tools/tool-calling/types";

export interface PendingToolRequest {
  id: string;
  sessionId: string;
  request: ParsedToolRequest;
  resolve: (approved: boolean) => void;
}

export const useToolCallingStore = defineStore("toolCalling", () => {
  const pendingRequests = ref<PendingToolRequest[]>([]);

  /**
   * 请求批准
   */
  function requestApproval(sessionId: string, request: ParsedToolRequest): Promise<boolean> {
    return new Promise((resolve) => {
      pendingRequests.value.push({
        id: Math.random().toString(36).substring(2, 11),
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
      pending.resolve(true);
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
      pending.resolve(false);
      pendingRequests.value.splice(index, 1);
    }
  }

  /**
   * 批准所有（针对当前会话）
   */
  function approveAll(sessionId: string) {
    const requestsToApprove = pendingRequests.value.filter((r) => r.sessionId === sessionId);
    requestsToApprove.forEach((r) => {
      r.resolve(true);
    });
    pendingRequests.value = pendingRequests.value.filter((r) => r.sessionId !== sessionId);
  }

  /**
   * 拒绝所有（针对当前会话）
   */
  function rejectAll(sessionId: string) {
    const requestsToReject = pendingRequests.value.filter((r) => r.sessionId === sessionId);
    requestsToReject.forEach((r) => {
      r.resolve(false);
    });
    pendingRequests.value = pendingRequests.value.filter((r) => r.sessionId !== sessionId);
  }

  return {
    pendingRequests,
    requestApproval,
    approveRequest,
    rejectRequest,
    approveAll,
    rejectAll,
  };
});
