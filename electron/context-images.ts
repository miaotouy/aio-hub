// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { createRequire } from "node:module";
import { waitForOwnerOperation } from "../src/utils/waitForOwnerOperation";
import {
  effectiveImageSlicingConfig,
  planImageSlicesFromVariances,
  type ImageSlicePlan,
  type LongImageSlicingConfig,
} from "../src/tools/smart-ocr/utils/imageSlicePlan";
import {
  toPipelineAttachment,
  type AttachmentLike,
  type PipelineAttachment,
} from "../src/tools/llm-chat/types/pipeline-attachment";
import type { TokenCalculationScope } from "../src/tools/token-calculator/core/messageTokenCalculator";
import type { NodeContextAttachments } from "./context-attachments";

export interface RasterImageRuntime {
  load(input: Buffer): Promise<{ width: number; height: number }>;
  rowVariances(): Promise<number[]>;
  encode(options: string): Promise<Buffer>;
  close(): void;
}
interface RasterAddon {
  RasterImageRuntime: new () => RasterImageRuntime;
}
type Logger = Pick<Console, "warn">;
interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
}
interface ImageContext {
  readonly signal?: AbortSignal;
  settings?: {
    requestSettings?: { longImageSlicing?: LongImageSlicingConfig };
  };
}
const standalone = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
};

