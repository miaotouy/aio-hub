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
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
} from "@/config/model-metadata";
import { resolveAppliedModelGroup } from "../modelMetadataApplication";

describe("resolveAppliedModelGroup", () => {
  it("prefers model metadata over an OpenAI-compatible channel group", () => {
    const claudeMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "claude-sonnet-4",
      "openai"
    );
    const geminiMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-2.5-pro",
      "openai"
    );

    expect(resolveAppliedModelGroup("OpenAI", claudeMetadata?.group)).toBe(
      "Claude 4"
    );
    expect(resolveAppliedModelGroup("OpenAI", geminiMetadata?.group)).toBe(
      "Gemini 2.5"
    );
  });

  it("keeps the source group when no metadata group matches", () => {
    expect(resolveAppliedModelGroup("Other", undefined)).toBe("Other");
  });
});
