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
 * 决策仲裁服务（JEV 灰区仲裁层）
 *
 * createDecisionArbiter() 封装：profile 解析、渠道调用、超时、有限重试、
 * 失败降级（fail-closed）、请求指纹防循环、并发上限与审计日志。
 * 本模块不直接依赖 Pinia，由宿主（llm-chat）装配。
 */

import type {
  SystemOneRequest,
  SystemOneResponse,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";
import { callTypeSafeSystemOneApi } from "@/llm-apis/system-one-core";
import { createModuleLogger } from "@/utils/logger";
import { evaluateArbitration } from "./evaluator";
import { buildJevQuestionnaire } from "./jevQuestionnaire";
import { detectDangerFeatures } from "./dangerFeatures";
import {
  DEFAULT_DECISION_ARBITRATION_CONFIG,
  type ArbiterDecision,
  type ArbitrationContext,
  type DecisionArbitrationConfig,
  type DecisionChannelSettings,
} from "./types";

const logger = createModuleLogger("decision-arbiter");

/** 同一请求指纹重复 escalate 的跳过窗口（红线 8）。 */
const FINGERPRINT_WINDOW_MS = 60_000;
/** 请求指纹记录上限，超过后清理过期项。 */
const FINGERPRINT_MAX_ENTRIES = 200;
/** 并发仲裁上限（§2.4 要点 5）。 */
const MAX_CONCURRENT_ARBITRATIONS = 3;
/** 重试退避间隔（红线 9）。 */
const RETRY_BACKOFF_MS = 250;

export interface DecisionArbiterDeps {
  /** 全局决策渠道设置。 */
  getChannelSettings: () => DecisionChannelSettings;
  /** Agent 级仲裁配置（含 enabled / mode / 阈值）。 */
  getArbitrationConfig: (agentId?: string) => DecisionArbitrationConfig;
  /** profile 解析。 */
  getProfileById: (profileId: string) => LlmProfile | undefined;
  /** 渠道调用（测试可注入 mock）。 */
  callSystemOne?: typeof callTypeSafeSystemOneApi;
  /** 当前时间（测试可注入）。 */
  now?: () => number;
  /** 最近用户消息摘要读取（按请求所属会话隔离，帮助 intent 评估，可选）。 */
  getRecentUserMessage?: (ctx: ArbitrationContext) => string | undefined;
}

export interface Arbiter {
  arbitrate(ctx: ArbitrationContext, signal?: AbortSignal): Promise<ArbiterDecision>;
  /** 快速判定该请求是否启用仲裁（未启用时 store 直接走人工，不写等待态）。 */
  isArbitrationEnabled(ctx: ArbitrationContext): boolean;
}

/** 可重试错误模式：429 / 529 / 网络层错误（红线 9）。 */
const RETRYABLE_ERROR_PATTERN =
  /\b429\b|\b529\b|network|fetch failed|connection|econn|socket|ECONNRESET|ECONNREFUSED/i;
const ABORT_ERROR_PATTERN = /abort|cancel/i;

function buildRequestFingerprint(ctx: ArbitrationContext): string {
  try {
    return `${ctx.request.toolId}#${ctx.request.methodName}#${JSON.stringify(
      ctx.request.args ?? {}
    )}`;
  } catch {
    return `${ctx.request.toolId}#${ctx.request.methodName}`;
  }
}

function escalate(
  reason: string,
  startedAt: number,
  now: () => number,
  model = ""
): ArbiterDecision {
  return {
    action: "escalate",
    reason,
    audit: model
      ? {
          action: "escalate",
          model,
          durationMs: now() - startedAt,
          risk: null,
          intent: null,
          verdict: null,
          confidence: null,
          reason,
          degraded: true,
        }
      : null,
  };
}

export function createDecisionArbiter(deps: DecisionArbiterDeps): Arbiter {
  const now = deps.now ?? (() => Date.now());
  const callSystemOne = deps.callSystemOne ?? callTypeSafeSystemOneApi;

  function resolveConfig(ctx: ArbitrationContext): DecisionArbitrationConfig {
    return (
      deps.getArbitrationConfig(ctx.agentId) ??
      DEFAULT_DECISION_ARBITRATION_CONFIG
    );
  }

  /** 指纹 → 最近一次 escalate 时间。 */
  const recentEscalations = new Map<string, number>();
  let activeArbitrations = 0;

  function recordEscalation(fingerprint: string): void {
    recentEscalations.set(fingerprint, now());
    if (recentEscalations.size > FINGERPRINT_MAX_ENTRIES) {
      const cutoff = now() - FINGERPRINT_WINDOW_MS * 2;
      for (const [key, ts] of recentEscalations) {
        if (ts < cutoff) recentEscalations.delete(key);
      }
    }
  }

  async function callWithRetry(
    profile: LlmProfile,
    request: SystemOneRequest,
    budgetMs: number,
    maxRetries: number,
    signal?: AbortSignal
  ): Promise<{ response: SystemOneResponse | null; retried: boolean }> {
    const deadline = now() + budgetMs;
    let retried = false;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= Math.max(0, maxRetries); attempt++) {
      const remaining = deadline - now();
      if (remaining <= 50) {
        break;
      }
      if (signal?.aborted) {
        break;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      const onExternalAbort = () => controller.abort();
      signal?.addEventListener("abort", onExternalAbort, { once: true });

      try {
        const response = await callSystemOne(profile, {
          ...request,
          timeoutMs: remaining,
          signal: controller.signal,
        });
        return { response, retried };
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message : String(error ?? "");
        if (ABORT_ERROR_PATTERN.test(message)) {
          break;
        }
        const retryable = RETRYABLE_ERROR_PATTERN.test(message);
        if (!retryable || attempt >= maxRetries) {
          break;
        }
        const backoff = Math.min(RETRY_BACKOFF_MS, deadline - now());
        if (backoff <= 0) {
          break;
        }
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onExternalAbort);
      }
    }

    if (lastError) {
      logger.warn("JEV 仲裁渠道调用失败（fail-closed）", lastError);
    } else {
      logger.warn("JEV 仲裁渠道调用超出时间预算（fail-closed）");
    }
    return { response: null, retried };
  }

  return {
    isArbitrationEnabled(ctx: ArbitrationContext): boolean {
      return resolveConfig(ctx).enabled;
    },
    async arbitrate(
      ctx: ArbitrationContext,
      signal?: AbortSignal
    ): Promise<ArbiterDecision> {
      const startedAt = now();
      if (signal?.aborted) {
        return escalate("仲裁已被取消", startedAt, now);
      }
      const config = resolveConfig(ctx);

      // --- 未启用：直接人工 ---
      if (!config.enabled) {
        return escalate("决策仲裁未启用", startedAt, now);
      }

      // --- 红线 6：静态危险特征跳过仲裁 ---
      const danger = detectDangerFeatures(ctx.request);
      if (danger.features.length > 0) {
        const decision = escalate(
          `命中静态危险特征（${danger.features.join("、")}），直接转人工`,
          startedAt,
          now
        );
        recordEscalation(buildRequestFingerprint(ctx));
        return decision;
      }

      // --- 红线 8：防仲裁循环 ---
      const fingerprint = buildRequestFingerprint(ctx);
      const lastEscalatedAt = recentEscalations.get(fingerprint);
      if (
        lastEscalatedAt !== undefined &&
        now() - lastEscalatedAt < FINGERPRINT_WINDOW_MS
      ) {
        return escalate(
          "同一请求短时间内已升级人工，跳过仲裁",
          startedAt,
          now
        );
      }

      // --- 红线 6：gray-zone 下强制审批直接人工 ---
      if (ctx.forceApproval && config.mode !== "aggressive") {
        return escalate("强制审批区操作直接转人工（保守灰区模式）", startedAt, now);
      }

      // --- 并发上限（§2.4 要点 5）---
      if (activeArbitrations >= MAX_CONCURRENT_ARBITRATIONS) {
        return escalate("仲裁并发已达上限，转人工", startedAt, now);
      }

      // --- 渠道解析 ---
      const channel = deps.getChannelSettings();
      if (!channel.profileId) {
        return escalate("决策渠道未配置", startedAt, now);
      }
      const profile = deps.getProfileById(channel.profileId);
      // 渠道设置持久化后可能过期：profile 被停用 / 删除、channel.model 已不存在
      // 或模型不再具备 decision 能力时，不允许沿用旧配置继续调用（fail-closed）。
      if (!profile || profile.enabled === false) {
        return escalate("决策渠道配置不存在或已停用", startedAt, now);
      }
      const decisionModel = profile.models?.find(
        (model) => model.id === channel.model
      );
      if (decisionModel?.capabilities?.decision !== true) {
        return escalate(
          "决策渠道模型缺失或已不具备 decision 能力，转人工",
          startedAt,
          now
        );
      }

      // --- JEV 问答构造 ---
      const questionnaire = buildJevQuestionnaire({
        ...ctx,
        recentUserMessage:
          ctx.recentUserMessage ?? deps.getRecentUserMessage?.(ctx),
      });

      activeArbitrations++;
      try {
        const budgetMs = Math.max(500, channel.timeoutMs);
        const { response, retried } = await callWithRetry(
          profile,
          {
            model: channel.model,
            state: questionnaire.request.state,
            questions: questionnaire.request.questions,
          },
          budgetMs,
          channel.maxRetries,
          signal
        );

        const durationMs = now() - startedAt;
        const evaluation = evaluateArbitration({
          response,
          config,
          source: ctx.source,
          forceApproval: ctx.forceApproval,
          model: channel.model,
          durationMs,
        });

        const decision: ArbiterDecision = {
          action: evaluation.action,
          reason: evaluation.reason,
          audit: {
            action: evaluation.action,
            model: channel.model,
            durationMs,
            risk: evaluation.answers.risk,
            intent: evaluation.answers.intent,
            verdict: evaluation.answers.verdict,
            confidence: evaluation.answers.confidence,
            reason: evaluation.reason,
            degraded: response === null,
          },
          telemetry: {
            stateChars: questionnaire.stateChars,
            retried,
          },
        };

        // escalate / deny 均记录指纹，deny 后同指纹重试将走人工
        if (evaluation.action === "escalate") {
          recordEscalation(fingerprint);
        }

        logger.info("JEV 仲裁完成", {
          requestId: ctx.request.requestId,
          toolId: ctx.request.toolId,
          methodName: ctx.request.methodName,
          source: ctx.source,
          model: channel.model,
          action: decision.action,
          reason: decision.reason,
          risk: evaluation.answers.risk,
          intent: evaluation.answers.intent,
          verdict: evaluation.answers.verdict,
          confidence: evaluation.answers.confidence,
          thresholds: {
            autoRiskThreshold: config.autoRiskThreshold,
            denyRiskThreshold: config.denyRiskThreshold,
            intentThreshold: config.intentThreshold,
            confidenceThreshold: config.confidenceThreshold,
          },
          durationMs,
          stateChars: questionnaire.stateChars,
          retried,
          degraded: response === null,
        });

        return decision;
      } catch (error) {
        logger.error("JEV 仲裁出现意外错误（fail-closed）", error, {
          requestId: ctx.request.requestId,
        });
        const decision = escalate("仲裁流程异常，转人工", startedAt, now);
        recordEscalation(fingerprint);
        return decision;
      } finally {
        activeArbitrations--;
      }
    },
  };
}

export * from "./types";
export { evaluateArbitration } from "./evaluator";
export { buildJevQuestionnaire } from "./jevQuestionnaire";
export { detectDangerFeatures } from "./dangerFeatures";
export { describeArbitration } from "./presentation";
export type { ArbitrationPresentation } from "./presentation";
export {
  getDecisionChannelSettings,
  loadDecisionChannelSettings,
  saveDecisionChannelSettings,
} from "./channelConfig";
