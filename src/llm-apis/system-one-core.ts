import { executeConfiguredChannel } from "./channel-execution";
import {
  executeSystemOneRequest,
  type SystemOneRequest,
  type SystemOneResponse,
  type TransportObserver,
  typeSafeSystemOneAdapter,
  openRouterDecisionsAdapter,
  resolveModelExecution,
  resolveOpenRouterDecisionsEndpoint,
  resolveTypeSafeSystemOneEndpoint,
  type LlmAdapterId,
} from "@aiohub/llm-core";
import type { LlmProfile, NetworkStrategy } from "@/types/llm-profiles";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import { desktopLlmTransport } from "./transports/desktop";

export interface DecisionCallOptions extends SystemOneRequest {
  /** Explicit probe override; ordinary callers use persisted model routing. */
  adapterId?: LlmAdapterId;
  apiKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  transportObserver?: TransportObserver;
  networkStrategy?: NetworkStrategy;
  relaxInvalidCerts?: boolean;
  http1Only?: boolean;
}

/**
 * Desktop facade for structured decisions. Resolves the model protocol before
 * sending the request through the shared desktop transport.
 */
export async function callDecisionApi(
  profile: LlmProfile,
  options: DecisionCallOptions
): Promise<SystemOneResponse> {
  if (profile.type === "virtual") {
    if (options.adapterId || options.apiKey)
      throw new Error("请在成员渠道中进行指定协议或密钥的决策探测");
    return executeConfiguredChannel({
      profile,
      modelId: options.model,
      operation: "decision",
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      execute: (member, model, signal, timeoutMs) =>
        callDecisionApi(member, {
          ...options,
          model,
          signal,
          timeoutMs,
          networkStrategy: member.networkStrategy,
          relaxInvalidCerts: member.relaxIdCerts,
          http1Only: member.http1Only,
        }),
    });
  }
  const route = options.adapterId
    ? { adapterId: options.adapterId, effectiveProfile: profile }
    : resolveModelExecution({
        profile,
        model: profile.models.find((model) => model.id === options.model) ?? {
          id: options.model,
        },
        operation: "decision",
      });
  const adapter =
    route.adapterId === "openrouter-decisions"
      ? openRouterDecisionsAdapter
      : route.adapterId === "typesafe-system-one"
        ? typeSafeSystemOneAdapter
        : undefined;
  if (!adapter) throw new Error("当前模型路由未配置结构化决策协议");
  profile = route.effectiveProfile;
  const endpoint =
    route.adapterId === "openrouter-decisions"
      ? resolveOpenRouterDecisionsEndpoint({
          provider: profile.type,
          baseUrl: profile.baseUrl,
          endpoints: profile.customEndpoints,
        })
      : resolveTypeSafeSystemOneEndpoint({
          provider: profile.type,
          baseUrl: profile.baseUrl,
          endpoints: profile.customEndpoints,
        });
  const requestId = options.requestId ?? createRequestId();
  // 本地 / IP 地址的决策端点必须走 Rust 代理，以绕过前端 capability 限制；
  // 与 useLlmRequest 的 chat 路径保持一致，否则会 fail-closed 转人工。
  const strategy: NetworkStrategy | undefined = isLocalOrIpUrl(endpoint)
    ? "proxy"
    : (options.networkStrategy ?? profile.networkStrategy);
  return executeSystemOneRequest({
    adapter,
    profile: {
      provider: profile.type,
      baseUrl: profile.baseUrl,
      apiKey: options.apiKey ?? profile.apiKeys?.[0],
      headers: resolveCustomHeaders(profile.customHeaders),
      endpoints: profile.customEndpoints,
    },
    request: {
      model: options.model,
      state: options.state,
      questions: options.questions,
      assets: options.assets,
      longContext: options.longContext,
      requestId,
      extensions: options.extensions,
    },
    transport: desktopLlmTransport,
    transportOptions: {
      requestId,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      observer: options.transportObserver,
      network: {
        strategy,
        relaxInvalidCerts: options.relaxInvalidCerts ?? profile.relaxIdCerts,
        http1Only: options.http1Only ?? profile.http1Only,
      },
    },
  });
}

/** Compatibility facade for callers explicitly using TypeSafe's protocol. */
export type TypeSafeSystemOneCallOptions = DecisionCallOptions;
export function callTypeSafeSystemOneApi(
  profile: LlmProfile,
  options: TypeSafeSystemOneCallOptions
): Promise<SystemOneResponse> {
  return callDecisionApi(profile, {
    ...options,
    adapterId: "typesafe-system-one",
  });
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 判定 baseUrl 是否指向本地地址或 IP（这类请求在前端直连会被 capability 限制拦截）。 */
function isLocalOrIpUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)
  );
}
