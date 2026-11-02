import { resolveModelExecution } from "./model-execution-routing";
import type {
  LlmExecutionModel,
  LlmExecutionProfile,
  LlmOperation,
} from "./types/routing";

export interface ChannelTarget {
  profileId: string;
  modelId: string;
}
export interface VirtualChannelConfig {
  mode: "failover";
  members: string[];
  maxAttempts: number;
  totalTimeoutMs: number;
  attemptTimeoutMs?: number;
}
export type VirtualModelBindings = Partial<
  Record<LlmOperation, ChannelTarget[]>
>;
export interface ChannelModel extends LlmExecutionModel {
  capabilities?: object;
  virtualBindings?: VirtualModelBindings;
}
export interface ChannelProfile extends LlmExecutionProfile {
  id: string;
  enabled: boolean;
  models: ChannelModel[];
  virtualChannel?: VirtualChannelConfig;
  toolHandling?: { callConsumer: string; upstreamProtocol: string };
}
export interface ChannelAttempt extends ChannelTarget {
  adapterId: string;
  startedAt: number;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  decision?: {
    action: "retry" | "stop";
    reason:
      | "output_started"
      | "non_retryable_error"
      | "attempt_budget_exhausted"
      | "transient_error";
  };
}
export interface ChannelExecution {
  requested: ChannelTarget;
  actual: ChannelTarget;
  operation: LlmOperation;
  attempts: ChannelAttempt[];
}
export class ChannelConfigurationError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "ChannelConfigurationError";
  }
}
export class ChannelExecutionError extends Error {
  readonly retryable = false;
  constructor(
    message: string,
    readonly attempts: ChannelAttempt[],
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? message + "：" + cause.message : message);
    this.name = "ChannelExecutionError";
  }
}
export function isChannelRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    retryable?: boolean;
    name?: string;
    status?: number;
    statusCode?: number;
    code?: unknown;
    message?: string;
    response?: { status?: number };
  };
  if (e.retryable === false || e.name === "AbortError") return false;
  const status =
    e.status ??
    e.statusCode ??
    e.response?.status ??
    (typeof e.code === "number" ? e.code : undefined);
  if (status !== undefined)
    return (
      status === 408 ||
      status === 429 ||
      (status >= 500 && status < 600 && status !== 504 && status !== 524)
    );
  return (
    e.name === "TimeoutError" ||
    (error instanceof TypeError &&
      /fetch|network|connect/i.test(e.message ?? ""))
  );
}
export function resolveChannelCandidates<P extends ChannelProfile>(input: {
  profile: P;
  modelId: string;
  operation: LlmOperation;
  profiles: readonly P[];
  requiredCapabilities?: readonly string[];
  allowDisabledProfile?: boolean;
}): Array<{ profile: P; model: P["models"][number]; adapterId: string }> {
  const { profile, modelId, operation, profiles } = input;
  if (!profile.enabled && !input.allowDisabledProfile)
    throw new ChannelConfigurationError("渠道已停用，请检查渠道配置");
  const model = profile.models.find((m) => m.id === modelId);
  if (!model)
    throw new ChannelConfigurationError("模型绑定已失效，请重新选择模型");
  const virtual = profile.type === "virtual";
  const config = profile.virtualChannel;
  if (
    virtual &&
    (!config ||
      config.mode !== "failover" ||
      !Array.isArray(config.members) ||
      !config.members.every((id) => typeof id === "string" && id.length > 0) ||
      !Number.isInteger(config.maxAttempts) ||
      config.maxAttempts < 1 ||
      !Number.isFinite(config.totalTimeoutMs) ||
      config.totalTimeoutMs <= 0 ||
      config.totalTimeoutMs > 3600000 ||
      (config.attemptTimeoutMs !== undefined &&
        (!Number.isFinite(config.attemptTimeoutMs) ||
          config.attemptTimeoutMs <= 0)) ||
      new Set(config.members).size !== config.members.length)
  ) {
    throw new ChannelConfigurationError(
      "虚拟渠道配置无效，请检查成员与请求预算"
    );
  }
  const targets = virtual
    ? model.virtualBindings?.[operation]
    : [{ profileId: profile.id, modelId }];
  if (!Array.isArray(targets) || !targets.length)
    throw new ChannelConfigurationError("请为该操作配置候选模型");
  const seen = new Set<string>();
  let adapterId: string | undefined;
  return targets.map((target) => {
    if (
      !target ||
      typeof target.profileId !== "string" ||
      !target.profileId ||
      typeof target.modelId !== "string" ||
      !target.modelId
    )
      throw new ChannelConfigurationError("候选目标格式无效，请重新绑定模型");
    const key = JSON.stringify([target.profileId, target.modelId]);
    if (seen.has(key))
      throw new ChannelConfigurationError("候选模型重复，请检查主备配置");
    seen.add(key);
    if (virtual && !config!.members.includes(target.profileId))
      throw new ChannelConfigurationError(
        "候选模型未加入渠道成员，请检查组合配置"
      );
    const actualProfile = virtual
      ? profiles.find((p) => p.id === target.profileId)
      : profile;
    if (
      !actualProfile ||
      (virtual && (!actualProfile.enabled || actualProfile.type === "virtual"))
    )
      throw new ChannelConfigurationError(
        "成员渠道已删除或停用，请修复组合配置"
      );
    if (
      virtual &&
      operation === "chat" &&
      ((profile.toolHandling?.callConsumer ?? "aio") !==
        (actualProfile.toolHandling?.callConsumer ?? "aio") ||
        (profile.toolHandling?.upstreamProtocol ?? "none") !==
          (actualProfile.toolHandling?.upstreamProtocol ?? "none"))
    )
      throw new ChannelConfigurationError(
        "主备渠道的工具处理方式不同，请检查组合配置"
      );
    const actualModel = actualProfile.models.find(
      (m) => m.id === target.modelId
    );
    if (!actualModel)
      throw new ChannelConfigurationError("成员模型已删除，请修复组合映射");
    const operationCapability = {
      embedding: "embedding",
      rerank: "rerank",
      decision: "decision",
      image: "imageGeneration",
      video: "videoGeneration",
      audio: "audioGeneration",
      music: "musicGeneration",
      chat: undefined,
    }[operation];
    for (const capability of [
      ...(input.requiredCapabilities ?? []),
      ...(virtual && operationCapability ? [operationCapability] : []),
    ]) {
      if (
        !(actualModel.capabilities as Record<string, unknown> | undefined)?.[
          capability
        ]
      )
        throw new ChannelConfigurationError("候选模型能力不足，请检查模型映射");
    }
    // Embedding requires verified space compatibility before multi-target use.
    if (virtual && operation === "embedding" && targets.length > 1)
      throw new ChannelConfigurationError(
        "向量模型组合需要先确认向量空间兼容性，请保留单个候选"
      );
    const execution = resolveModelExecution({
      profile: actualProfile,
      model: actualModel,
      operation,
    });
    if (adapterId && execution.adapterId !== adapterId)
      throw new ChannelConfigurationError(
        "主备模型的协议不兼容，请选择相同协议的模型"
      );
    adapterId = execution.adapterId;
    return {
      profile: actualProfile,
      model: actualModel,
      adapterId: execution.adapterId,
    };
  });
}

