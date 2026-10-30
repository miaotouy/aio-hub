import type { TokenUsage } from "./types/response";

/** Sparse, recognised numeric fields only; keep explicit zero before normalising. */
export function usageReport(
  raw: Record<string, unknown>,
  input: string,
  output: string,
  detailPaths: string[] = []
): Pick<TokenUsage, "providerUsageStatus" | "reportedUsageFields"> {
  const fields: Record<string, number> = {};
  for (const path of [input, output, ...detailPaths]) {
    let value: unknown = raw;
    for (const key of path.split(".")) {
      value =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
      fields[path] = value;
  }
  return {
    providerUsageStatus:
      input in fields && output in fields
        ? "reported"
        : Object.keys(fields).length
          ? "partial"
          : "missing",
    reportedUsageFields: fields,
  };
}

/** These protocols report cumulative counts; omitted fields never erase earlier counts. */
export function mergeTokenUsage(
  previous: TokenUsage | undefined,
  next: TokenUsage | undefined
): TokenUsage | undefined {
  if (!next) return previous;
  if (!previous) return next;
  const fields = {
    ...previous.reportedUsageFields,
    ...next.reportedUsageFields,
  };
  const has = (pattern: RegExp) =>
    Object.keys(next.reportedUsageFields ?? {}).some((key) =>
      pattern.test(key)
    );
  const promptTokens = has(/^(prompt_tokens|input_tokens|promptTokenCount)$/)
    ? next.promptTokens
    : previous.promptTokens;
  const completionTokens = has(
    /^(completion_tokens|output_tokens|candidatesTokenCount)$/
  )
    ? next.completionTokens
    : previous.completionTokens;
  const compact = (value: object | undefined) =>
    Object.fromEntries(
      Object.entries(value ?? {}).filter(([, v]) => v !== undefined)
    );
  return {
    ...previous,
    ...next,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    promptTokensDetails: {
      ...compact(previous.promptTokensDetails),
      ...compact(next.promptTokensDetails),
    },
    completionTokensDetails: {
      ...compact(previous.completionTokensDetails),
      ...compact(next.completionTokensDetails),
    },
    reportedUsageFields: fields,
    providerUsageStatus:
      Object.keys(fields).some((k) =>
        /^(prompt_tokens|input_tokens|promptTokenCount)$/.test(k)
      ) &&
      Object.keys(fields).some((k) =>
        /^(completion_tokens|output_tokens|candidatesTokenCount)$/.test(k)
      )
        ? "reported"
        : Object.keys(fields).length
          ? "partial"
          : "missing",
  };
}
