import type {
  EmbeddingProviderAdapter,
  EmbeddingRequest,
  EmbeddingResponse,
} from "./types/embedding";
import type { ProviderProfile } from "./types/provider";
import type { LlmTransport, TransportOptions } from "./types/transport";

export interface ExecuteEmbeddingRequestOptions {
  adapter: EmbeddingProviderAdapter;
  profile: ProviderProfile;
  request: EmbeddingRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
}

export async function executeEmbeddingRequest(
  options: ExecuteEmbeddingRequestOptions
): Promise<EmbeddingResponse> {
  const wireRequest = await options.adapter.buildRequest(
    options.profile,
    options.request
  );
  const response = await options.transport.send(
    wireRequest,
    options.transportOptions
  );
  return options.adapter.parseResponse(response, options.request);
}
