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
        strategy: options.networkStrategy ?? profile.networkStrategy,
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
