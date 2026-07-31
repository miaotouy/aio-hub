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

import { scanRetrievalEnvelopes } from "./retrieval-envelope";

export type RecallPlaceholderWhen = "always" | "gate" | "turn" | "static";
export type RecallPlaceholderProfile = "semantic" | "associative";
export type RecallPlaceholderPreset = "algorithmic" | "comprehensive";

export interface RecallPlaceholder {
  raw: string;
  messageIndex: number;
  collection?: string;
  preset?: RecallPlaceholderPreset;
  profile?: RecallPlaceholderProfile;
  limit?: number;
  minScore?: number;
  when?: RecallPlaceholderWhen;
  gateTags?: string[];
  everyTurns?: number;
  entries?: string[];
}

export class RecallPlaceholderError extends Error {
  constructor(
    message: string,
    readonly messageIndex: number,
    readonly raw: string,
    readonly key?: string
  ) {
    super(message);
    this.name = "RecallPlaceholderError";
  }
}

const CANONICAL_KEYS = [
  "collection",
  "preset",
  "profile",
  "limit",
  "min-score",
  "when",
  "gate-tags",
  "every-turns",
  "entries",
] as const;
const VALID_KEYS = new Set<string>(CANONICAL_KEYS);

function fail(
  message: string,
  messageIndex: number,
  raw: string,
  key?: string
): never {
  throw new RecallPlaceholderError(message, messageIndex, raw, key);
}

function decode(value: string, messageIndex: number, raw: string, key: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return fail("Recall 占位符 value 编码无效", messageIndex, raw, key);
  }
}

function asPositiveInt(
  value: string,
  messageIndex: number,
  raw: string,
  key: string,
  max: number
) {
  if (!/^\d+$/.test(value)) {
    return fail("Recall 占位符数值无效", messageIndex, raw, key);
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > max) {
    return fail("Recall 占位符数值超出范围", messageIndex, raw, key);
  }
  return parsed;
}

/** Parse a single strict Recall envelope. */
export function parseRecallPlaceholder(
  raw: string,
  messageIndex: number
): RecallPlaceholder {
  if (!raw.startsWith("【recall") || !raw.endsWith("】")) {
    return fail("不是 Recall 占位符", messageIndex, raw);
  }
  const body = raw.slice("【recall".length, -1);
  if (!body) return { raw, messageIndex };
  if (!body.startsWith("::")) {
    return fail("Recall 占位符缺少参数分隔符", messageIndex, raw);
  }

  const values = new Map<string, string>();
  for (const segment of body.slice(2).split("::")) {
    const separator = segment.indexOf("=");
    if (separator <= 0 || separator === segment.length - 1) {
      return fail("Recall 占位符参数必须使用 key=value", messageIndex, raw);
    }
    const key = segment.slice(0, separator);
    if (!/^[a-z][a-z0-9-]*$/.test(key) || !VALID_KEYS.has(key)) {
      return fail("Recall 占位符包含未知参数", messageIndex, raw, key);
    }
    if (values.has(key)) {
      return fail("Recall 占位符包含重复参数", messageIndex, raw, key);
    }
    values.set(
      key,
      decode(segment.slice(separator + 1), messageIndex, raw, key)
    );
  }

  const result: RecallPlaceholder = { raw, messageIndex };
  for (const [key, value] of values) {
    switch (key) {
      case "collection":
        result.collection = value;
        break;
      case "preset":
        if (value !== "algorithmic" && value !== "comprehensive") {
          fail("Recall preset 无效", messageIndex, raw, key);
        }
        result.preset = value;
        break;
      case "profile":
        if (value !== "semantic" && value !== "associative") {
          fail("Recall profile 无效", messageIndex, raw, key);
        }
        result.profile = value;
        break;
      case "limit":
        result.limit = asPositiveInt(value, messageIndex, raw, key, 50);
        break;
      case "min-score": {
        const score = Number(value);
        if (!Number.isFinite(score) || score < 0 || score > 1) {
          fail("Recall min-score 无效", messageIndex, raw, key);
        }
        result.minScore = score;
        break;
      }
      case "when":
        if (
          !(["always", "gate", "turn", "static"] as string[]).includes(value)
        ) {
          fail("Recall when 无效", messageIndex, raw, key);
        }
        result.when = value as RecallPlaceholderWhen;
        break;
      case "gate-tags":
        result.gateTags = value.split(",").filter(Boolean);
        if (!result.gateTags.length)
          fail("Recall gate-tags 不能为空", messageIndex, raw, key);
        break;
      case "every-turns":
        result.everyTurns = asPositiveInt(value, messageIndex, raw, key, 1000);
        break;
      case "entries":
        result.entries = value.split(",").filter(Boolean);
        if (!result.entries.length)
          fail("Recall entries 不能为空", messageIndex, raw, key);
        break;
    }
  }
  if (result.when === "gate" && !result.gateTags?.length) {
    fail("when=gate 必须提供 gate-tags", messageIndex, raw, "gate-tags");
  }
  if (result.when === "turn" && !result.everyTurns) {
    fail("when=turn 必须提供 every-turns", messageIndex, raw, "every-turns");
  }
  if (result.when === "static" && !result.entries?.length) {
    fail("when=static 必须提供 entries", messageIndex, raw, "entries");
  }
  return result;
}

export function scanRecallPlaceholders(
  messages: Array<{ content?: unknown; sourceType?: string }>
): RecallPlaceholder[] {
  return scanRetrievalEnvelopes(messages, "recall").map((token) =>
    parseRecallPlaceholder(token.raw, token.messageIndex)
  );
}

export function serializeRecallPlaceholder(
  placeholder: Omit<RecallPlaceholder, "raw" | "messageIndex">
) {
  const values: Record<string, string | undefined> = {
    collection: placeholder.collection,
    preset: placeholder.preset,
    profile: placeholder.profile,
    limit: placeholder.limit?.toString(),
    "min-score": placeholder.minScore?.toString(),
    when: placeholder.when,
    "gate-tags": placeholder.gateTags?.join(","),
    "every-turns": placeholder.everyTurns?.toString(),
    entries: placeholder.entries?.join(","),
  };
  const body = CANONICAL_KEYS.flatMap((key) => {
    const value = values[key];
    return value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`];
  });
  return body.length ? `【recall::${body.join("::")}】` : "【recall】";
}
