import type { ProviderProfile } from "../types/provider";
import type {
  SystemOneProviderAdapter,
  SystemOneRequest,
} from "../types/system-one";
import {
  buildStructuredDecisionRequest,
  parseStructuredDecisionResponse,
} from "./structured-decision";

export const typeSafeSystemOneAdapter: SystemOneProviderAdapter = {
  id: "typesafe-system-one",
  buildRequest: buildTypeSafeSystemOneRequest,
  parseResponse: parseStructuredDecisionResponse,
};

export function buildTypeSafeSystemOneRequest(
  profile: ProviderProfile,
  request: SystemOneRequest
) {
  return buildStructuredDecisionRequest(
    profile,
    request,
    resolveTypeSafeSystemOneEndpoint(profile),
    true
  );
}

export const parseTypeSafeSystemOneResponse = parseStructuredDecisionResponse;

export function resolveTypeSafeSystemOneEndpoint(
  profile: ProviderProfile
): string {
  const explicit = profile.endpoints?.systemOne;
  if (explicit) {
    return resolveEndpoint(profile.baseUrl, explicit);
  }

  const baseUrl = profile.baseUrl.replace(/\/+$/, "");
  if (/\/v1\/systemone$/i.test(baseUrl)) return baseUrl;
  if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/systemone`;
  return `${baseUrl}/v1/systemone`;
}

function resolveEndpoint(baseUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}
