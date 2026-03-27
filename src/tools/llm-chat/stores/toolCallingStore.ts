import { defineStore } from "pinia";
import { ref } from "vue";
import type { ParsedToolRequest } from "@/tools/tool-calling/types";

export type ToolApprovalResult = "approved" | "rejected" | "silent_cancelled" | "silent_approved";

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
    externalId?: string,
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
   * 静默取消请求（拒绝并不再继续循环）
   */
  function silentCancelRequest(requestId: string) {
    const index = pendingRequests.value.findIndex((r) => r.id === requestId);
    if (index !== -1) {
      const pending = pendingRequests.value[index];
      pending.resolve("silent_cancelled");
      pendingRequests.value.splice(index, 1);
    }
  }

  /**
   * 静默批准请求（允许并不再继续循环）
   */
  function silentApproveRequest(requestId: string) {
    const index = pendingRequests.value.findIndex((r) => r.id === requestId);
    if (index !== -1) {
      const pending = pendingRequests.value[index];
      pending.resolve("silent_approved");
      pendingRequests.value.splice(index, 1);
    }
  }

  /**
   * 批准所有（针对当前会话）
   */
  function approveAll(sessionId: string) {
    const requestsToApprove = pendingRequests.value.filter((r) => r.sessionId === sessionId);
    requestsToApprove.forEach((r) => {
      r.resolve("approved");
    });
    pendingRequests.value = pendingRequests.value.filter((r) => r.sessionId !== sessionId);
  }

  /**
   * 拒绝所有（针对当前会话）
   */
  function rejectAll(sessionId: string) {
    const requestsToReject = pendingRequests.value.filter((r) => r.sessionId === sessionId);
    requestsToReject.forEach((r) => {
      r.resolve("rejected");
    });
    pendingRequests.value = pendingRequests.value.filter((r) => r.sessionId !== sessionId);
  }

  /**
   * 全部静默取消（针对当前会话）
   */
  function silentCancelAll(sessionId: string) {
    const requestsToCancel = pendingRequests.value.filter((r) => r.sessionId === sessionId);
    requestsToCancel.forEach((r) => {
      r.resolve("silent_cancelled");
    });
    pendingRequests.value = pendingRequests.value.filter((r) => r.sessionId !== sessionId);
  }

  /**
   * 全部静默批准（针对当前会话）
   */
  function silentApproveAll(sessionId: string) {
    const requestsToApprove = pendingRequests.value.filter((r) => r.sessionId === sessionId);
    requestsToApprove.forEach((r) => {
      r.resolve("silent_approved");
    });
    pendingRequests.value = pendingRequests.value.filter((r) => r.sessionId !== sessionId);
  }

  /**
   * 处理外部响应（用于同步状态，例如 VCP 另一端已经批准了）
   */
  function handleExternalResponse(externalId: string, approved: boolean) {
    const index = pendingRequests.value.findIndex((r) => r.externalId === externalId);
    if (index !== -1) {
      const pending = pendingRequests.value[index];
      // 如果外部已经处理了，我们这边静默完成
      pending.resolve(approved ? "silent_approved" : "silent_cancelled");
      pendingRequests.value.splice(index, 1);
    }
  }

  return {
    pendingRequests,
    requestApproval,
    approveRequest,
    rejectRequest,
    silentCancelRequest,
    silentApproveRequest,
    approveAll,
    rejectAll,
    silentCancelAll,
    silentApproveAll,
    handleExternalResponse,
  };
});
