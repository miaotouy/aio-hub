export type OllamaChatPreflightReasonCode =
  "service-unavailable" | "chat-http-error" | "invalid-chat-response";

export interface OllamaChatPreflightOptions {
  baseUrl: string;
  model: string;
  required?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type OllamaChatPreflightResult =
  | {
      status: "success";
      baseUrl: string;
      model: string;
      responseLength: number;
    }
  | {
      status: "skip" | "failure";
      baseUrl: string;
      model: string;
      reason: {
        code: OllamaChatPreflightReasonCode;
        message: string;
        httpStatus?: number;
      };
    };

function unavailable(
  options: OllamaChatPreflightOptions,
  reason: Extract<
    OllamaChatPreflightResult,
    { status: "skip" | "failure" }
  >["reason"]
): OllamaChatPreflightResult {
  return {
    status: options.required ? "failure" : "skip",
    baseUrl: options.baseUrl,
    model: options.model,
    reason,
  };
}

export async function preflightOllamaChat(
  options: OllamaChatPreflightOptions
): Promise<OllamaChatPreflightResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${options.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        messages: [
          {
            role: "user",
            content: "Reply with one short word to confirm Chat availability.",
          },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    });
  } catch {
    return unavailable(options, {
      code: "service-unavailable",
      message: "Ollama did not respond to the Chat probe.",
    });
  }
  if (!response.ok) {
    return unavailable(options, {
      code: "chat-http-error",
      message:
        "Ollama's OpenAI-compatible Chat endpoint returned an unsuccessful status.",
      httpStatus: response.status,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const content =
    typeof payload === "object" && payload !== null && "choices" in payload
      ? (payload as { choices?: Array<{ message?: { content?: unknown } }> })
          .choices?.[0]?.message?.content
      : undefined;
  if (typeof content !== "string" || content.trim().length === 0) {
    return unavailable(options, {
      code: "invalid-chat-response",
      message: "Ollama returned an invalid or empty Chat response.",
    });
  }

  return {
    status: "success",
    baseUrl: options.baseUrl,
    model: options.model,
    responseLength: content.length,
  };
}
