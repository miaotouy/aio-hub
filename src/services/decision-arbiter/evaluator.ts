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
 * JEV 裁决器（纯函数，零依赖，可全量单测）
 *
 * 输入 SystemOneResponse + 配置，输出 approve / deny / escalate。
 * 核心原则：
 * - 矛盾即升级：verdict 与 noul 分数相悖时不信任裁决；
 * - fail-closed：答案类型异常、缺失、越界一律 escalate；
 * - 双向 confidence 门槛：approve 与 deny 都受 confidence 保护。
 */

import type { SystemOneResponse } from "@aiohub/llm-core";
import type {
  ArbiterAction,
  ArbiterAnswerSnapshot,
  DecisionArbitrationConfig,
} from "./types";
import { isExternalSource } from "./types";

export interface EvaluatorInput {
  response: SystemOneResponse | null;
  config: DecisionArbitrationConfig;
  /** 请求来源（用于外部来源隔离）。 */
  source: import("./types").ArbitrationSource;
  /** 是否命中强制审批（aggressive 模式下有更严门槛）。 */
  forceApproval: boolean;
  /** JEV 模型名，用于审计快照。 */
  model: string;
  /** 端到端耗时。 */
  durationMs: number;
}

export interface EvaluatorOutput {
  action: ArbiterAction;
  reason: string;
  answers: ArbiterAnswerSnapshot;
}

function toSnapshot(response: SystemOneResponse | null): ArbiterAnswerSnapshot {
  const empty: ArbiterAnswerSnapshot = {
    risk: null,
    intent: null,
    verdict: null,
    confidence: null,
  };
  if (!response?.answers) return empty;
  const { answers } = response;
  const risk = answers.risk;
  const intent = answers.intent;
  const verdict = answers.verdict;
  return {
    risk:
      risk && risk.type === "noul" && isUnitInterval(risk.noul)
        ? risk.noul
        : null,
    intent:
      intent && intent.type === "noul" && isUnitInterval(intent.noul)
        ? intent.noul
        : null,
    verdict: verdict && verdict.type === "choice" ? verdict.choice : null,
    confidence:
      verdict && verdict.type === "choice" && isUnitInterval(verdict.confidence)
        ? verdict.confidence
        : null,
  };
}

/**
 * 数值必须严格处于 [0, 1] 才被视为合法答案；
 * 越界值不允许截断修正（异常响应不得被修正后继续参与裁决）。
 */
function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function evaluateArbitration(input: EvaluatorInput): EvaluatorOutput {
  const { config } = input;
  const answers = toSnapshot(input.response);

  const failClosed = (reason: string): EvaluatorOutput => ({
    action: "escalate",
    reason,
    answers,
  });

  // --- 答案完整性校验（fail-closed）---
  if (!input.response || !input.response.answers) {
    return failClosed("JEV 响应缺失，转人工");
  }
  if (answers.risk === null || answers.intent === null) {
    return failClosed("JEV 答案类型异常（risk/intent 缺失或非法），转人工");
  }
  if (
    answers.verdict === null ||
    !["approve", "deny", "escalate"].includes(answers.verdict)
  ) {
    return failClosed("JEV 裁决答案缺失或非法，转人工");
  }
  if (answers.confidence === null) {
    return failClosed("JEV 置信度缺失或非法，转人工");
  }

  const { risk, intent, verdict, confidence } = answers;

  // --- 外部来源隔离（红线 5）---
  const externalAutoAllowed =
    config.autoApproveExternalSources || !isExternalSource(input.source);
  if (!externalAutoAllowed && verdict === "approve") {
    return {
      action: "escalate",
      reason: "外部来源默认不自动放行，需人工确认",
      answers,
    };
  }

  // --- confidence 双向门槛 ---
  if (confidence < config.confidenceThreshold) {
    return {
      action: "escalate",
      reason: `置信度 ${Math.round(confidence * 100)}% 低于门槛 ${Math.round(
        config.confidenceThreshold * 100
      )}%，不采纳裁决`,
      answers,
    };
  }

  // --- 矛盾即升级 ---
  if (verdict === "approve" && risk >= config.denyRiskThreshold) {
    return {
      action: "escalate",
      reason: "裁决与风险分数矛盾（approve 但高风险），转人工",
      answers,
    };
  }
  if (
    verdict === "deny" &&
    risk < config.denyRiskThreshold &&
    risk <= config.autoRiskThreshold &&
    intent >= config.intentThreshold
  ) {
    return {
      action: "escalate",
      reason: "裁决与风险分数矛盾（deny 但各项均处安全区），转人工",
      answers,
    };
  }

  // --- deny：verdict=deny 或 risk 越过高危线 ---
  if (verdict === "deny" || risk >= config.denyRiskThreshold) {
    return {
      action: "deny",
      reason: `Jev 风险拦截（风险 ${Math.round(risk * 100)}%）`,
      answers,
    };
  }

  // --- approve：verdict=approve 且 risk/intent 均处安全区 ---
  if (verdict === "approve") {
    const riskCap = input.forceApproval
      ? Math.min(config.forceApprovalRiskThreshold, config.autoRiskThreshold)
      : config.autoRiskThreshold;
    if (risk <= riskCap && intent >= config.intentThreshold) {
      return {
        action: "approve",
        reason: `Jev 自动放行（风险 ${Math.round(risk * 100)}%，意图 ${Math.round(
          intent * 100
        )}%）`,
        answers,
      };
    }
    return {
      action: "escalate",
      reason: "风险或意图未达自动放行标准，转人工",
      answers,
    };
  }

  // --- verdict = escalate / 模糊区间 ---
  return {
    action: "escalate",
    reason: "Jev 建议人工确认",
    answers,
  };
}
