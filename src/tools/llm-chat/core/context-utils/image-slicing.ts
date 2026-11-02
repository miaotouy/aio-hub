// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { loadImageFromBuffer } from "@/utils/imageProcessor";
import {
  DEFAULT_SLICER_CONFIG,
  planImageSlices,
  type ImageSlicePlan,
} from "@/tools/smart-ocr/utils/imageSlicing";
import type { PipelineContext } from "../../types/pipeline";
import type { ChatSettings } from "../../types/settings";
import {
  toPipelineAttachment,
  type AttachmentLike,
  type PipelineAttachment,
} from "../../types/pipeline-attachment";
import { getAttachmentBuffer } from "./attachment-binary";
import type { tokenCalculatorService } from "@/tools/token-calculator/token-calculator.registry";

type SlicingConfig = ChatSettings["requestSettings"]["longImageSlicing"];
type TokenCalculator = Pick<
  typeof tokenCalculatorService,
  "calculateMessageTokens"
>;
const logger = createModuleLogger("llm-chat/image-slicing");
export const imageSlicePlanRevision = ref(0);
const planCache = new Map<string, Promise<ImageSlicePlan | undefined>>();
const MAX_PLANS = 64;
let planningQueue: Promise<unknown> = Promise.resolve();

export interface ImageSlicingOptions {
  cacheOnly?: boolean;
  scope?: WeakMap<
    PipelineAttachment,
    Map<string, Promise<ImageSlicePlan | undefined>>
  >;
  buffer?: ArrayBuffer;
}

export function getContextImageSlicingOptions(
  context: PipelineContext
): ImageSlicingOptions {
  const key = "imageSlicingScope";
  let scope = context.sharedData.get(key) as ImageSlicingOptions["scope"];
  if (!scope) {
    scope = new WeakMap();
    context.sharedData.set(key, scope);
  }
  return { scope, cacheOnly: context.previewPurpose === "statistics" };
}

function effectiveConfig(config: SlicingConfig) {
  return {
    ...DEFAULT_SLICER_CONFIG,
    enabled: config.enabled,
    aspectRatioThreshold: Number.isFinite(config.aspectRatioThreshold)
      ? Math.max(1, config.aspectRatioThreshold)
      : DEFAULT_SLICER_CONFIG.aspectRatioThreshold,
    minCutHeight: Number.isFinite(config.minCutHeight)
      ? Math.max(1, Math.round(config.minCutHeight))
      : DEFAULT_SLICER_CONFIG.minCutHeight,
  };
}

/** Cache plans only for immutable library assets; mutable files remain request-scoped. */
export async function getAttachmentSlicePlan(
  asset: PipelineAttachment,
  config: SlicingConfig | undefined,
  options: ImageSlicingOptions = {}
): Promise<ImageSlicePlan | undefined> {
  if (!config?.enabled || asset.type !== "image") return undefined;
  const settings = effectiveConfig(config);
  const configKey = JSON.stringify(settings);
  const scoped = options.scope?.get(asset)?.get(configKey);
  if (scoped) return scoped;
  const cacheKey =
    asset.source.kind === "asset-library"
      ? JSON.stringify([
          asset.source.path,
          asset.size,
          asset.metadata?.width,
          asset.metadata?.height,
          configKey,
        ])
      : undefined;
  const cached = cacheKey ? planCache.get(cacheKey) : undefined;
  if (cached) {
    planCache.delete(cacheKey!);
    planCache.set(cacheKey!, cached);
    rememberPlan(asset, configKey, cached, options);
    return cached;
  }
  if (
    !options.buffer &&
    asset.metadata?.width &&
    asset.metadata.height &&
    asset.metadata.height / asset.metadata.width <=
      settings.aspectRatioThreshold
  )
    return undefined;
  if (options.cacheOnly) return undefined;

  const pending = planningQueue.then(async () => {
    try {
      const buffer = options.buffer ?? (await getAttachmentBuffer(asset));
      const { img, cleanup } = await loadImageFromBuffer(buffer);
      try {
        const plan = planImageSlices(img, settings);
        imageSlicePlanRevision.value++;
        return plan;
      } finally {
        cleanup();
      }
    } catch (error) {
      if (cacheKey) planCache.delete(cacheKey);
      logger.warn("长图分析失败，沿用原图", { assetId: asset.id, error });
      return undefined;
    }
  });
  planningQueue = pending;
  rememberPlan(asset, configKey, pending, options);
  if (cacheKey) {
    if (planCache.size >= MAX_PLANS)
      planCache.delete(planCache.keys().next().value!);
    planCache.set(cacheKey, pending);
  }
  return pending;
}

