// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const SENSITIVE_QUERY_KEYS = new Set([
  "key",
  "api_key",
  "api-key",
  "apikey",
  "token",
  "secret",
]);

export function redactDeepLinkUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return value.replace(
      /([?&](?:key|api[_-]?key|apikey|token|secret)=)[^&]*/gi,
      "$1[REDACTED]"
    );
  }
}

export function redactDeepLinkValue(value: unknown): unknown {
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    return normalized.startsWith("aiohub://")
      ? value.replace(normalized, redactDeepLinkUrl(normalized))
      : value;
  }
  if (Array.isArray(value)) return value.map(redactDeepLinkValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        redactDeepLinkValue(nested),
      ])
    );
  }
  return value;
}
