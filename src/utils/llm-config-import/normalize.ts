// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type { ProviderType } from "@/types/llm-profiles";

const TERMINAL_RESOURCE_PATTERNS = [
  /\/models\/[^/]+:(?:generateContent|streamGenerateContent)$/i,
  /\/chat\/completions$/i,
  /\/completions$/i,
  /\/messages$/i,
  /\/responses$/i,
  /\/embeddings$/i,
  /\/images\/generations$/i,
  /\/audio\/(?:speech|transcriptions|translations)$/i,
];

const PLACEHOLDER_PATTERNS = [
  /^<.*>$/,
  /^YOUR[_-]/i,
  /^\$\{/,
  /^\$[A-Z_]+$/,
  /^\{env:/i,
  /^process\.env\./i,
  /^sk-[x.]{4,}$/i,
  /^x{3,}$/i,
  /^(?:placeholder|api[_-]?key|insert|replace|put[_-])/i,
];

export function normalizeLlmBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.search = "";
    url.hash = "";

    let pathname = url.pathname.replace(/\/+$/, "");
    for (const pattern of TERMINAL_RESOURCE_PATTERNS) {
      if (pattern.test(pathname)) {
        pathname = pathname.replace(pattern, "");
        break;
      }
    }
    url.pathname = pathname || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function normalizeComparableBaseUrl(value: string): string {
  return (normalizeLlmBaseUrl(value) || value.trim())
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function sanitizeApiKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(key))) {
    return null;
  }
  return key;
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => !!value))
  );
}

export function inferProviderType(
  hint: string,
  baseUrl: string,
  protocolHint?: string
): { type: ProviderType; ambiguous: boolean } {
  const normalizedHint = hint.toLowerCase();
  const normalizedProtocol = protocolHint?.toLowerCase();

  if (
    normalizedHint.includes("anthropic") ||
    normalizedHint.includes("claude")
  ) {
    return { type: "claude", ambiguous: false };
  }
  if (normalizedHint.includes("gemini") || normalizedHint.includes("google")) {
    return { type: "gemini", ambiguous: false };
  }
  if (normalizedProtocol === "responses") {
    return { type: "openai-responses", ambiguous: false };
  }
  if (
    normalizedHint.includes("grok") &&
    (normalizedHint.includes("openai") || normalizedProtocol === "responses")
  ) {
    return { type: "openai-responses", ambiguous: true };
  }
  if (baseUrl.includes("api.anthropic.com")) {
    return { type: "claude", ambiguous: false };
  }
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return { type: "gemini", ambiguous: false };
  }
  if (baseUrl.includes("api.x.ai")) {
    return { type: "xai", ambiguous: false };
  }
  return { type: "openai", ambiguous: normalizedHint.includes("openai") };
}

export function inferProfileName(baseUrl: string, fallback: string): string {
  try {
    const hostname = new URL(baseUrl).hostname;
    const name = hostname
      .split(".")
      .filter(
        (part) =>
          !["api", "www", "com", "cn", "ai", "io", "net", "org"].includes(part)
      )
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return name || fallback;
  } catch {
    return fallback;
  }
}

export function createDraftId(
  documentId: string,
  source: string,
  index = 0
): string {
  const safeDocumentId = documentId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(-48);
  return `${source}-${safeDocumentId}-${index}`;
}
