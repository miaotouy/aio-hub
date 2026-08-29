// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
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
  createDefaultImageFilterConfig,
  createImageFilterPreset,
} from "../../types";
import { applyImageFilterToPixels, isImageFilterActive } from "../image";

describe("realtime subtitle OCR image filters", () => {
  it("keeps pixels unchanged for the original preset", () => {
    const input = new Uint8ClampedArray([12, 128, 240, 89]);
    const output = applyImageFilterToPixels(
      input,
      createDefaultImageFilterConfig()
    );

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(isImageFilterActive(createDefaultImageFilterConfig())).toBe(false);
  });

  it("converts pixels to grayscale before later operations", () => {
    const output = applyImageFilterToPixels(
      new Uint8ClampedArray([255, 0, 0, 255]),
      { ...createDefaultImageFilterConfig(), preset: "custom", grayscale: true }
    );

    expect(output[0]).toBe(output[1]);
    expect(output[1]).toBe(output[2]);
    expect(output[3]).toBe(255);
  });

  it("applies color desaturation before grayscale and preserves alpha", () => {
    const output = applyImageFilterToPixels(
      new Uint8ClampedArray([20, 170, 240, 77]),
      {
        ...createDefaultImageFilterConfig(),
        preset: "custom",
        saturation: -100,
      }
    );

    expect(output[0]).toBe(output[1]);
    expect(output[1]).toBe(output[2]);
    expect(output[3]).toBe(77);
  });

  it("binarizes after inversion", () => {
    const output = applyImageFilterToPixels(
      new Uint8ClampedArray([100, 100, 100, 255]),
      {
        ...createDefaultImageFilterConfig(),
        preset: "custom",
        invert: true,
        binarize: true,
        threshold: 128,
      }
    );

    expect([...output]).toEqual([255, 255, 255, 255]);
  });

  it("provides the documented built-in preset values", () => {
    expect(createImageFilterPreset("grayscale-enhanced")).toMatchObject({
      preset: "grayscale-enhanced",
      grayscale: true,
      contrast: 20,
      binarize: false,
    });
    expect(createImageFilterPreset("high-contrast-binary")).toMatchObject({
      preset: "high-contrast-binary",
      grayscale: true,
      contrast: 30,
      binarize: true,
      threshold: 160,
    });
    expect(createImageFilterPreset("inverted-binary")).toMatchObject({
      preset: "inverted-binary",
      invert: true,
      binarize: true,
      threshold: 160,
    });
  });
});
