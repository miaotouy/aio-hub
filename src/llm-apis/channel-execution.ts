import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import {
  executeConfiguredChannelRequest,
  type ConfiguredChannelExecutor,
} from "./execution/configuredChannelExecutor";

/** Infrastructure facade for operations that bypass useLlmRequest. */
export const executeConfiguredChannel: ConfiguredChannelExecutor = async (
  input
) => {
  const { profiles, loadProfiles } = useLlmProfiles();
  await loadProfiles();
  return executeConfiguredChannelRequest(input, {
    getProfiles: () => profiles.value,
    keys: useLlmKeyManager(),
  });
};
