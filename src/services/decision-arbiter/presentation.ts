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
 * 仲裁审计记录的共享展示判定（纯函数，零依赖）。
 *
 * 消息卡片与审批浮窗都读取同一份旁路审计映射，展示判定必须收口在这里，
 * 避免同一 action 在多个 UI 中被解释成互相矛盾的文案
 * （例如把 escalate 误显示为「Jev 自动放行」）。
 *
 * 这里只产出结构化语义，具体文案由各 UI 决定。
 */

import type { ArbiterAction, ArbiterAuditInfo } from "./types";

export interface ArbitrationPresentation {
  /** 审计来源：JEV 仲裁或人工确认。 */
  kind: "jev" | "manual";
  /**
   * 裁决动作。escalate 表示 JEV 未通过、建议人工确认，
   * 调用方不得将其当作 approve 渲染。
   */
  action: ArbiterAction;
  /** 是否为渠道降级（fail-closed escalate，JEV 不可用时的安全兜底）。 */
  degraded: boolean;
  /** 风险概率百分比（0~100），无有效值为 null。 */
  riskPercent: number | null;
  /** 意图一致概率百分比（0~100），无有效值为 null。 */
  intentPercent: number | null;
  /** 裁决原因。 */
  reason: string | null;
  /** 仲裁模型名（仅 JEV 来源有值）。 */
  model: string | null;
  /** 端到端仲裁耗时 ms（仅 JEV 来源有值）。 */
  durationMs: number | null;
}

function toPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

/**
 * 将旁路审计记录解析为展示判定；无有效放行来源时返回 null。
 *
 * 注意：origin 为 timeout / cancelled 时不产生放行徽标，返回 null。
 */
export function describeArbitration(
  info: ArbiterAuditInfo | null | undefined
): ArbitrationPresentation | null {
  if (!info) return null;

  if (info.origin === "manual") {
    return {
      kind: "manual",
      action: "approve",
      degraded: false,
      riskPercent: null,
      intentPercent: null,
      reason: null,
      model: null,
      durationMs: null,
    };
  }

  if (info.origin === "jev" && info.arbiter) {
    const arbiter = info.arbiter;
    return {
      kind: "jev",
      action: arbiter.action,
      degraded: arbiter.degraded === true,
      riskPercent: toPercent(arbiter.risk),
      intentPercent: toPercent(arbiter.intent),
      reason: arbiter.reason ?? null,
      model: arbiter.model ?? null,
      durationMs:
        arbiter.durationMs === null || arbiter.durationMs === undefined
          ? null
          : arbiter.durationMs,
    };
  }

  return null;
}
