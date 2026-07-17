import { scanRetrievalEnvelopes } from "./retrieval-envelope";
import type { KnowledgeSearchStrategy } from "@/tools/knowledge-base/types";

export interface KnowledgePlaceholder {
  raw: string;
  messageIndex: number;
  library?: string;
  strategy?: KnowledgeSearchStrategy;
  limit?: number;
  minScore?: number;
  when?: "always";
  citation?: boolean;
}

export class KnowledgePlaceholderError extends Error {
  constructor(
    message: string,
    readonly messageIndex: number,
    readonly raw: string,
    readonly key?: string
  ) {
    super(message);
    this.name = "KnowledgePlaceholderError";
  }
}

const CANONICAL_KEYS = [
  "library",
  "strategy",
  "limit",
  "min-score",
  "when",
  "citation",
] as const;
const VALID_KEYS = new Set<string>(CANONICAL_KEYS);

function fail(
  message: string,
  messageIndex: number,
  raw: string,
  key?: string
): never {
  throw new KnowledgePlaceholderError(message, messageIndex, raw, key);
}

function decode(value: string, messageIndex: number, raw: string, key: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return fail("Knowledge 占位符 value 编码无效", messageIndex, raw, key);
  }
}

function asPositiveInt(
  value: string,
  messageIndex: number,
  raw: string,
  key: string
) {
  if (!/^\d+$/.test(value))
    return fail("Knowledge 占位符数值无效", messageIndex, raw, key);
  const parsed = Number(value);
  if (parsed < 1 || parsed > 50)
    return fail("Knowledge 占位符数值超出范围", messageIndex, raw, key);
  return parsed;
}

export function parseKnowledgePlaceholder(
  raw: string,
  messageIndex: number
): KnowledgePlaceholder {
  if (!raw.startsWith("【knowledge") || !raw.endsWith("】"))
    return fail("不是 Knowledge 占位符", messageIndex, raw);
  const body = raw.slice("【knowledge".length, -1);
  if (!body) return { raw, messageIndex };
  if (!body.startsWith("::"))
    return fail("Knowledge 占位符缺少参数分隔符", messageIndex, raw);

  const values = new Map<string, string>();
  for (const segment of body.slice(2).split("::")) {
    const separator = segment.indexOf("=");
    if (separator <= 0 || separator === segment.length - 1)
      return fail("Knowledge 占位符参数必须使用 key=value", messageIndex, raw);
    const key = segment.slice(0, separator);
    if (!/^[a-z][a-z0-9-]*$/.test(key) || !VALID_KEYS.has(key))
      return fail("Knowledge 占位符包含未知参数", messageIndex, raw, key);
    if (values.has(key))
      return fail("Knowledge 占位符包含重复参数", messageIndex, raw, key);
    values.set(
      key,
      decode(segment.slice(separator + 1), messageIndex, raw, key)
    );
  }

  const result: KnowledgePlaceholder = { raw, messageIndex };
  for (const [key, value] of values) {
    switch (key) {
      case "library":
        result.library = value;
        break;
      case "strategy":
        if (
          !("auto keyword semantic hybrid".split(" ") as string[]).includes(
            value
          )
        )
          fail("Knowledge strategy 无效", messageIndex, raw, key);
        result.strategy = value as KnowledgeSearchStrategy;
        break;
      case "limit":
        result.limit = asPositiveInt(value, messageIndex, raw, key);
        break;
      case "min-score": {
        const score = Number(value);
        if (!Number.isFinite(score) || score < 0 || score > 1)
          fail("Knowledge min-score 无效", messageIndex, raw, key);
        result.minScore = score;
        break;
      }
      case "when":
        if (value !== "always")
          fail("Knowledge 第一阶段仅支持 when=always", messageIndex, raw, key);
        result.when = "always";
        break;
      case "citation":
        if (value !== "true" && value !== "false")
          fail("Knowledge citation 无效", messageIndex, raw, key);
        result.citation = value === "true";
        break;
    }
  }
  return result;
}

export function scanKnowledgePlaceholders(
  messages: Array<{ content?: unknown; sourceType?: string }>
): KnowledgePlaceholder[] {
  return scanRetrievalEnvelopes(messages, "knowledge").map((token) =>
    parseKnowledgePlaceholder(token.raw, token.messageIndex)
  );
}

export function serializeKnowledgePlaceholder(
  placeholder: Omit<KnowledgePlaceholder, "raw" | "messageIndex">
) {
  const values: Record<string, string | undefined> = {
    library: placeholder.library,
    strategy: placeholder.strategy,
    limit: placeholder.limit?.toString(),
    "min-score": placeholder.minScore?.toString(),
    when: placeholder.when,
    citation: placeholder.citation?.toString(),
  };
  const body = CANONICAL_KEYS.flatMap((key) => {
    const value = values[key];
    return value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`];
  });
  return body.length ? `【knowledge::${body.join("::")}】` : "【knowledge】";
}
