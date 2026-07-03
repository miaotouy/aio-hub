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
  coerceAgentBoolean,
  normalizeAgentBooleanFields,
  parseAgentBoolean,
} from "../agentArgs";

describe("agentArgs", () => {
  it("parseAgentBoolean 应识别常见布尔字符串和数字", () => {
    expect(parseAgentBoolean(true)).toBe(true);
    expect(parseAgentBoolean(false)).toBe(false);
    expect(parseAgentBoolean("TRUE")).toBe(true);
    expect(parseAgentBoolean(" false ")).toBe(false);
    expect(parseAgentBoolean("1")).toBe(true);
    expect(parseAgentBoolean("0")).toBe(false);
    expect(parseAgentBoolean(1)).toBe(true);
    expect(parseAgentBoolean(0)).toBe(false);
    expect(parseAgentBoolean("maybe")).toBeUndefined();
  });

  it("coerceAgentBoolean 应保留默认值语义", () => {
    expect(coerceAgentBoolean(undefined, true)).toBe(true);
    expect(coerceAgentBoolean(undefined, false)).toBe(false);
    expect(coerceAgentBoolean("false", true)).toBe(false);
  });

  it("normalizeAgentBooleanFields 只转换已声明字段", () => {
    expect(
      normalizeAgentBooleanFields(
        { enabled: "false", confirm: "yes", untouched: "false" },
        ["enabled", "confirm"]
      )
    ).toEqual({ enabled: false, confirm: true, untouched: "false" });
  });
});
