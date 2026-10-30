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

import { afterEach, describe, expect, it, vi } from "vitest";
import ColorThief from "color-thief-ts";
import { useColorExtractor } from "../composables/useColorExtractor";
import { rgbToHex } from "../composables/useColorConverter";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: (fn: () => Promise<unknown>) => fn(),
  }),
}));

afterEach(() => vi.restoreAllMocks());

function pixelImage(pixelAt: (index: number) => number[]): HTMLImageElement {
  const image = new Image();
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: 64 },
    naturalHeight: { value: 64 },
  });
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) pixels.set(pixelAt(i), i * 4);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  return image;
}

describe("图片主色调的公开输出", () => {
  it("红蓝双色图片在请求更多主色时仍只输出可用 HEX", async () => {
    const image = pixelImage((i) =>
      i % 64 < 32 ? [255, 0, 0, 255] : [0, 0, 255, 255]
    );
    const result = await useColorExtractor().extractQuantizeColors(image, 8);
    expect(result!.count).toBeGreaterThanOrEqual(2);
    expect(result!.colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(
      true
    );
    const channels = result!.colors.map((color) => [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ]);
    expect(channels.some(([r, g, b]) => r > 240 && g < 16 && b < 16)).toBe(
      true
    );
    expect(channels.some(([r, g, b]) => b > 240 && g < 16 && r < 16)).toBe(
      true
    );
  });

  it("保留有效黑色，过滤空桶与空主色并去重", async () => {
    const image = pixelImage(() => [0, 0, 0, 255]);
    vi.spyOn(ColorThief.prototype, "getColor").mockReturnValue(null as never);
    vi.spyOn(ColorThief.prototype, "getPalette").mockReturnValue([
      [0, 0, 0],
      [0, 0, 0],
      [256, 4, 4],
      [NaN, 0, 0],
    ] as never);
    expect(await useColorExtractor().extractQuantizeColors(image)).toEqual({
      colors: ["#000000"],
      count: 1,
    });
  });

  it("透明图片返回空调色板", async () => {
    const image = pixelImage(() => [255, 0, 0, 0]);
    expect(await useColorExtractor().extractQuantizeColors(image)).toEqual({
      colors: [],
      count: 0,
    });
  });

  it("RGB 转换对小数取整并限制到单字节", () => {
    expect(rgbToHex(12.4, 254.8, 0)).toBe("#0CFF00");
    expect(rgbToHex(-1, 256, 4)).toBe("#00FF04");
  });
});
