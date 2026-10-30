import type { ProviderAdapter, ProviderProfile } from "./types/provider";
import type { LlmRequest } from "./types/request";
import type { WireRequest } from "./types/transport";

export function protocolInput(wire: WireRequest): {
  messages: unknown[];
  system?: unknown;
} {
  const body = wire.body?.kind === "json" ? wire.body.value : undefined;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { messages: [] };
  const value = body as Record<string, unknown>;
  const input = value.messages ?? value.contents ?? value.input;
  return {
    messages: Array.isArray(input)
      ? input
      : typeof input === "string"
        ? [{ role: "user", content: input }]
        : [],
    system: value.system ?? value.systemInstruction ?? value.instructions,
  };
}

export async function attachRequestSources(
  adapter: ProviderAdapter,
  profile: ProviderProfile,
  request: LlmRequest,
  wire: WireRequest
): Promise<void> {
  if (!request.messages.some((message) => message.sourceKeys?.length)) return;
  const candidates = new Map<string, string[][]>();
  for (const message of request.messages) {
    const reference = await adapter.buildRequest(profile, {
      ...request,
      messages: [message],
      extraBody: undefined,
      extensions: undefined,
    });
    for (const fragment of protocolInput(reference).messages) {
      const key = JSON.stringify(fragment);
      const queue = candidates.get(key) ?? [];
      queue.push(message.sourceKeys ?? []);
      candidates.set(key, queue);
    }
  }
  const final = protocolInput(wire);
  const messages = final.messages.map(
    (fragment) => candidates.get(JSON.stringify(fragment))?.shift() ?? []
  );
  const systemMessages = request.messages.filter(
    (message) => message.role === "system" || message.role === "developer"
  );
  const systemReference = systemMessages.length
    ? protocolInput(
        await adapter.buildRequest(profile, {
          ...request,
          messages: systemMessages,
          extraBody: undefined,
          extensions: undefined,
        })
      ).system
    : undefined;
  const system =
    final.system !== undefined &&
    JSON.stringify(final.system) === JSON.stringify(systemReference)
      ? systemMessages.flatMap((message) => message.sourceKeys ?? [])
      : [];
  wire.sourceMap = {
    messages,
    system,
    complete:
      messages.every((keys) => keys.length > 0) &&
      (final.system === undefined || system.length > 0),
  };
}
