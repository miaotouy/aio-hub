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
 * 决策仲裁服务（JEV / 普通 LLM 审批引擎）
 *
 * createDecisionArbiter() 封装：profile 解析、渠道调用、超时、有限重试、
 * 失败降级（fail-closed）、请求指纹防循环、并发上限与审计日志。
 * 本模块不直接依赖 Pinia，由宿主（llm-chat）装配。
 */

import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import type { LlmProfile } from "@/types/llm-profiles";
import { callDecisionApi } from "@/llm-apis/system-one-core";
import { createModuleLogger } from "@/utils/logger";
import { evaluateArbitration } from "./evaluator";
import { buildJevQuestionnaire } from "./jevQuestionnaire";
import { detectDangerFeatures } from "./dangerFeatures";
import {
  buildLlmApprovalRequest,
  evaluateLlmApproval,
  isLlmApprovalModel,
  parseLlmApproval,
} from "./llmApproval";
import {
  DEFAULT_DECISION_ARBITRATION_CONFIG,
  type ArbiterDecision,
  type ArbitrationContext,
  type DecisionArbitrationConfig,
  type DecisionChannelSettings,
  type DecisionEngine,
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
  callSystemOne?: typeof callDecisionApi;
  /** 宿主提供普通聊天调用，保持服务与 Pinia 解耦。 */
  callLlm?: (options: LlmRequestOptions) => Promise<LlmResponse>;
  /** 当前时间（测试可注入）。 */
  now?: () => number;
  /** 最近用户消息摘要读取（按请求所属会话隔离，帮助 intent 评估，可选）。 */
  getRecentUserMessage?: (ctx: ArbitrationContext) => string | undefined;
}

export interface Arbiter {
  arbitrate(
    ctx: ArbitrationContext,
    signal?: AbortSignal
  ): Promise<ArbiterDecision>;
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
      ctx.effectiveArgs ?? ctx.request.args ?? {}
    )}`;
  } catch {
    return `${ctx.request.toolId}#${ctx.request.methodName}`;
  }
}