/** Application-owned native codec pool; cancellation closes only the requesting bitmap. */
export class NodeContextImages {
  private addon?: RasterAddon;
  private active = new Set<RasterImageRuntime>();
  private queued = 0;
  private tail = Promise.resolve();
  private closing = false;
  constructor(
    private appPath: string,
    private loadAddon = (file: string): RasterAddon =>
      createRequire(import.meta.url)(file)
  ) {}
  private async bitmap<T>(
    buffer: ArrayBuffer,
    signal: AbortSignal | undefined,
    operation: (
      image: RasterImageRuntime,
      dimensions: { width: number; height: number }
    ) => Promise<T>
  ): Promise<T> {
    return waitForOwnerOperation(
      () => this.withBitmap(buffer, signal, operation),
      signal
    );
  }
  private async withBitmap<T>(
    buffer: ArrayBuffer,
    signal: AbortSignal | undefined,
    operation: (
      image: RasterImageRuntime,
      dimensions: { width: number; height: number }
    ) => Promise<T>
  ): Promise<T> {
    signal?.throwIfAborted();
    if (this.closing) throw new Error("图片服务已关闭");
    if (this.queued >= 32) throw new Error("图片处理任务较多，请稍后重试");
    this.queued++;
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Single decoded bitmap at a time bounds native working memory across all contexts.
    try {
      await waitForOwnerOperation(() => previous, signal);
      if (this.closing) throw new Error("图片服务已关闭");
      this.addon ??= this.loadAddon(
        path.join(this.appPath, "native-runtime/knowledge-addon.node")
      );
      const image = new this.addon.RasterImageRuntime();
      this.active.add(image);
      const abort = () => image.close();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const dimensions = await image.load(Buffer.from(buffer));
        signal?.throwIfAborted();
        const result = await operation(image, dimensions);
        signal?.throwIfAborted();
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
        image.close();
        this.active.delete(image);
      }
    } finally {
      // Cancelled queued work cannot let the next operation overtake an active bitmap.
      void previous.finally(release);
      this.queued--;
    }
  }
  getImageDimensions(buffer: ArrayBuffer, signal?: AbortSignal) {
    return this.bitmap(buffer, signal, async (_image, dimensions) => ({
      ...dimensions,
      byteLength: buffer.byteLength,
    }));
  }
  resizeImage(
    buffer: ArrayBuffer,
    options: ResizeOptions,
    signal?: AbortSignal
  ) {
    return this.bitmap(buffer, signal, async (image, dimensions) => {
      if (
        ![options.maxWidth, options.maxHeight].every(
          (n) => Number.isFinite(n) && n > 0
        )
      )
        throw new Error("图片缩放上限无效");
      const scale = Math.min(
        1,
        options.maxWidth / dimensions.width,
        options.maxHeight / dimensions.height
      );
      const width = Math.max(1, Math.floor(dimensions.width * scale)),
        height = Math.max(1, Math.floor(dimensions.height * scale));
      if (scale === 1 && (!options.format || options.format === "png"))
        return buffer;
      return standalone(
        await image.encode(
          JSON.stringify({
            width,
            height,
            format: options.format ?? "png",
            quality: options.quality,
          })
        )
      );
    });
  }
  async plan(
    buffer: ArrayBuffer,
    config: LongImageSlicingConfig,
    signal?: AbortSignal
  ) {
    return this.bitmap(buffer, signal, async (image, dimensions) => {
      const effective = effectiveImageSlicingConfig(config);
      const variances =
        effective.enabled &&
        dimensions.height / dimensions.width > effective.aspectRatioThreshold
          ? await image.rowVariances()
          : [];
      signal?.throwIfAborted();
      return planImageSlicesFromVariances(
        dimensions.width,
        dimensions.height,
        variances,
        effective
      );
    });
  }
  async slices<T>(
    buffer: ArrayBuffer,
    plan: ImageSlicePlan,
    signal: AbortSignal | undefined,
    process: (part: ArrayBuffer) => Promise<T[]>
  ): Promise<T[]> {
    // Finish encoding the complete group before exposing any parts; native errors leave no partial group.
    const encoded = await this.bitmap(
      buffer,
      signal,
      async (image, dimensions) => {
        if (
          dimensions.width !== plan.width ||
          dimensions.height !== plan.height
        )
          throw new Error("图片内容已变化，请重新准备附件");
        const parts: ArrayBuffer[] = [];
        let bytes = 0;
        for (const region of plan.regions) {
          signal?.throwIfAborted();
          const slice = await image.encode(
            JSON.stringify({
              startY: region.startY,
              endY: region.endY,
              format: "png",
            })
          );
          bytes += slice.byteLength;
          if (bytes > 64 * 1024 * 1024)
            throw new Error("图片切片总量超过 64 MiB");
          parts.push(standalone(slice));
        }
        return parts;
      }
    );
    const result: T[] = [];
    for (const part of encoded) {
      signal?.throwIfAborted();
      result.push(...(await process(part)));
    }
    signal?.throwIfAborted();
    return result;
  }
  createScope(
    attachments: NodeContextAttachments,
    options: {
      signal?: AbortSignal;
      slicing?: LongImageSlicingConfig;
      statistics?: boolean;
      logger: Logger;
    }
  ) {
    options = {
      ...options,
      slicing: options.slicing ? { ...options.slicing } : undefined,
    };
    const lifetime = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, lifetime.signal])
      : lifetime.signal;
    const plans = new Map<string, Promise<ImageSlicePlan | undefined>>();
    const check = () => signal.throwIfAborted();
    const planFor = async (
      asset: PipelineAttachment,
      config: LongImageSlicingConfig,
      buffer?: ArrayBuffer
    ) => {
      check();
      const key = JSON.stringify([
        asset.source,
        effectiveImageSlicingConfig(config),
      ]);
      let plan = plans.get(key);
      if (!plan && !options.statistics) {
        plan = (async () => {
          try {
            return await this.plan(
              buffer ?? (await attachments.read(asset)),
              config,
              signal
            );
          } catch (error) {
            check();
            options.logger.warn("长图分析失败，沿用原图", {
              assetId: asset.id,
              error,
            });
            return undefined;
          }
        })();
        plans.set(key, plan);
      }
      return plan;
    };
    return {
      getAttachmentBuffer: async (asset: PipelineAttachment) =>
        waitForOwnerOperation(() => attachments.read(asset), signal),
      getImageDimensions: (buffer: ArrayBuffer) =>
        this.getImageDimensions(buffer, signal),
      resizeImage: (buffer: ArrayBuffer, resize: ResizeOptions) =>
        this.resizeImage(buffer, resize, signal),
      convertArrayBufferToBase64: async (data: ArrayBuffer | Uint8Array) => {
        check();
        return Buffer.from(
          data instanceof Uint8Array ? data : new Uint8Array(data)
        ).toString("base64");
      },
      wrapTokenCalculator: (
        base: TokenCalculationScope
      ): TokenCalculationScope => ({
        calculateTokens: async (...args) =>
          waitForOwnerOperation(() => base.calculateTokens(...args), signal),
        calculateMessageTokens: async (text, id, input, tokenOptions) => {
          check();
          if (!options.slicing?.enabled || !input?.length)
            return waitForOwnerOperation(
              () => base.calculateMessageTokens(text, id, input, tokenOptions),
              signal
            );
          const prepared: typeof input = [];
          let estimated = false;
          for (const original of input) {
            check();
            // Shared pipeline inputs are full attachments; metadata-only consumers keep their estimate.
            if (
              original.type !== "image" ||
              !("source" in original || "path" in original)
            ) {
              prepared.push(original);
              continue;
            }
            const asset = toPipelineAttachment(original as AttachmentLike);
            const plan = await planFor(asset, options.slicing);
            if (plan)
              for (const { startY, endY } of plan.regions)
                prepared.push({
                  ...asset,
                  metadata: {
                    ...asset.metadata,
                    width: plan.width,
                    height: endY - startY,
                  },
                });
            else {
              prepared.push(original);
              const { width, height } = original.metadata ?? {};
              estimated ||=
                !width ||
                !height ||
                height / width >
                  effectiveImageSlicingConfig(options.slicing)
                    .aspectRatioThreshold;
            }
          }
          const result = await waitForOwnerOperation(
            () => base.calculateMessageTokens(text, id, prepared, tokenOptions),
            signal
          );
          check();
          return { ...result, isEstimated: result.isEstimated || estimated };
        },
      }),
      processImageSlices: async <T>(
        asset: PipelineAttachment,
        buffer: ArrayBuffer,
        context: ImageContext,
        process: (part: ArrayBuffer) => Promise<T[]>
      ): Promise<T[]> => {
        check();
        context.signal?.throwIfAborted();
        const config =
          options.slicing ??
          context.settings?.requestSettings?.longImageSlicing;
        if (!config?.enabled) return process(buffer);
        const plan = await planFor(asset, config, buffer);
        check();
        context.signal?.throwIfAborted();
        if (!plan || plan.regions.length < 2) return process(buffer);
        try {
          return await this.slices(
            buffer,
            plan,
            context.signal ? AbortSignal.any([signal, context.signal]) : signal,
            process
          );
        } catch (error) {
          check();
          context.signal?.throwIfAborted();
          options.logger.warn("长图切分失败，整组回退到原图", {
            assetId: asset.id,
            error,
          });
          plans.set(
            JSON.stringify([asset.source, effectiveImageSlicingConfig(config)]),
            Promise.resolve({
              ...plan,
              regions: [{ startY: 0, endY: plan.height }],
              lines: [],
            })
          );
          return process(buffer);
        }
      },
      dispose: () => {
        lifetime.abort();
        plans.clear();
        attachments.dispose();
      },
    };
  }
  async shutdown() {
    this.closing = true;
    for (const image of this.active) image.close();
    await this.tail;
  }
}
