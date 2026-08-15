import type { ProviderProfile } from "./types/provider";
import type {
  TranscriptionProviderAdapter,
  TranscriptionRequest,
  TranscriptionResponse,
} from "./types/transcription";
import type { LlmTransport, TransportOptions } from "./types/transport";

export interface ExecuteTranscriptionRequestOptions {
  adapter: TranscriptionProviderAdapter;
  profile: ProviderProfile;
  request: TranscriptionRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
}

export async function executeTranscriptionRequest(
  options: ExecuteTranscriptionRequestOptions
): Promise<TranscriptionResponse> {
  const wireRequest = options.adapter.buildRequest(
    options.profile,
    options.request
  );
  const response = await options.transport.send(
    wireRequest,
    options.transportOptions
  );
  return options.adapter.parseResponse(response, options.request);
}