export async function executeChannelRequest<
  P extends ChannelProfile,
  R,
>(input: {
  profile: P;
  modelId: string;
  operation: LlmOperation;
  getProfiles: () => readonly P[];
  signal?: AbortSignal;
  timeoutMs?: number;
  requiredCapabilities?: readonly string[];
  allowDisabledProfile?: boolean;
  pinnedTarget?: ChannelTarget;
  execute: (target: {
    profile: P;
    model: P["models"][number];
    signal: AbortSignal;
    timeoutMs: number;
    attempt: number;
    markOutput: () => void;
  }) => Promise<R>;
}): Promise<{ response: R; execution: ChannelExecution }> {
  if (input.signal?.aborted)
    throw input.signal.reason ?? new DOMException("已取消", "AbortError");
  let candidates = resolveChannelCandidates({
    ...input,
    profiles: input.getProfiles(),
  });
  if (input.pinnedTarget) {
    candidates = candidates.filter(
      (candidate) =>
        candidate.profile.id === input.pinnedTarget!.profileId &&
        candidate.model.id === input.pinnedTarget!.modelId
    );
    if (!candidates.length)
      throw new ChannelConfigurationError(
        "推理状态绑定的成员已移出组合，请恢复原绑定或新建会话"
      );
  }
  const config = input.profile.virtualChannel
    ? { ...input.profile.virtualChannel }
    : undefined;
  const virtual = input.profile.type === "virtual";
  const budget = Math.min(
    input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : Infinity,
    virtual ? config!.totalTimeoutMs : 300000
  );
  const deadline = Date.now() + budget;
  const attempts: ChannelAttempt[] = [];
  let lastError: unknown;
  const count = virtual ? Math.min(config!.maxAttempts, candidates.length) : 1;
  for (const candidate of candidates.slice(0, count)) {
    if (input.signal?.aborted)
      throw input.signal.reason ?? new DOMException("已取消", "AbortError");
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const current = input
      .getProfiles()
      .find((p) => p.id === candidate.profile.id);
    if (
      !current ||
      (!current.enabled && (virtual || !input.allowDisabledProfile)) ||
      !current.models.some((m) => m.id === candidate.model.id)
    )
      throw new ChannelConfigurationError(
        "执行期间成员配置已变化，请重新发起请求"
      );
    const currentModel = current.models.find(
      (m) => m.id === candidate.model.id
    )!;
    const currentAdapter = resolveModelExecution({
      profile: current,
      model: currentModel,
      operation: input.operation,
    }).adapterId;
    if (currentAdapter !== candidate.adapterId)
      throw new ChannelConfigurationError(
        "执行期间成员协议已变化，请重新发起请求"
      );
    for (const capability of input.requiredCapabilities ?? []) {
      if (
        !(currentModel.capabilities as Record<string, unknown> | undefined)?.[
          capability
        ]
      )
        throw new ChannelConfigurationError(
          "执行期间成员能力已变化，请重新检查组合配置"
        );
    }
    const attemptTimeout = Math.min(
      remaining,
      virtual
        ? (config!.attemptTimeoutMs ?? Math.min(60000, config!.totalTimeoutMs))
        : remaining
    );
    const controller = new AbortController();
    const forwardAbort = () =>
      controller.abort(
        input.signal?.reason ?? new DOMException("已取消", "AbortError")
      );
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    let hasOutput = false;
    const startedAt = Date.now();
    const target = {
      profileId: candidate.profile.id,
      modelId: candidate.model.id,
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: (() => void) | undefined;
    try {
      const cancelled = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", rejectAbort, {
          once: true,
        });
        timeout = setTimeout(() => {
          const error = new Error("渠道请求已超时");
          error.name = "TimeoutError";
          controller.abort(error);
        }, attemptTimeout);
      });
      const response = await Promise.race([
        input.execute({
          profile: current,
          model: currentModel,
          signal: controller.signal,
          timeoutMs: attemptTimeout,
          attempt: attempts.length + 1,
          markOutput: () => {
            hasOutput = true;
          },
        }),
        cancelled,
      ]);
      attempts.push({
        ...target,
        adapterId: candidate.adapterId,
        startedAt,
        durationMs: Date.now() - startedAt,
        status: "success",
      });
      return {
        response,
        execution: {
          requested: { profileId: input.profile.id, modelId: input.modelId },
          actual: target,
          operation: input.operation,
          attempts,
        },
      };
    } catch (error) {
      lastError = error;
      const reason = hasOutput
        ? "output_started"
        : !isChannelRetryableError(error)
          ? "non_retryable_error"
          : attempts.length + 1 >= count
            ? "attempt_budget_exhausted"
            : "transient_error";
      attempts.push({
        ...target,
        adapterId: candidate.adapterId,
        startedAt,
        durationMs: Date.now() - startedAt,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        decision: {
          action: reason === "transient_error" ? "retry" : "stop",
          reason,
        },
      });
      if (input.signal?.aborted) throw input.signal.reason ?? error;
      if (!virtual) throw error;
      if (hasOutput || !isChannelRetryableError(error))
        throw new ChannelExecutionError(
          "渠道执行中断，请检查请求记录后重试",
          attempts,
          error
        );
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      controller.abort(new DOMException("本次渠道尝试已结束", "AbortError"));
      if (rejectAbort)
        controller.signal.removeEventListener("abort", rejectAbort);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }
  throw new ChannelExecutionError(
    "候选渠道均未完成请求，请检查渠道状态",
    attempts,
    lastError
  );
}

/** Opaque provider replay state stays on the member that produced it. */
export function resolveChannelReplayTarget(
  artifacts: readonly { replayPolicy: string; channelTarget?: ChannelTarget }[],
  candidateCount: number
): ChannelTarget | undefined {
  const replay = artifacts.filter(
    (artifact) => artifact.replayPolicy !== "never"
  );
  if (!replay.length) return undefined;
  const targets = new Map(
    replay
      .filter((artifact) => artifact.channelTarget)
      .map((artifact) => [
        JSON.stringify([
          artifact.channelTarget!.profileId,
          artifact.channelTarget!.modelId,
        ]),
        artifact.channelTarget!,
      ])
  );
  if (
    targets.size > 1 ||
    (candidateCount > 1 && replay.some((artifact) => !artifact.channelTarget))
  )
    throw new ChannelConfigurationError(
      "历史推理状态缺少一致的执行渠道，请使用原物理渠道或新建会话"
    );
  return [...targets.values()][0];
}
