// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { TokenCalculationResult } from "./tokenCalculatorEngine";

export type TextTokenCalculator = (
  text: string,
  modelId: string
) => Promise<TokenCalculationResult>;

interface TextIdentity {
  revision: number;
  tokenizerProfileId?: string;
}

/** Request-owned LRU: retains completed results and in-flight work under the same bound. */
export function createTextTokenScope(
  calculate: (
    text: string,
    modelId: string,
    tokenizerProfileId?: string
  ) => Promise<TokenCalculationResult>,
  resolveIdentity: (modelId: string) => TextIdentity,
  limits = { maxEntries: 8192, maxChars: 8 * 1024 * 1024 }
): TextTokenCalculator {
  interface Entry {
    text: string;
    identity: string;
    promise: Promise<TokenCalculationResult>;
  }
  const buckets = new Map<string, Map<string, Entry>>();
  const lru = new Set<Entry>();
  let revision: number | undefined;
  let chars = 0;
  const remove = (entry: Entry) => {
    const bucket = buckets.get(entry.identity);
    if (bucket?.get(entry.text) !== entry) return;
    bucket.delete(entry.text);
    if (!bucket.size) buckets.delete(entry.identity);
    lru.delete(entry);
    chars -= entry.text.length;
  };
  return (text, modelId) => {
    const identity = resolveIdentity(modelId);
    if (revision !== identity.revision) {
      buckets.clear();
      lru.clear();
      chars = 0;
      revision = identity.revision;
    }
    if (limits.maxEntries < 1 || text.length > limits.maxChars)
      return calculate(text, modelId, identity.tokenizerProfileId);
    const key = JSON.stringify([modelId, identity.tokenizerProfileId]);
    let bucket = buckets.get(key);
    const cached = bucket?.get(text);
    if (cached) {
      lru.delete(cached);
      lru.add(cached);
      return cached.promise;
    }
    while (
      lru.size >= limits.maxEntries ||
      chars + text.length > limits.maxChars
    ) {
      const oldest = lru.values().next().value;
      if (!oldest) break;
      remove(oldest);
    }
    bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = new Map()));
    const promise = calculate(text, modelId, identity.tokenizerProfileId);
    const entry: Entry = { text, identity: key, promise };
    bucket.set(text, entry);
    lru.add(entry);
    chars += text.length;
    // Rejected work can be retried; an old rejection must not evict a newer entry.
    void promise.catch(() => remove(entry));
    return promise;
  };
}
