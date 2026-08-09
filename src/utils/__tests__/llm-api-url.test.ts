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
import { buildLlmApiUrl, getLlmEndpointHint } from "../llm-api-url";

describe("Ollama API URL preview", () => {
  it("uses the OpenAI-compatible endpoint used by the runtime adapter", () => {
    expect(buildLlmApiUrl("http://localhost:11434", "ollama")).toBe(
      "http://localhost:11434/v1/chat/completions"
    );
    expect(
      buildLlmApiUrl("http://localhost:11434/v1", "ollama", "embeddings")
    ).toBe("http://localhost:11434/v1/embeddings");
    expect(getLlmEndpointHint("ollama")).toContain("/v1/");
  });
});
