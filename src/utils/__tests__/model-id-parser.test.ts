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

import { isValidModelId, parseModelIdList } from "../model-id-parser";

describe("parseModelIdList", () => {
  it("parses comma-separated model ids", () => {
    const input =
      "doubao-embedding-vision,ark-code-latest,doubao-seed-2.1-pro,doubao-seed-2.1-lite,glm-5.3-flash,deepseek-v4.1-flash,doubao-seed-evolving,glm-5.3";
    expect(parseModelIdList(input)).toEqual([
      "doubao-embedding-vision",
      "ark-code-latest",
      "doubao-seed-2.1-pro",
      "doubao-seed-2.1-lite",
      "glm-5.3-flash",
      "deepseek-v4.1-flash",
      "doubao-seed-evolving",
      "glm-5.3",
    ]);
  });

  it("parses full-width commas and semicolons", () => {
    expect(parseModelIdList("glm-5.3，deepseek-v4.1；ark-code-latest")).toEqual(
      ["glm-5.3", "deepseek-v4.1", "ark-code-latest"]
    );
  });

  it("parses newline-separated lists", () => {
    expect(parseModelIdList("glm-5.3\ndeepseek-v4.1\nark-code-latest")).toEqual(
      ["glm-5.3", "deepseek-v4.1", "ark-code-latest"]
    );
  });

  it("strips markdown list markers and line comments", () => {
    const input = [
      "- doubao-seed-2.1-pro # 旗舰模型",
      "* glm-5.3 // 智谱",
      "1. deepseek-v4.1",
      "",
      "  ark-code-latest",
    ].join("\n");
    expect(parseModelIdList(input)).toEqual([
      "doubao-seed-2.1-pro",
      "glm-5.3",
      "deepseek-v4.1",
      "ark-code-latest",
    ]);
  });

  it("strips surrounding quotes", () => {
    expect(
      parseModelIdList("\"doubao-seed-2.1-pro\", 'glm-5.3', `deepseek-v4.1`")
    ).toEqual(["doubao-seed-2.1-pro", "glm-5.3", "deepseek-v4.1"]);
  });

  it("parses JSON string arrays", () => {
    expect(
      parseModelIdList('["doubao-seed-2.1-pro", "glm-5.3", "deepseek-v4.1"]')
    ).toEqual(["doubao-seed-2.1-pro", "glm-5.3", "deepseek-v4.1"]);
  });

  it("parses OpenAI /v1/models style responses", () => {
    const input = JSON.stringify({
      object: "list",
      data: [
        { id: "doubao-seed-2.1-pro", object: "model" },
        { id: "glm-5.3", object: "model" },
      ],
    });
    expect(parseModelIdList(input)).toEqual(["doubao-seed-2.1-pro", "glm-5.3"]);
  });

  it("parses config dictionaries with a models field", () => {
    expect(
      parseModelIdList('{"models": ["glm-5.3", "deepseek-v4.1"]}')
    ).toEqual(["glm-5.3", "deepseek-v4.1"]);
  });

  it("parses dictionaries keyed by model id", () => {
    const input = JSON.stringify({
      "doubao-seed-2.1-pro": { maxTokens: 8192 },
      "glm-5.3": { maxTokens: 4096 },
    });
    expect(parseModelIdList(input)).toEqual(["doubao-seed-2.1-pro", "glm-5.3"]);
  });

  it("dedupes while preserving order", () => {
    expect(parseModelIdList("glm-5.3, deepseek-v4.1, glm-5.3")).toEqual([
      "glm-5.3",
      "deepseek-v4.1",
    ]);
  });

  it("returns empty for empty or invalid input", () => {
    expect(parseModelIdList("")).toEqual([]);
    expect(parseModelIdList("   \n  ")).toEqual([]);
    expect(parseModelIdList("不是模型ID！")).toEqual([]);
  });

  it("keeps scoped ids with slash and colon", () => {
    expect(
      parseModelIdList("deepseek/deepseek-chat:free, qwen/qwen3-max")
    ).toEqual(["deepseek/deepseek-chat:free", "qwen/qwen3-max"]);
  });
});

describe("isValidModelId", () => {
  it("accepts common model id shapes", () => {
    expect(isValidModelId("gpt-4o")).toBe(true);
    expect(isValidModelId("claude/claude-sonnet-4")).toBe(true);
    expect(isValidModelId("local:llama3:latest")).toBe(true);
  });

  it("rejects invalid shapes", () => {
    expect(isValidModelId("")).toBe(false);
    expect(isValidModelId("hello world")).toBe(false);
    expect(isValidModelId("模型")).toBe(false);
  });
});