function escalate(
  reason: string,
  startedAt: number,
  now: () => number,
  model = "",
  engine: DecisionEngine = "jev"
): ArbiterDecision {
  return {
    engine,
    action: "escalate",
    reason,
    audit: model
      ? {
          engine,
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
  const callSystemOne = deps.callSystemOne ?? callDecisionApi;

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

  async function callWithRetry<T>(
    invoke: (signal: AbortSignal, timeoutMs: number) => Promise<T>,
    budgetMs: number,
    maxRetries: number,
    signal?: AbortSignal
  ): Promise<{ response: T | null; retried: boolean }> {
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
        const response = await invoke(controller.signal, remaining);
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
      logger.warn("审批仲裁渠道调用失败（fail-closed）", lastError);
    } else {
      logger.warn("审批仲裁渠道调用超出时间预算（fail-closed）");
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

      const channel = deps.getChannelSettings();
      const engine = channel.engine ?? "jev";
      const manual = (reason: string, model = "") =>
        escalate(reason, startedAt, now, model, engine);
      if (engine !== "jev" && engine !== "llm") {
        return manual("审批引擎配置异常，转人工");
      }

      const danger = detectDangerFeatures({
        ...ctx.request,
        args: ctx.effectiveArgs ?? ctx.request.args ?? {},
      });
      if (danger.features.length > 0) {
        recordEscalation(buildRequestFingerprint(ctx));
        return manual(
          `命中静态危险特征（${danger.features.join("、")}），直接转人工`
        );
      }

      const fingerprint = buildRequestFingerprint(ctx);
      const lastEscalatedAt = recentEscalations.get(fingerprint);
      if (
        lastEscalatedAt !== undefined &&
        now() - lastEscalatedAt < FINGERPRINT_WINDOW_MS
      ) {
        return manual("同一请求短时间内已升级人工，跳过仲裁");
      }
      if (ctx.forceApproval && config.mode !== "aggressive") {
        return manual("强制审批区操作直接转人工（保守灰区模式）");
      }
      if (activeArbitrations >= MAX_CONCURRENT_ARBITRATIONS) {
        return manual("仲裁并发已达上限，转人工");
      }
      if (!channel.profileId) return manual("决策渠道未配置");
      const profile = deps.getProfileById(channel.profileId);
      if (!profile || profile.enabled === false) {
        return manual("决策渠道配置不存在或已停用");
      }
      const approvalModel = profile.models?.find(
        (model) => model.id === channel.model
      );
      if (engine === "jev" && approvalModel?.capabilities?.decision !== true) {
        return manual("决策渠道模型缺失或已不具备 decision 能力，转人工");
      }
      if (
        engine === "llm" &&
        (!approvalModel || !isLlmApprovalModel(approvalModel))
      ) {
        return manual("审批模型缺失或无法用于文本审批，转人工");
      }
      if (engine === "llm" && !deps.callLlm) {
        return manual("普通 LLM 审批调用尚未装配，转人工");
      }
      const modelContext = {
        ...ctx,
        recentUserMessage:
          ctx.recentUserMessage ?? deps.getRecentUserMessage?.(ctx),
      };

      activeArbitrations++;
      try {
        const budgetMs = Math.max(500, channel.timeoutMs);
        let decision: ArbiterDecision;
        if (engine === "llm") {
          let request: LlmRequestOptions;
          try {
            request = buildLlmApprovalRequest(
              modelContext,
              profile.id,
              approvalModel!,
              channel.llmInstructions
            );
          } catch (error) {
            recordEscalation(fingerprint);
            return manual(
              error instanceof Error
                ? error.message
                : "审批上下文不可用，转人工",
              channel.model
            );
          }
          const { response, retried } = await callWithRetry(
            (callSignal, timeoutMs) =>
              deps.callLlm!({
                ...request,
                signal: callSignal,
                timeout: timeoutMs,
              }),
            budgetMs,
            channel.maxRetries,
            signal
          );
          if (signal?.aborted) return manual("仲裁已被取消", channel.model);
          const assessment = response
            ? parseLlmApproval(response.content)
            : null;
          const evaluation = evaluateLlmApproval(assessment, ctx, config);
          decision = {
            engine,
            action: evaluation.action,
            reason: evaluation.reason,
            audit: {
              engine,
              ...(assessment ? { llm: assessment } : {}),
              action: evaluation.action,
              model: channel.model,
              durationMs: now() - startedAt,
              risk: null,
              intent: null,
              verdict: assessment?.action ?? null,
              confidence: null,
              reason: evaluation.reason,
              degraded: assessment === null,
            },
            telemetry: {
              stateChars: JSON.stringify(request.messages).length,
              retried,
            },
          };
        } else {
          const questionnaire = buildJevQuestionnaire(modelContext);
          const { response, retried } = await callWithRetry(
            (callSignal, timeoutMs) =>
              callSystemOne(profile, {
                model: channel.model,
                state: questionnaire.request.state,
                questions: questionnaire.request.questions,
                timeoutMs,
                signal: callSignal,
              }),
            budgetMs,
            channel.maxRetries,
            signal
          );
          if (signal?.aborted) return manual("仲裁已被取消", channel.model);
          const evaluation = evaluateArbitration({
            response,
            config,
            source: ctx.source,
            forceApproval: ctx.forceApproval,
            model: channel.model,
            durationMs: now() - startedAt,
          });
          decision = {
            engine,
            action: evaluation.action,
            reason: evaluation.reason,
            audit: {
              engine,
              action: evaluation.action,
              model: channel.model,
              durationMs: now() - startedAt,
              risk: evaluation.answers.risk,
              intent: evaluation.answers.intent,
              verdict: evaluation.answers.verdict,
              confidence: evaluation.answers.confidence,
              reason: evaluation.reason,
              degraded: response === null,
            },
            telemetry: { stateChars: questionnaire.stateChars, retried },
          };
        }
        if (decision.action === "escalate") recordEscalation(fingerprint);
        logger.info("审批仲裁完成", {
          requestId: ctx.request.requestId,
          toolId: ctx.request.toolId,
          methodName: ctx.request.methodName,
          source: ctx.source,
          engine,
          ...decision.audit,
          ...decision.telemetry,
        });
        return decision;
      } catch (error) {
        logger.error("审批仲裁出现意外错误（fail-closed）", error, {
          requestId: ctx.request.requestId,
        });
        const decision = manual("仲裁流程异常，转人工", channel.model);
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
