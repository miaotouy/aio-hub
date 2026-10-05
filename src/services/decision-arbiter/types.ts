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

/**
 * JEV 决策仲裁服务类型定义
 *
 * 定位：在「需要审批」与「弹人工」之间插入一个可选的决策模型仲裁环节。
 * 全部类型保持零依赖（不依赖 Pinia / Tauri），便于纯逻辑单测。
 */

import type { ParsedToolRequest } from "@/tools/tool-calling/types";

/** 审批请求来源，用于外部来源隔离（红线 5）。 */
export type ArbitrationSource =
  | "orchestrator"
  | "vcp-log"
  | "vcp-node"
  | "vcp-file-transfer"
  | "sync"
  | "background";

/** 仲裁最终裁决动作。 */
export type ArbiterAction = "approve" | "deny" | "escalate";

/**
 * 仲裁输入上下文。
 *
 * request 直接复用 ParsedToolRequest，requestId 即消息卡片携带的 id
 * （红线 7 契约：arbitrationStates / auditRecords 均以此为主键）。
 */
export interface ArbitrationContext {
  request: ParsedToolRequest;
  /** 请求来源，外部来源默认只允许 escalate/deny。 */
  source: ArbitrationSource;
  /** 是否命中安全策略强制审批（checkSecurityPolicy → approve）。 */
  forceApproval: boolean;
  /** 发起请求所属会话 ID（JEV 上下文按会话隔离，外部请求无对应会话时不读用户消息）。 */
  sessionId?: string;
  /** 发起会话绑定的 Agent，用于解析 Agent 级仲裁配置。 */
  agentId?: string;
  /** Agent 显示名，用于 JEV state 摘要。 */
  agentName?: string;
  /** 最近一条用户消息摘要，用于 JEV intent 评估。 */
  recentUserMessage?: string;
  /** 发起时间戳（ms）。 */
  requestedAt?: number;
}

/** JEV answers 快照，用于 UI 展示与审计。 */
export interface ArbiterAnswerSnapshot {
  /** risk noul 概率（0~1），解析失败为 null。 */
  risk: number | null;
  /** intent noul 概率（0~1），解析失败为 null。 */
  intent: number | null;
  /** verdict choice 结论。 */
  verdict: string | null;
  /** verdict confidence（0~1），解析失败为 null。 */
  confidence: number | null;
}

/** 审计信息旁路对象（红线 7：不改 ToolApprovalResult 字符串契约）。 */
export interface ArbiterAuditInfo {
  origin: "rule" | "jev" | "manual" | "timeout" | "cancelled";
  /** 仅 origin = "jev" 时有值。 */
  arbiter?: {
    action: ArbiterAction;
    model: string;
    /** 端到端仲裁耗时（ms），含重试。 */
    durationMs: number;
    risk: number | null;
    intent: number | null;
    verdict: string | null;
    confidence: number | null;
    /** 裁决原因（evaluator 产出的可读说明）。 */
    reason: string;
    /** 是否为渠道降级（fail-closed escalate）。 */
    degraded: boolean;
  };
}

/** 仲裁结果。 */
export interface ArbiterDecision {
  action: ArbiterAction;
  /** 裁决原因（人类可读，用于审批条与审计）。 */
  reason: string;
  /** 审计快照，escalate 时也保留（供浮窗展示 JEV 建议与证据）。 */
  audit: ArbiterAuditInfo["arbiter"] | null;
  /** state 摘要长度等遥测信息。 */
  telemetry?: {
    stateChars: number;
    retried: boolean;
  };
}

/** 仲裁等待态，与消息卡片共享的响应式状态。 */
export type ArbitrationState =
  | "arbitrating"
  | "escalated"
  | "auto-approved"
  | "auto-denied";

/**
 * JEV 问答阈值配置（Agent 级，ToolCallConfig 扩展）。
 * 所有阈值用户可配，默认取保守值（宁可多升级人工）。
 */
export interface DecisionArbitrationConfig {
  enabled: boolean;
  /** gray-zone：强制审批跳过仲裁；aggressive：强制审批也送 JEV（更严门槛）。 */
  mode: "gray-zone" | "aggressive";
  autoRiskThreshold: number;
  denyRiskThreshold: number;
  intentThreshold: number;
  confidenceThreshold: number;
  /** 仅 aggressive 模式生效。 */
  forceApprovalRiskThreshold: number;
  /** VCP 等外部来源是否允许自动 approve（默认 false，红线 5）。 */
  autoApproveExternalSources: boolean;
}

export const DEFAULT_DECISION_ARBITRATION_CONFIG: DecisionArbitrationConfig = {
  enabled: false,
  mode: "gray-zone",
  autoRiskThreshold: 0.15,
  denyRiskThreshold: 0.75,
  intentThreshold: 0.6,
  confidenceThreshold: 0.7,
  forceApprovalRiskThreshold: 0.05,
  autoApproveExternalSources: false,
};

/** 全局决策渠道设置（设置中心 → LLM 服务，全局单例）。 */
export interface DecisionChannelSettings {
  /** 需标记 capabilities.decision 的 profile，null 表示未配置。 */
  profileId: string | null;
  /** 模型 ID，默认 jev-latest。 */
  model: string;
  /** 单次仲裁总超时预算（含重试），默认 8000ms。 */
  timeoutMs: number;
  /** 仅对 429/529/网络错误重试，默认 1。 */
  maxRetries: number;
}

export const DEFAULT_DECISION_CHANNEL_SETTINGS: DecisionChannelSettings = {
  profileId: null,
  model: "jev-latest",
  timeoutMs: 8_000,
  maxRetries: 1,
};

/** 判定来源是否为外部（VCP / 跨窗口同步）。 */
export function isExternalSource(source: ArbitrationSource): boolean {
  return (
    source !== "orchestrator" &&
    source !== "background"
  );
}

/**
 * 审批仲裁器契约（§2.3 收口点依赖注入）。
 *
 * store 侧仅依赖此接口，不感知渠道与配置细节；
 * 宿主（llm-chat）用 createDecisionArbiter() 装配。
 */
export interface ApprovalArbiter {
  arbitrate(ctx: ArbitrationContext, signal?: AbortSignal): Promise<ArbiterDecision>;
  /**
   * 快速判定该请求是否启用仲裁。
   *
   * store 在写入 `arbitrating` 等待态之前调用：返回 false 时直接进入原有人工
   * 审批流程，不再产生「等待 AI 审核」的假状态。省略时视为启用（兼容仅实现
   * arbitrate 的测试替身）。
   */
  isArbitrationEnabled?(ctx: ArbitrationContext): boolean;
}
