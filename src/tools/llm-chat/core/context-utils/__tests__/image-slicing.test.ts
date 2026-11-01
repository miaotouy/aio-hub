// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentLike } from "../../../types/pipeline-attachment";
import type { PipelineAttachment } from "../../../types/pipeline-attachment";
import type { PipelineContext } from "../../../types/pipeline";
import {
  calculateTokensWithImageSlicing,
  getAttachmentSlicePlan,
  processImageSlices,
} from "../image-slicing";
import { getAttachmentBuffer } from "../attachment-binary";
import { loadImageFromBuffer } from "@/utils/imageProcessor";
import { planImageSlices } from "@/tools/smart-ocr/utils/imageSlicing";

vi.mock("../attachment-binary", () => ({ getAttachmentBuffer: vi.fn() }));
vi.mock("@/utils/imageProcessor", () => ({ loadImageFromBuffer: vi.fn() }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn() }),
}));
vi.mock("@/tools/smart-ocr/utils/imageSlicing", async (original) => ({
  ...(await original<typeof import("@/tools/smart-ocr/utils/imageSlicing")>()),
  planImageSlices: vi.fn(),
}));
const config = { enabled: true, aspectRatioThreshold: 3, minCutHeight: 680 };
const plan = {
  width: 100,
  height: 500,
  regions: [
    { startY: 0, endY: 200 },
    { startY: 200, endY: 500 },
  ],
  lines: [],
};
const asset = (id: string): PipelineAttachment => ({
  id,
  name: "long.png",
  type: "image",
  mimeType: "image/png",
  metadata: { width: 100, height: 500 },
  source: { kind: "asset-library", path: `${id}.png` },
});
const original = new ArrayBuffer(4);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAttachmentBuffer).mockResolvedValue(original);
  vi.mocked(loadImageFromBuffer).mockResolvedValue({
    img: { naturalWidth: 100, naturalHeight: 500 } as HTMLImageElement,
    cleanup: vi.fn(),
  });
  vi.mocked(planImageSlices).mockReturnValue(plan);
});

describe("long image request preparation", () => {
  it("defers uncached passive reads, then shares a prepared plan with per-slice token costs", async () => {
    const image = asset("cached-plan");
    const calculator = {
      calculateMessageTokens: vi.fn(
        async (
          _text: string,
          _model: string,
          attachments: AttachmentLike[] = []
        ) => ({
          count: attachments.reduce(
            (sum: number, a: AttachmentLike) => sum + a.metadata!.height!,
            0
          ),
          isEstimated: false,
        })
      ),
    };
    const estimate = await calculateTokensWithImageSlicing(
      calculator as never,
      "",
      "model",
      [image],
      config,
      undefined,
      { cacheOnly: true }
    );
    expect(estimate.isEstimated).toBe(true);
    expect(getAttachmentBuffer).not.toHaveBeenCalled();
    await getAttachmentSlicePlan(image, config);
    const exact = await calculateTokensWithImageSlicing(
      calculator as never,
      "",
      "model",
      [image],
      config,
      { maxImageDimension: 128 },
      { cacheOnly: true }
    );
    expect(exact).toMatchObject({ count: 500, isEstimated: false });
    expect(
      calculator.calculateMessageTokens.mock.calls[1][2]!.map(
        (a: AttachmentLike) => a.metadata?.height
      )
    ).toEqual([200, 300]);
    expect(getAttachmentBuffer).toHaveBeenCalledTimes(1);
    expect(image.metadata?.height).toBe(500);
    await getAttachmentSlicePlan(image, { ...config, minCutHeight: 700 });
    expect(planImageSlices).toHaveBeenCalledTimes(2);
  });

  it("keeps mutable local file analysis within its own request", async () => {
    const image = {
      ...asset("local"),
      source: { kind: "local-file" as const, path: "local.png" },
    };
    await getAttachmentSlicePlan(image, config, { scope: new WeakMap() });
    expect(
      await getAttachmentSlicePlan(image, config, { cacheOnly: true })
    ).toBeUndefined();
    await getAttachmentSlicePlan(image, config, { scope: new WeakMap() });
    expect(getAttachmentBuffer).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "processes slices top-to-bottom before downstream conversion, with atomic fallback=%s",
    async (fail) => {
      const image = asset(`materialize-${fail}`);
      const draw = vi.fn();
      let encoded = 0;
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: draw }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          encoded++;
          callback(
            fail && encoded === 2
              ? null
              : ({
                  arrayBuffer: async () => Uint8Array.of(encoded).buffer,
                } as Blob)
          );
        },
      };
      vi.spyOn(document, "createElement").mockReturnValue(canvas as never);
      const context = {
        settings: { requestSettings: { longImageSlicing: config } },
        sharedData: new Map(),
      } as unknown as PipelineContext;
      const downstream = vi.fn(async (buffer: ArrayBuffer) => [
        buffer === original ? "original" : `slice-${new Uint8Array(buffer)[0]}`,
      ]);
      const parts = await processImageSlices(
        image,
        original,
        context,
        downstream
      );
      expect(parts).toEqual(fail ? ["original"] : ["slice-1", "slice-2"]);
      expect(draw.mock.calls.map((call) => [call[2], call[4]])).toEqual([
        [0, 200],
        [200, 300],
      ]);
      expect(canvas.width).toBe(0);
      if (fail) {
        const fallbackPlan = await getAttachmentSlicePlan(image, config, {
          scope: context.sharedData.get("imageSlicingScope"),
        });
        expect(fallbackPlan?.regions).toEqual([{ startY: 0, endY: 500 }]);
      }
      vi.restoreAllMocks();
    }
  );
});