function rememberPlan(
  asset: PipelineAttachment,
  key: string,
  plan: Promise<ImageSlicePlan | undefined>,
  options: ImageSlicingOptions
) {
  if (!options.scope) return;
  let entries = options.scope.get(asset);
  if (!entries) {
    entries = new Map();
    options.scope.set(asset, entries);
  }
  entries.set(key, plan);
}

/** Token-only descriptors: original attachments and persisted messages stay intact. */
export async function prepareImageTokenAttachments(
  attachments: readonly AttachmentLike[] | undefined,
  config: SlicingConfig | undefined,
  options: ImageSlicingOptions = {}
) {
  if (!config?.enabled || !attachments?.length) {
    return { attachments, isEstimated: false };
  }
  const prepared: AttachmentLike[] = [];
  let isEstimated = false;
  // Sequential analysis avoids decoding all historical images concurrently.
  for (const original of attachments) {
    const asset = toPipelineAttachment(original);
    if (asset.type !== "image") {
      prepared.push(original);
      continue;
    }
    const plan = await getAttachmentSlicePlan(asset, config, options);
    if (plan) {
      for (const { startY, endY } of plan.regions) {
        prepared.push({
          ...asset,
          metadata: {
            ...asset.metadata,
            width: plan.width,
            height: endY - startY,
          },
        });
      }
    } else {
      prepared.push(original);
      const { width, height } = asset.metadata ?? {};
      if (
        !width ||
        !height ||
        height / width > effectiveConfig(config).aspectRatioThreshold
      )
        isEstimated = true;
    }
  }
  return { attachments: prepared, isEstimated };
}

export async function calculateTokensWithImageSlicing(
  calculator: TokenCalculator,
  text: string,
  modelId: string,
  attachments: readonly AttachmentLike[] | undefined,
  config: SlicingConfig | undefined,
  tokenOptions?: { maxImageDimension?: number },
  slicingOptions?: ImageSlicingOptions
) {
  const prepared = await prepareImageTokenAttachments(
    attachments,
    config,
    slicingOptions
  );
  const result = await calculator.calculateMessageTokens(
    text,
    modelId,
    prepared.attachments ? [...prepared.attachments] : undefined,
    tokenOptions
  );
  return { ...result, isEstimated: result.isEstimated || prepared.isEstimated };
}

/** Encode one slice at a time, and publish the complete group only on success. */
export async function processImageSlices<T>(
  asset: PipelineAttachment,
  buffer: ArrayBuffer,
  context: PipelineContext,
  process: (buffer: ArrayBuffer) => Promise<T[]>
): Promise<T[]> {
  const config = context.settings?.requestSettings?.longImageSlicing;
  if (!config?.enabled) return process(buffer);
  const options = getContextImageSlicingOptions(context);
  const plan = await getAttachmentSlicePlan(asset, config, {
    ...options,
    buffer,
  });
  if (!plan || plan.regions.length < 2) return process(buffer);
  let originalWidth = plan.width;
  let originalHeight = plan.height;
  try {
    const { img, cleanup } = await loadImageFromBuffer(buffer);
    const canvas = document.createElement("canvas");
    originalWidth = img.naturalWidth;
    originalHeight = img.naturalHeight;
    try {
      if (
        img.naturalWidth !== plan.width ||
        img.naturalHeight !== plan.height
      ) {
        throw new Error("图片内容已变化，请重新准备附件");
      }
      const parts: T[] = [];
      for (const { startY, endY } of plan.regions) {
        canvas.width = plan.width;
        canvas.height = endY - startY;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("无法获取切图上下文");
        ctx.drawImage(
          img,
          0,
          startY,
          plan.width,
          canvas.height,
          0,
          0,
          plan.width,
          canvas.height
        );
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error("切片编码失败")),
            "image/png"
          )
        );
        parts.push(...(await process(await blob.arrayBuffer())));
      }
      return parts;
    } finally {
      canvas.width = canvas.height = 0;
      cleanup();
    }
  } catch (error) {
    logger.warn("长图切分失败，整组回退到原图", { assetId: asset.id, error });
    const full = {
      ...plan,
      width: originalWidth,
      height: originalHeight,
      regions: [{ startY: 0, endY: originalHeight }],
      lines: [],
    };
    rememberPlan(
      asset,
      JSON.stringify(effectiveConfig(config)),
      Promise.resolve(full),
      options
    );
    return process(buffer);
  }
}
