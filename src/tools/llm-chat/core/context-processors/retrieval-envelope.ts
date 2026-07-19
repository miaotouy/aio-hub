export type RetrievalEnvelopeNamespace = "recall";

export interface RetrievalEnvelopeToken {
  namespace: RetrievalEnvelopeNamespace;
  raw: string;
  messageIndex: number;
}

const REGISTERED_NAMESPACES = new Set<RetrievalEnvelopeNamespace>(["recall"]);
const ENVELOPE_PATTERN = /【([a-z][a-z0-9-]*)(?:::[^【】]*)?】/g;

export function scanRetrievalEnvelopes(
  messages: Array<{ content?: unknown; sourceType?: string }>,
  namespace: RetrievalEnvelopeNamespace
): RetrievalEnvelopeToken[] {
  const results: RetrievalEnvelopeToken[] = [];
  messages.forEach((message, messageIndex) => {
    if (
      message.sourceType === "session_history" ||
      typeof message.content !== "string"
    )
      return;
    ENVELOPE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ENVELOPE_PATTERN.exec(message.content)) !== null) {
      const candidate = match[1] as RetrievalEnvelopeNamespace;
      if (!REGISTERED_NAMESPACES.has(candidate) || candidate !== namespace)
        continue;
      results.push({ namespace: candidate, raw: match[0], messageIndex });
    }
  });
  return results;
}
