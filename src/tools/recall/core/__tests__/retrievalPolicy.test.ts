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
import { resolveRetrievalParams } from "../retrievalPolicy";
import type { RecallRetrievalRequest } from "../../types/retrieval";

function request(): RecallRetrievalRequest {
  return {
    recallId: "collection-a",
    recallName: "stale display name",
    mode: "always",
    userText: "query",
    aiText: "",
    turnCount: 1,
    recentMessageTexts: [],
    settings: {},
    enabledBindings: [
      { recallId: "collection-a", recallName: "Renamed collection" },
      { recallId: "collection-b", recallName: "stale display name" },
    ],
  };
}

describe("Recall retrieval policy", () => {
  it("uses the stable collection ID before the display name", () => {
    expect(resolveRetrievalParams(request()).recallIds).toEqual([
      "collection-a",
    ]);
  });

  it("uses profiles for product retrieval without leaking a legacy engine", () => {
    expect(resolveRetrievalParams(request())).toMatchObject({
      profile: "semantic",
      engineId: undefined,
    });
    expect(
      resolveRetrievalParams({ ...request(), profile: "associative" }).profile
    ).toBe("associative");
    expect(
      resolveRetrievalParams({ ...request(), profile: "associative" })
    ).toMatchObject({ limit: 4, minScore: 0.45 });
  });

  it("preserves explicit zero thresholds", () => {
    expect(resolveRetrievalParams({ ...request(), minScore: 0 }).minScore).toBe(
      0
    );
  });
});
