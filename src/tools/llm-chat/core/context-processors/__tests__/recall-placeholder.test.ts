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

import { describe, expect, it } from "vitest";
import {
  RecallPlaceholderError,
  parseRecallPlaceholder,
  scanRecallPlaceholders,
  serializeRecallPlaceholder,
} from "../recall-placeholder";

describe("Recall placeholder protocol", () => {
  it("serializes in canonical order and round-trips URL encoded values", () => {
    const raw = serializeRecallPlaceholder({
      collection: "collection/1",
      profile: "semantic",
      limit: 8,
      minScore: 0.35,
      when: "gate",
      gateTags: ["rust", "async io"],
    });
    expect(raw).toBe(
      "【recall::collection=collection%2F1::profile=semantic::limit=8::min-score=0.35::when=gate::gate-tags=rust%2Casync%20io】"
    );
    expect(parseRecallPlaceholder(raw, 2)).toMatchObject({
      messageIndex: 2,
      collection: "collection/1",
      gateTags: ["rust", "async io"],
    });
  });

  it("rejects unknown, duplicate and invalid domain parameters", () => {
    expect(() => parseRecallPlaceholder("【recall::engineId=x】", 0)).toThrow(
      RecallPlaceholderError
    );
    expect(() =>
      parseRecallPlaceholder("【recall::limit=3::limit=4】", 1)
    ).toThrow(RecallPlaceholderError);
    expect(() => parseRecallPlaceholder("【recall::when=gate】", 2)).toThrow(
      RecallPlaceholderError
    );
  });

  it("skips session history while preserving message diagnostics", () => {
    const placeholders = scanRecallPlaceholders([
      { content: "【recall::limit=2】" },
      { content: "【recall::limit=4】", sourceType: "session_history" },
    ]);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].messageIndex).toBe(0);
  });
});
