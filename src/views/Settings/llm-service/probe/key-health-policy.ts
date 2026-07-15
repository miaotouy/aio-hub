import type { ChannelProbeResult } from "./types";

export type KeyHealthAction =
  | "success"
  | "authentication-failure"
  | "transient-failure"
  | "record-only"
  | "ignore";

export function getKeyHealthAction(
  result: ChannelProbeResult
): KeyHealthAction {
  if (result.success) return "success";
  switch (result.category) {
    case "authentication":
      return "authentication-failure";
    case "network":
    case "timeout":
    case "provider":
      return "transient-failure";
    case "authorization":
    case "rate-limit":
      return "record-only";
    case "cancelled":
    case "model-unavailable":
    case "unsupported-capability":
    case "bad-request":
    case "configuration":
    case "unknown":
    case undefined:
      return "ignore";
  }
}
