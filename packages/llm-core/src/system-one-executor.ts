import type { ProviderProfile } from "./types/provider";
import type {
  SystemOneProviderAdapter,
  SystemOneRequest,
  SystemOneResponse,
} from "./types/system-one";
import type { LlmTransport, TransportOptions } from "./types/transport";

export interface ExecuteSystemOneRequestOptions {
  adapter: SystemOneProviderAdapter;
  profile: ProviderProfile;
  request: SystemOneRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
}

/** Execute one typed decision request through a System One wire adapter. */
export async function executeSystemOneRequest(
  options: ExecuteSystemOneRequestOptions
): Promise<SystemOneResponse> {
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
