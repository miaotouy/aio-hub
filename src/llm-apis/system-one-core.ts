import {
  executeSystemOneRequest,
  type SystemOneRequest,
  type SystemOneResponse,
  type TransportObserver,
  typeSafeSystemOneAdapter,
} from "@aiohub/llm-core";
import type { LlmProfile, NetworkStrategy } from "@/types/llm-profiles";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import { desktopLlmTransport } from "./transports/desktop";

export interface TypeSafeSystemOneCallOptions extends SystemOneRequest {
  apiKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  transportObserver?: TransportObserver;
  networkStrategy?: NetworkStrategy;
  relaxInvalidCerts?: boolean;
  http1Only?: boolean;
}

/**
 * Desktop facade for TypeSafe's typed decision endpoint.
 *
 * It remains separate from the chat adapter registry because System One
 * returns constrained decisions instead of generated assistant messages.
 */
export async function callTypeSafeSystemOneApi(
  profile: LlmProfile,
  options: TypeSafeSystemOneCallOptions
): Promise<SystemOneResponse> {
  const requestId = options.requestId ?? createRequestId();
  // 本地 / IP 地址的决策端点必须走 Rust 代理，以绕过前端 capability 限制；
  // 与 useLlmRequest 的 chat 路径保持一致，否则会 fail-closed 转人工。
  const strategy: NetworkStrategy | undefined = isLocalOrIpUrl(profile.baseUrl)
    ? "proxy"
    : (options.networkStrategy ?? profile.networkStrategy);
  return executeSystemOneRequest({
    adapter: typeSafeSystemOneAdapter,
    profile: {
      provider: "typesafe",
      baseUrl: profile.baseUrl,
      apiKey: options.apiKey ?? profile.apiKeys?.[0],
      headers: resolveCustomHeaders(profile.customHeaders),
      endpoints: profile.customEndpoints,
    },
    request: {
      model: options.model,
      state: options.state,
      questions: options.questions,
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

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `typesafe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
