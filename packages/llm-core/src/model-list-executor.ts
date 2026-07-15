import type {
  ModelListProviderAdapter,
  ModelListRequest,
  ModelListResponse,
} from "./types/model-list";
import type { ProviderProfile } from "./types/provider";
import type { LlmTransport, TransportOptions } from "./types/transport";

export async function executeModelListRequest(options: {
  adapter: ModelListProviderAdapter;
  profile: ProviderProfile;
  request: ModelListRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
}): Promise<ModelListResponse> {
  const wireRequest = options.adapter.buildRequest(options.profile, options.request);
  const response = await options.transport.send(wireRequest, options.transportOptions);
  return options.adapter.parseResponse(response, options.request);
}
