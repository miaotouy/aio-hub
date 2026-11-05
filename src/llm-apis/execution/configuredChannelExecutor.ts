// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { waitForKeyOperation } from "../configuration/keyOperation";
import {
  executeChannelRequest,
  type LlmOperation,
  type ChannelExecution,
} from "@aiohub/llm-core";
import type { LlmProfile } from "../../types/llm-profiles";
import type { ModelRequestPorts } from "./modelRequestExecutor";

export interface ConfiguredChannelRequest<R extends object> {
  profile: LlmProfile;
  modelId: string;
  operation: LlmOperation;
  signal?: AbortSignal;
  timeoutMs?: number;
  execute: (
    profile: LlmProfile,
    modelId: string,
    signal: AbortSignal,
    timeoutMs: number
  ) => Promise<R>;
}

export type ConfiguredChannelExecutor = <R extends object>(
  input: ConfiguredChannelRequest<R>
) => Promise<R & { channelExecution: ChannelExecution }>;

/** Channel scheduling and durable key health shared by renderer and Node hosts. */
export async function executeConfiguredChannelRequest<R extends object>(
  input: ConfiguredChannelRequest<R>,
  ports: Pick<ModelRequestPorts, "getProfiles" | "keys">
): Promise<R & { channelExecution: ChannelExecution }> {
  const { pickKey, reportSuccess, reportFailure } = ports.keys;
  const result = await executeChannelRequest({
    ...input,
    getProfiles: ports.getProfiles,
    execute: async ({ profile, model, signal, timeoutMs }) => {
      const key = await waitForKeyOperation(() => pickKey(profile), signal);
      signal.throwIfAborted();
      try {
        const response = await input.execute(
          { ...profile, apiKeys: key ? [key] : [] },
          model.id,
          signal,
          timeoutMs
        );
        if (key) await reportSuccess(profile.id, key);
        return response;
      } catch (error) {
        if (key) await reportFailure(profile.id, key, error);
        throw error;
      }
    },
  });
  return { ...result.response, channelExecution: result.execution };
}
