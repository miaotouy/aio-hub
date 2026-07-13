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
  colorDistancePercent,
  interpolateVariables,
  parseHex,
  resolveCoordinate,
  resolveRect,
  rgbToHex,
} from "../flowUtils";

describe("flowUtils", () => {
  it("resolves pixel and percent coordinates", async () => {
    await expect(
      resolveCoordinate(12, 34, "pixel", async () => ({
        width: 200,
        height: 100,
      }))
    ).resolves.toEqual({ x: 12, y: 34 });

    await expect(
      resolveCoordinate(25, 50, "percent", async () => ({
        width: 200,
        height: 100,
      }))
    ).resolves.toEqual({ x: 50, y: 50 });
  });

  it("resolves pixel and percent rects", () => {
    expect(
      resolveRect(
        { x: 1, y: 2, width: 3, height: 4, mode: "pixel" },
        { width: 200, height: 100 }
      )
    ).toEqual({ x: 1, y: 2, width: 3, height: 4 });

    expect(
      resolveRect(
        { x: 10, y: 20, width: 25, height: 50, mode: "percent" },
        { width: 200, height: 100 }
      )
    ).toEqual({ x: 20, y: 20, width: 50, height: 50 });
  });

  it("parses and formats hex colors", () => {
    expect(parseHex("#0A1B2C")).toEqual({ r: 10, g: 27, b: 44 });
    expect(parseHex("0a1b2c")).toEqual({ r: 10, g: 27, b: 44 });
    expect(parseHex("bad")).toBeNull();
    expect(rgbToHex(10, 27, 44)).toBe("#0A1B2C");
  });

  it("computes color distance percentage", () => {
    expect(colorDistancePercent("#000000", "#000000")).toBe(0);
    expect(colorDistancePercent("#000000", "#FFFFFF")).toBeCloseTo(100);
    expect(colorDistancePercent("bad", "#FFFFFF")).toBe(100);
  });

  it("interpolates variables with local scope taking priority", () => {
    expect(
      interpolateVariables("hp={hp}, name={name}, missing={missing}", {
        local: { hp: "80" },
        global: { hp: "10", name: "AIO" },
      })
    ).toBe("hp=80, name=AIO, missing={missing}");
  });
});
