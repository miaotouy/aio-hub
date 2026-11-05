// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { resolveModelExecution } from "@aiohub/llm-core";
import type { LlmProfile } from "../../types/llm-profiles";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "../embedding-types";
import type { ConfiguredChannelExecutor } from "./configuredChannelExecutor";

export type EmbeddingAdapter = (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
) => Promise<EmbeddingResponse>;

/** Shared model routing and channel policy; hosts supply adapters and key ownership. */
export function createEmbeddingRequestExecutor(ports: {
  executeChannel: ConfiguredChannelExecutor;
  getAdapter(provider: string): EmbeddingAdapter | undefined;
}) {
  async function sendEmbedding(
    profile: LlmProfile,
    options: EmbeddingRequestOptions
  ): Promise<EmbeddingResponse> {
    if (profile.type === "virtual")
      return ports.executeChannel({
        profile,
        modelId: options.modelId,
        operation: "embedding",
        signal: options.signal,
        timeoutMs: options.timeout,
        execute: (member, modelId, signal, timeout) =>
          sendEmbedding(member, {
            ...options,
            modelId,
            signal,
            timeout,
            forceProxy: undefined,
            relaxIdCerts: member.relaxIdCerts,
            http1Only: member.http1Only,
          }),
      });
    const model = profile.models.find(
      (item) => item.id === options.modelId
    ) ?? {
      id: options.modelId,
    };
    const execution = resolveModelExecution({
      profile,
      model,
      operation: "embedding",
    });
    const adapter = ports.getAdapter(execution.effectiveProfile.type);

    if (!adapter) {
      throw new Error(
        `Provider "${execution.effectiveProfile.type}" 不支持 Embedding API`
      );
    }

    return adapter(execution.effectiveProfile, options);
  }

  return sendEmbedding;
}
