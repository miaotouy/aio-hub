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
import type {
  ArbiterAuditInfo,
  ArbiterDecision,
  ArbitrationContext,
  ArbitrationSource,
  ArbitrationState,
  ApprovalArbiter,
} from "@/services/decision-arbiter/types";
import { createModuleLogger } from "@/utils/logger";
import { useChatSettings } from "../composables/settings/useChatSettings";

const logger = createModuleLogger("llm-chat/tool-approval");
export const DEFAULT_TOOL_APPROVAL_TIMEOUT_MS = 60_000;
export const MIN_TOOL_APPROVAL_TIMEOUT_SECONDS = 5;
export const MAX_TOOL_APPROVAL_TIMEOUT_SECONDS = 24 * 60 * 60;

/** 仲裁等待态与审计映射的 LRU 上限（§2.4 要点 2）。 */
export const ARBITRATION_TRAIL_MAX_ENTRIES = 100;

export interface ToolApprovalOptions {
  /** 正数表示显式超时；0 或 null 表示显式禁用；省略时跟随全局设置。 */
  timeoutMs?: number | null;
  signal?: AbortSignal;
  /** 请求来源（仲裁与审计用），省略视为本地编排器。 */
  source?: ArbitrationSource;
  /** 发起会话绑定的 Agent，用于解析 Agent 级仲裁配置。 */
  agentId?: string;
  /** Agent 显示名（JEV state 摘要用）。 */
  agentName?: string;
  /** executor 安全策略已命中强制审批（checkSecurityPolicy → approve）。 */
  forceApproval?: boolean;
  /** 跳过仲裁直接走人工（批量审批缓存复用等场景）。 */
  skipArbitration?: boolean;
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

// ---------------------------------------------------------------------------
// 审批仲裁注入口（方案 C：审批入口依赖注入，executor 零改动）
// ---------------------------------------------------------------------------

let arbiterInstance: ApprovalArbiter | null = null;

/** 注入审批仲裁器（llm-chat 初始化时装配）；传 null 可卸载。 */
export function setApprovalArbiter(arbiter: ApprovalArbiter | null): void {
  arbiterInstance = arbiter;
}

export const useToolCallingStore = defineStore("toolCalling", () => {
  const pendingRequests = ref<PendingToolRequest[]>([]);
  const lifecycles = new Map<string, PendingLifecycle>();
  /**
   * 仲裁等待态（§2.4）：key 契约为 request.requestId（消息卡片携带的 id），
   * 禁止使用 store 内部 pending.id。
   */
  const arbitrationStates = ref<Map<string, ArbitrationState>>(new Map());
  /** 旁路审计映射（红线 7）：key 同为 request.requestId。 */
  const auditRecords = ref<Map<string, ArbiterAuditInfo>>(new Map());
  /** requestId → sessionId 索引（仲裁等待态未入列项的会话清理追踪）。 */
  const arbitrationSessionIndex = new Map<string, string>();
  /** requestId → 仲裁中止控制器（会话取消 / 外部请求替换时中止进行中的 JEV 调用）。 */
  const arbitrationAbortControllers = new Map<string, AbortController>();
  /** externalId → requestId 索引（外部请求在仲裁阶段即可被新请求替换）。 */
  const arbitrationExternalIndex = new Map<string, string>();
  const { settings: chatSettings } = useChatSettings();

  /** LRU 上限裁剪：保留最近 N 条已结项记录。 */
  function trimTrailMap(map: Map<string, unknown>): void {
    if (map.size <= ARBITRATION_TRAIL_MAX_ENTRIES) return;
    const overflow = map.size - ARBITRATION_TRAIL_MAX_ENTRIES;
    let removed = 0;
    for (const key of map.keys()) {
      if (removed >= overflow) break;
      map.delete(key);
      removed++;
    }
  }

  function setArbitrationState(
    requestId: string,
    state: ArbitrationState
  ): void {
    arbitrationStates.value.set(requestId, state);
    trimTrailMap(arbitrationStates.value);
    arbitrationStates.value = new Map(arbitrationStates.value);
  }

  function setAuditRecord(requestId: string, info: ArbiterAuditInfo): void {
    auditRecords.value.set(requestId, info);
    trimTrailMap(auditRecords.value);
    auditRecords.value = new Map(auditRecords.value);
  }

  /** 读取旁路审计信息（消息卡片放行源徽标用）。 */
  function getAuditRecord(requestId: string): ArbiterAuditInfo | undefined {
    return auditRecords.value.get(requestId);
  }

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
    reason: string,
    audit?: ArbiterAuditInfo
  ): boolean {
    const index = pendingRequests.value.findIndex((item) => item.id === id);
    if (index === -1) return false;
    const [pending] = pendingRequests.value.splice(index, 1);
    cleanupLifecycle(id);
    if (audit) {
      setAuditRecord(pending.request.requestId, audit);
    }
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
      settleRequest(pending.id, "rejected", "审批超时", { origin: "timeout" });
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
   *
   * 仲裁前置（§2.4 两段式）：已注入 arbiter 且未跳过时，先走 JEV 灰区仲裁；
   * approve/deny 直接短路返回（不入列，浮窗不出现），仅 escalate 才进入
   * 原有人工审批流程。人工审批超时从 escalate 时刻起算，仲裁耗时不计入。
   */
  async function requestApproval(
    sessionId: string,
    request: ParsedToolRequest,
    externalId?: string,
    options: ToolApprovalOptions = {}
  ): Promise<ToolApprovalResult> {
    if (options.signal?.aborted) return "rejected";

    const arbiter = arbiterInstance;
    const arbitrationContext: ArbitrationContext = {
      request,
      source: options.source ?? "orchestrator",
      forceApproval: options.forceApproval === true,
      sessionId,
      agentId: options.agentId,
      agentName: options.agentName,
      requestedAt: Date.now(),
    };
    // 配置未启用仲裁时完全绕过：不写 arbitrating 等待态，直接进入原有人工审批
    // （否则关闭 AI 仲裁的 Agent 也会短暂显示「等待 AI 审核」）。
    const arbitrationEnabled =
      !!arbiter &&
      options.skipArbitration !== true &&
      (arbiter.isArbitrationEnabled?.(arbitrationContext) ?? true);

    if (arbiter && arbitrationEnabled) {
      const requestId = request.requestId;
      const arbitrationController = new AbortController();

      // 外部请求生命周期在仲裁阶段即生效：重复 externalId 到达时立即取消
      // 仍在仲裁中的旧请求，避免同一外部请求被放行两次。
      if (externalId) {
        cancelArbitrationByExternalId(externalId, "同一外部请求已被替换");
        arbitrationExternalIndex.set(externalId, requestId);
      }

      setArbitrationState(requestId, "arbitrating");
      arbitrationSessionIndex.set(requestId, sessionId);
      arbitrationAbortControllers.set(requestId, arbitrationController);
      // 调用方 signal 中止时联动中止仲裁
      const onCallerAbort = () => arbitrationController.abort();
      options.signal?.addEventListener("abort", onCallerAbort, { once: true });

      const cleanupArbitrationEntry = () => {
        options.signal?.removeEventListener("abort", onCallerAbort);
        arbitrationAbortControllers.delete(requestId);
        if (arbitrationExternalIndex.get(externalId ?? "") === requestId) {
          arbitrationExternalIndex.delete(externalId!);
        }
        // 会话清理索引仅在仲裁进行期间需要：升级入列后 cancelBySession 会从
        // pendingRequests 收集 requestId，其余分支已结项，均不再需要此索引，
        // 在此统一删除避免长会话下 Map 无上限增长。
        arbitrationSessionIndex.delete(requestId);
      };

      try {
        let decision: ArbiterDecision | null = null;
        try {
          // 竞速取消：仲裁中止后不再等待 JEV 返回，立即短路拒绝
          decision = await Promise.race([
            arbiter.arbitrate(arbitrationContext, arbitrationController.signal),
            new Promise<never>((_resolve, reject) => {
              arbitrationController.signal.addEventListener(
                "abort",
                () => reject(new DOMException("仲裁已取消", "AbortError")),
                { once: true }
              );
            }),
          ]);
        } catch (error) {
          if (arbitrationController.signal.aborted) {
            // 取消后不得残留仲裁等待态（cancelBySession 已清理时此删除为幂等兜底）
            arbitrationStates.value.delete(requestId);
            auditRecords.value.delete(requestId);
            arbitrationStates.value = new Map(arbitrationStates.value);
            auditRecords.value = new Map(auditRecords.value);
            return "rejected";
          }
          logger.warn("仲裁器调用异常，转人工（fail-closed）", {
            requestId,
            error,
          });
        }

        // 仲裁期间请求可能被取消（调用方 signal 等兜底检查）
        if (options.signal?.aborted) {
          arbitrationStates.value.delete(requestId);
          auditRecords.value.delete(requestId);
          arbitrationStates.value = new Map(arbitrationStates.value);
          auditRecords.value = new Map(auditRecords.value);
          return "rejected";
        }

        if (decision?.action === "approve") {
          setArbitrationState(requestId, "auto-approved");
          setAuditRecord(requestId, {
            origin: "jev",
            arbiter: decision.audit ?? undefined,
          });
          logger.info("JEV 自动放行", {
            requestId,
            toolId: request.toolId,
            reason: decision.reason,
          });
          return "approved";
        }
        if (decision?.action === "deny") {
          setArbitrationState(requestId, "auto-denied");
          setAuditRecord(requestId, {
            origin: "jev",
            arbiter: decision.audit ?? undefined,
          });
          logger.info("JEV 风险拦截", {
            requestId,
            toolId: request.toolId,
            reason: decision.reason,
          });
          return "rejected";
        }
        // escalate / 仲裁异常 → 升级人工（保留 JEV 建议供浮窗展示）
        setArbitrationState(requestId, "escalated");
        if (decision) {
          setAuditRecord(requestId, {
            origin: "jev",
            arbiter: decision.audit ?? undefined,
          });
        }
      } finally {
        cleanupArbitrationEntry();
      }
    }

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
    settleRequest(requestId, "approved", "用户批准", { origin: "manual" });
  }

  function rejectRequest(requestId: string) {
    settleRequest(requestId, "rejected", "用户拒绝", { origin: "manual" });
  }

  function settleByIds(
    ids: string[],
    result: ToolApprovalResult,
    reason: string
  ): void {
    for (const id of new Set(ids)) {
      settleRequest(
        id,
        result,
        reason,
        reason.includes("超时")
          ? { origin: "timeout" }
          : reason.includes("取消")
            ? { origin: "cancelled" }
            : { origin: "manual" }
      );
    }
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

  /** 中止进行中的仲裁（controller 与追踪索引）；等待态由调用方按序清理。 */
  function abortArbitration(requestId: string): void {
    arbitrationAbortControllers.get(requestId)?.abort();
    arbitrationAbortControllers.delete(requestId);
    arbitrationSessionIndex.delete(requestId);
  }

  /**
   * 按 externalId 取消仍在仲裁中的请求（尚未入列 pendingRequests）。
   * 此时等待态仅为 "arbitrating"，可安全响应式删除；仲裁返回后的
   * 取消分支会再做一次幂等兜底清理。
   */
  function cancelArbitrationByExternalId(
    externalId: string,
    reason: string
  ): boolean {
    const requestId = arbitrationExternalIndex.get(externalId);
    if (!requestId) return false;
    logger.info("外部请求仲裁被替换取消", { externalId, requestId, reason });
    abortArbitration(requestId);
    arbitrationStates.value.delete(requestId);
    auditRecords.value.delete(requestId);
    arbitrationStates.value = new Map(arbitrationStates.value);
    auditRecords.value = new Map(auditRecords.value);
    return true;
  }

  function cancelBySession(sessionId: string, reason = "会话已结束"): number {
    const ids = pendingRequests.value
      .filter((item) => item.sessionId === sessionId)
      .map((item) => item.id);
    // 先收集该会话全部涉及的 requestId（含仲裁等待态未入列项）
    const requestIds = new Set(
      pendingRequests.value
        .filter((item) => item.sessionId === sessionId)
        .map((item) => item.request.requestId)
    );
    for (const [requestId, mapped] of arbitrationSessionIndex) {
      if (mapped === sessionId) requestIds.add(requestId);
    }
    // 会话取消必须同时中止进行中的 JEV 仲裁，防止会话结束后仍自动放行
    for (const requestId of requestIds) {
      abortArbitration(requestId);
    }
    settleByIds(ids, "rejected", reason);
    // 仲裁等待态与审计映射按 sessionId 联动清理（§2.4 要点 2），
    // 必须在 settleByIds 之后执行：settle 会写回人工审计记录
    for (const requestId of requestIds) {
      arbitrationStates.value.delete(requestId);
      auditRecords.value.delete(requestId);
    }
    arbitrationStates.value = new Map(arbitrationStates.value);
    auditRecords.value = new Map(auditRecords.value);
    return ids.length;
  }

  function cancelByExternalId(externalId: string, reason = "外部请求已取消") {
    // 仲裁阶段的外部请求先按索引取消；入列后的仍按 pending 处理
    cancelArbitrationByExternalId(externalId, reason);
    const ids = pendingRequests.value
      .filter((item) => item.externalId === externalId)
      .map((item) => item.id);
    settleByIds(ids, "rejected", reason);
    return ids.length;
  }

  function cancelExternalRequests(reason = "外部连接已断开"): number {
    // 中止全部仍在仲裁中的外部请求
    for (const requestId of arbitrationExternalIndex.values()) {
      abortArbitration(requestId);
    }
    arbitrationExternalIndex.clear();
    const ids = pendingRequests.value
      .filter((item) => !!item.externalId)
      .map((item) => item.id);
    const requestIds = new Set(
      pendingRequests.value
        .filter((item) => !!item.externalId)
        .map((item) => item.request.requestId)
    );
    settleByIds(ids, "rejected", reason);
    // settle 会写回人工审计记录，等待态须在其后清理
    for (const requestId of requestIds) {
      arbitrationStates.value.delete(requestId);
      auditRecords.value.delete(requestId);
      arbitrationSessionIndex.delete(requestId);
    }
    arbitrationStates.value = new Map(arbitrationStates.value);
    auditRecords.value = new Map(auditRecords.value);
    return ids.length;
  }

  function cancelAll(reason = "应用窗口已关闭"): number {
    const count = pendingRequests.value.length;
    // 中止全部进行中的仲裁，再结算入列项
    for (const controller of arbitrationAbortControllers.values()) {
      controller.abort();
    }
    arbitrationAbortControllers.clear();
    arbitrationExternalIndex.clear();
    settleByIds(
      pendingRequests.value.map((item) => item.id),
      "rejected",
      reason
    );
    pendingRequests.value = [];
    arbitrationStates.value = new Map();
    auditRecords.value = new Map();
    arbitrationSessionIndex.clear();
    return count;
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
    arbitrationStates,
    auditRecords,
    getAuditRecord,
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
