import type { LlmProfile } from "../types/llm-profiles";
import type {
  LlmRequestOptions,
  MediaGenerationOptions,
  LlmResponse,
} from "../llm-apis/common";
import { useVcpStore } from "../tools/vcp-connector/stores/vcpConnectorStore";
import { sendChannelRequest as executeChannelRequest } from "../llm-apis/execution/channelRequestExecutor";
export {
  getRequestOperation,
  getRequestCapabilities,
} from "../llm-apis/execution/channelRequestExecutor";

/** Renderer configuration adapter for the shared channel scheduler. */
export function sendChannelRequest(
  options: LlmRequestOptions | MediaGenerationOptions,
  getProfiles: () => LlmProfile[],
  sendPhysical: (
    options: LlmRequestOptions | MediaGenerationOptions
  ) => Promise<LlmResponse>
): Promise<LlmResponse> {
  return executeChannelRequest(
    options,
    getProfiles,
    sendPhysical,
    () => useVcpStore().config.wsUrl
  );
}
