import type {
  SyncMediaProviderAdapter,
  SyncMediaRequest,
  SyncMediaResponse,
} from "./types/media";
import type { ProviderProfile } from "./types/provider";
import type { LlmTransport, TransportOptions } from "./types/transport";

export interface ExecuteSyncMediaRequestOptions {
  adapter: SyncMediaProviderAdapter;
  profile: ProviderProfile;
  request: SyncMediaRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
}

export async function executeSyncMediaRequest(
  options: ExecuteSyncMediaRequestOptions
): Promise<SyncMediaResponse> {
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
