// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeSyncMediaRequest,
  siliconFlowImageAdapter,
  type ProviderProfile,
} from "@aiohub/llm-core";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { buildOpenAiHeaders } from "../openai/utils";
import { toCoreImageRequest } from "../openai/image";

export async function callSiliconFlowImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const request = await toCoreImageRequest(options);
  const extendedOptions = options as unknown as Record<string, unknown>;
  request.extensions = {
    ...request.extensions,
    ...((typeof extendedOptions.cfg === "number" && {
      cfg: extendedOptions.cfg,
    }) || {}),
  };
  const providerProfile: ProviderProfile = {
    provider: "siliconflow",
    baseUrl: profile.baseUrl || "https://api.siliconflow.cn/v1",
    apiKey: profile.apiKeys?.[0],
    headers: buildOpenAiHeaders(profile, options.requestId),
    endpoints: profile.customEndpoints as Record<string, string> | undefined,
  };
  const result = await executeSyncMediaRequest({
    adapter: siliconFlowImageAdapter,
    profile: providerProfile,
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? `silicon-image-${Date.now()}`,
      signal: options.signal,
      timeoutMs: options.timeout,
      observer: options.transportObserver,
      network: {
        strategy: options.forceProxy ? "proxy" : options.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
  });
  return {
    content: result.content,
    images: result.assets.map((asset) =>
      asset.kind === "inline-base64"
        ? { b64_json: asset.data, revisedPrompt: asset.revisedPrompt }
        : {
            url: asset.kind === "remote-url" ? asset.url : asset.id,
            revisedPrompt: asset.revisedPrompt,
          }
    ),
    seed:
      typeof result.metadata?.seed === "number"
        ? result.metadata.seed
        : undefined,
    timings:
      typeof result.metadata?.timings === "object" &&
      result.metadata.timings !== null &&
      !Array.isArray(result.metadata.timings)
        ? result.metadata.timings
        : undefined,
  };
}
