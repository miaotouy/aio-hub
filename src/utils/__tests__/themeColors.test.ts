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
  avoidSemanticColorHueCollisions,
  hexToOklch,
} from "@/utils/themeColors";

const semanticColors = {
  success: "#67c23a",
  warning: "#e6a23c",
  danger: "#f56c6c",
  info: "#909399",
};

const hueDistance = (first: number, second: number) => {
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
};

describe("avoidSemanticColorHueCollisions", () => {
  it("moves an extracted color outside every chromatic semantic hue exclusion range", () => {
    // Prevent a wallpaper-derived green from being mistaken for the success state.
    const resolved = avoidSemanticColorHueCollisions(
      semanticColors.success,
      semanticColors
    );
    const resolvedOklch = hexToOklch(resolved);

    expect(resolved).not.toBe(semanticColors.success);
    expect(resolvedOklch).not.toBeNull();

    for (const semanticColor of Object.values(semanticColors)) {
      const semanticOklch = hexToOklch(semanticColor);
      if (semanticOklch && semanticOklch.c >= 0.04) {
        expect(hueDistance(resolvedOklch!.h, semanticOklch.h)).toBeGreaterThan(
          28
        );
      }
    }
  });

  it("keeps a theme color that is already separated from semantic colors", () => {
    expect(avoidSemanticColorHueCollisions("#409eff", semanticColors)).toBe(
      "#409eff"
    );
  });

  it("does not invent a hue exclusion range for a neutral information color", () => {
    expect(
      avoidSemanticColorHueCollisions("#909399", { info: "#909399" })
    ).toBe("#909399");
  });

  it("uses the user's current semantic colors rather than fixed defaults", () => {
    const customSuccess = "#e766b6";
    const resolved = avoidSemanticColorHueCollisions(customSuccess, {
      success: customSuccess,
    });

    expect(resolved).not.toBe(customSuccess);
  });
});
