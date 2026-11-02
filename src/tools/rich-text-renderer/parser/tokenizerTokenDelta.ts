// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { Token } from "./types";
import type {
  TokenTextField,
  TokenTextPatch,
  TokenUpdate,
  TokenUpdateBatch,
} from "./tokenizerProtocol";

// Native measurements favor full tokens for short fields; patch only substantial reuse.
const MIN_TEXT_LENGTH = 8 * 1024;
const MIN_REUSED_LENGTH = 4 * 1024;
const textFields: readonly TokenTextField[] = [
  "raw",
  "content",
  "resultContent",
];
type TextFields = Partial<Record<TokenTextField, string>>;
type WireFields = Partial<Record<TokenTextField, string | TokenTextPatch>>;

function textPatch(previous: string, next: string): TokenTextPatch | undefined {
  // A sliced replacement can retain the much larger old backing string after truncation.
  if (
    next.length < previous.length ||
    next.length < MIN_TEXT_LENGTH ||
    previous.length < MIN_REUSED_LENGTH
  )
    return;
  const length = Math.min(previous.length, next.length);
  let from = 0;
  let oldEnd = previous.length;
  let newEnd = next.length;
  if (previous.slice(0, length) === next.slice(0, length)) {
    from = length;
  } else if (
    previous.endsWith("\n") &&
    next.slice(0, previous.length - 1) === previous.slice(0, -1)
  ) {
    from = previous.length - 1;
  } else {
    while (from < length && previous.charCodeAt(from) === next.charCodeAt(from))
      from++;
    while (
      oldEnd > from &&
      newEnd > from &&
      previous.charCodeAt(oldEnd - 1) === next.charCodeAt(newEnd - 1)
    ) {
      oldEnd--;
      newEnd--;
    }
  }
  if (from + next.length - newEnd < MIN_REUSED_LENGTH) return;
  return { from, to: oldEnd, insert: next.slice(from, newEnd) };
}

/** Encode changed string fields against the same token position in the previous revision. */
export function encodeTokenUpdates(
  previous: readonly Token[],
  tokens: readonly Token[],
  prefix: number
): TokenUpdateBatch {
  let textPatches = false;
  const updates: TokenUpdate[] = tokens.slice(prefix);
  for (let offset = 0; offset < updates.length; offset++) {
    const token = tokens[prefix + offset];
    const base = previous[prefix + offset] as (Token & TextFields) | undefined;
    if (!base || base.type !== token.type) continue;
    let update: TokenUpdate & WireFields = token;
    for (const field of textFields) {
      const before = base[field];
      const next = (token as Token & TextFields)[field];
      if (typeof before !== "string" || typeof next !== "string") continue;
      const patch = textPatch(before, next);
      if (!patch) continue;
      if (update === token) update = { ...token };
      update[field] = patch;
      textPatches = true;
    }
    updates[offset] = update;
  }
  return textPatches
    ? { tokens: updates, textPatches: true }
    : { tokens: updates as Token[] };
}

/** Reconstruct full tokens without mutating earlier results held by the parser. */
export function decodeTokenUpdates(
  previous: readonly Token[],
  prefix: number,
  updates: readonly TokenUpdate[]
): Token[] {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > previous.length)
    throw new Error("Tokenizer token prefix mismatch");
  const tokens = previous.slice(0, prefix);
  for (let index = 0; index < updates.length; index++) {
    const update = updates[index];
    let token = update as Token;
    for (const field of textFields) {
      const patch = (update as TokenUpdate & WireFields)[field];
      if (typeof patch !== "object" || patch === null) continue;
      const base = previous[prefix + index] as (Token & TextFields) | undefined;
      const value = base?.[field];
      if (
        !base ||
        base.type !== update.type ||
        typeof value !== "string" ||
        !Number.isInteger(patch.from) ||
        !Number.isInteger(patch.to) ||
        patch.from < 0 ||
        patch.to < patch.from ||
        patch.to > value.length ||
        typeof patch.insert !== "string"
      )
        throw new Error("Tokenizer token text patch mismatch");
      if (token === update) token = { ...update } as Token;
      (token as Token & TextFields)[field] =
        value.slice(0, patch.from) + patch.insert + value.slice(patch.to);
    }
    tokens.push(token);
  }
  return tokens;
}
