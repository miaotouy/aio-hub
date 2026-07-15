export function extractTextFromSSE(
  data: string,
  providerType: string
): string | null {
  const value = parseJson(data);
  if (value === null) return null;

  switch (providerType) {
    case "openai":
    case "deepseek":
    case "oneapi":
      return readString(value, ["choices", 0, "delta", "content"]);
    case "openai-responses":
      return readString(value, ["type"]) === "response.output_text.delta"
        ? readString(value, ["delta"])
        : null;
    case "gemini":
    case "vertexai":
      return readString(value, [
        "candidates",
        0,
        "content",
        "parts",
        0,
        "text",
      ]);
    case "claude":
      return readString(value, ["type"]) === "content_block_delta"
        ? readString(value, ["delta", "text"])
        : null;
    case "cohere":
      return (
        readString(value, ["text"]) ??
        (readString(value, ["type"]) === "content-delta"
          ? readString(value, ["delta", "message", "content", "text"])
          : null)
      );
    case "huggingface":
      return readString(value, ["token", "text"]);
    default:
      return null;
  }
}

export function extractReasoningFromSSE(
  data: string,
  providerType: string
): string | null {
  const value = parseJson(data);
  if (value === null) return null;

  switch (providerType) {
    case "openai":
    case "deepseek":
    case "oneapi":
      return firstString(value, [
        ["choices", 0, "delta", "reasoning_content"],
        ["choices", 0, "delta", "reasoning"],
        ["choices", 0, "delta", "thinking"],
        ["choices", 0, "delta", "thought"],
      ]);
    case "cohere":
      return readString(value, ["type"]) === "content-delta"
        ? readString(value, ["delta", "message", "content", "thinking"])
        : null;
    default:
      return null;
  }
}

type PropertyPath = ReadonlyArray<string | number>;

function parseJson(data: string): unknown | null {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

function firstString(value: unknown, paths: PropertyPath[]): string | null {
  for (const path of paths) {
    const result = readString(value, path);
    if (result !== null) return result;
  }
  return null;
}

function readString(value: unknown, path: PropertyPath): string | null {
  let current = value;

  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return null;
      current = current[segment];
    } else {
      if (!current || typeof current !== "object" || Array.isArray(current))
        return null;
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return typeof current === "string" && current.length > 0 ? current : null;
}
