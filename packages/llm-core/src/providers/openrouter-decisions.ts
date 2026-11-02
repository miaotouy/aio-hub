import type { ProviderProfile } from "../types/provider";
import type {
  SystemOneProviderAdapter,
  SystemOneRequest,
} from "../types/system-one";
import {
  buildStructuredDecisionRequest,
  parseStructuredDecisionResponse,
} from "./structured-decision";

/** OpenRouter's cross-provider structured decision protocol. */
export const openRouterDecisionsAdapter: SystemOneProviderAdapter = {
  id: "openrouter-decisions",
  buildRequest: buildOpenRouterDecisionsRequest,
  parseResponse: parseStructuredDecisionResponse,
};

export function buildOpenRouterDecisionsRequest(
  profile: ProviderProfile,
  request: SystemOneRequest
) {
  return buildStructuredDecisionRequest(
    profile,
    request,
    resolveOpenRouterDecisionsEndpoint(profile)
  );
}

export const parseOpenRouterDecisionsResponse = parseStructuredDecisionResponse;

export function resolveOpenRouterDecisionsEndpoint(
  profile: ProviderProfile
): string {
  const base = profile.baseUrl.replace(/\/+$/, "");
  const explicit = profile.endpoints?.decisions;
  // Custom paths follow the same base-relative convention as other adapters.
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) return explicit;
    return base + "/" + explicit.replace(/^\//, "");
  }
  if (/\/alpha\/decisions$/i.test(base)) return base;
  if (/\/(?:v1|alpha)$/i.test(base)) {
    return base.replace(/\/(?:v1|alpha)$/i, "/alpha/decisions");
  }
  // OpenRouter's host-only URL also needs its /api prefix.
  const url = new URL(base);
  if (url.hostname === "openrouter.ai" && url.pathname === "/") {
    return base + "/api/alpha/decisions";
  }
  return base + "/alpha/decisions";
}
