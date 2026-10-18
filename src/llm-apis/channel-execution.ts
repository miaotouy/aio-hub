import {
  executeChannelRequest,
  type LlmOperation,
  type ChannelExecution,
} from "@aiohub/llm-core";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import type { LlmProfile } from "@/types/llm-profiles";

/** Infrastructure facade for operations that bypass useLlmRequest. */
export async function executeConfiguredChannel<R extends object>(input: {
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
}): Promise<R & { channelExecution: ChannelExecution }> {
  const { profiles, loadProfiles } = useLlmProfiles();
  await loadProfiles();
  const { pickKey, reportSuccess, reportFailure } = useLlmKeyManager();
  const result = await executeChannelRequest({
    ...input,
    getProfiles: () => profiles.value,
    execute: async ({ profile, model, signal, timeoutMs }) => {
      const key = pickKey(profile);
      try {
        const response = await input.execute(
          { ...profile, apiKeys: key ? [key] : [] },
          model.id,
          signal,
          timeoutMs
        );
        if (key) reportSuccess(profile.id, key);
        return response;
      } catch (error) {
        if (key) reportFailure(profile.id, key, error);
        throw error;
      }
    },
  });
  return { ...result.response, channelExecution: result.execution };
}
