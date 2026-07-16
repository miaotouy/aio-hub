import type {
  LlmStreamEvent,
  ProviderAdapter,
  ProviderProfile,
} from "./types/provider";
import type { LlmRequest } from "./types/request";
import type { LlmResponse } from "./types/response";
import type {
  LlmTransport,
  TransportOptions,
  WireRequest,
} from "./types/transport";

export interface ExecuteProviderRequestOptions {
  adapter: ProviderAdapter;
  profile: ProviderProfile;
  request: LlmRequest;
  transport: LlmTransport;
  transportOptions: TransportOptions;
  onEvent?: (event: LlmStreamEvent) => void;
}

export interface ExecuteProviderWireRequestOptions extends Omit<
  ExecuteProviderRequestOptions,
  "profile"
> {
  wireRequest: WireRequest;
}

export async function executeProviderRequest(
  options: ExecuteProviderRequestOptions
): Promise<LlmResponse> {
  const wireRequest = await options.adapter.buildRequest(
    options.profile,
    options.request
  );

  return executeProviderWireRequest({
    adapter: options.adapter,
    request: options.request,
    transport: options.transport,
    transportOptions: options.transportOptions,
    onEvent: options.onEvent,
    wireRequest,
  });
}

export async function executeProviderWireRequest(
  options: ExecuteProviderWireRequestOptions
): Promise<LlmResponse> {
  const response = await options.transport.send(
    options.wireRequest,
    options.transportOptions
  );

  if (!options.wireRequest.streaming) {
    return options.adapter.parseResponse(response);
  }

  const decoder = options.adapter.createStreamDecoder({
    request: options.request,
    response,
  });
  let completedResponse: LlmResponse | undefined;

  const emit = (events: LlmStreamEvent[]) => {
    for (const event of events) {
      options.onEvent?.(event);
      if (event.type === "completed") completedResponse = event.response;
    }
  };

  for await (const chunk of response.body) emit(decoder.push(chunk));
  emit(decoder.finish());

  if (!completedResponse) {
    throw new Error("Provider stream completed without a final response");
  }
  return completedResponse;
}
