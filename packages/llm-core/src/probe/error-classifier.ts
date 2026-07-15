import type { ProbeErrorCategory, ProbePhase } from "./types";

export interface ClassifiedProbeError {
  category: ProbeErrorCategory;
  phase: ProbePhase;
  status?: number;
  message: string;
  detail: string;
}

export function classifyProbeError(
  error: unknown,
  signal?: AbortSignal
): ClassifiedProbeError {
  const record = toRecord(error);
  const message = sanitize(record.message || String(error || "未知错误"));
  const status = readStatus(record, message);
  const lower = message.toLowerCase();

  if (
    signal?.aborted ||
    record.name === "AbortError" ||
    /cancel|abort/.test(lower)
  ) {
    const timeout =
      /timeout|timed out|超时/.test(lower) || isTimeoutReason(signal?.reason);
    return classified(
      timeout ? "timeout" : "cancelled",
      "transport",
      status,
      message
    );
  }
  if (record.name === "TimeoutError" || /timeout|timed out|超时/.test(lower)) {
    return classified("timeout", "transport", status, message);
  }
  if (isExplicitAuthenticationFailure(lower)) {
    return classified("authentication", "response-status", status, message);
  }
  if (status === 401)
    return classified("authentication", "response-status", status, message);
  if (status === 403)
    return classified("authorization", "response-status", status, message);
  if (status === 404 || /model.+(not found|不存在|unavailable)/.test(lower)) {
    return classified("model-unavailable", "response-status", status, message);
  }
  if (status === 429)
    return classified("rate-limit", "response-status", status, message);
  if (status === 408)
    return classified("timeout", "response-status", status, message);
  if (status !== undefined && status >= 500) {
    return classified("provider", "response-status", status, message);
  }
  if (status === 400) {
    return classified("bad-request", "response-status", status, message);
  }
  if (status !== undefined && status >= 400) {
    return classified("configuration", "response-status", status, message);
  }
  if (/unsupported|not supported|不支持/.test(lower)) {
    return classified("unsupported-capability", "prepare", status, message);
  }
  if (
    /fetch|network|dns|socket|connection|certificate|cors|网络|证书/.test(lower)
  ) {
    return classified("network", "transport", status, message);
  }
  if (/config|endpoint|url|parameter|配置|参数|端点/.test(lower)) {
    return classified("configuration", "build-request", status, message);
  }
  return classified("unknown", "transport", status, message);
}

function classified(
  category: ProbeErrorCategory,
  phase: ProbePhase,
  status: number | undefined,
  message: string
): ClassifiedProbeError {
  return { category, phase, status, message, detail: message.slice(0, 1_000) };
}

function toRecord(error: unknown): Record<string, unknown> {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : {};
}

function readStatus(
  record: Record<string, unknown>,
  message: string
): number | undefined {
  const direct = record.status ?? record.statusCode;
  if (typeof direct === "number") return direct;
  const match = message.match(/\b([45]\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function sanitize(value: unknown): string {
  return String(value)
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(
      /(["']?(?:api[-_ ]?key|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]"
    )
    .slice(0, 1_000);
}

function isTimeoutReason(reason: unknown): boolean {
  if (!reason) return false;
  const record = toRecord(reason);
  return /timeout|timed out|超时/i.test(String(record.message ?? reason));
}

function isExplicitAuthenticationFailure(message: string): boolean {
  return /(?:invalid|incorrect|expired|revoked)\s+(?:api[-_ ]?key|credential|token)|(?:api[-_ ]?key|credential|token)\s+(?:is\s+)?(?:invalid|incorrect|expired|revoked)|(?:认证|鉴权)失败|无效(?:的)?(?:密钥|凭据|令牌)/i.test(
    message
  );
}
