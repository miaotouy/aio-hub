import type { ProviderProfile } from "./types/provider";
import type {
  RerankProviderAdapter,
  RerankRequest,
  RerankResponse,
} from "./types/rerank";
import type { LlmTransport, TransportOptions } from "./types/transport";

export interface ExecuteRerankRequestOptions {
  adapter: RerankProviderAdapter;
  profile: ProviderProfile;
  request: RerankRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
}

export async function executeRerankRequest(
  options: ExecuteRerankRequestOptions
): Promise<RerankResponse> {
  const wireRequest = options.adapter.buildRequest(
    options.profile,
    options.request
  );
  const response = await options.transport.send(
    wireRequest,
    options.transportOptions
  );
  return options.adapter.parseResponse(response);
}
