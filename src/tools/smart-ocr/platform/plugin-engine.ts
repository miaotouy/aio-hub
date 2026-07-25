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

import { execute } from "@/services/executor";
import { pluginManager } from "@/services/plugin-manager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  PluginContribution,
  PluginOcrEngineContribution,
  PluginProxy,
} from "@/services/plugin-types";
import { ocrImageToPluginImage } from "./adapters/image-input";
import type { ImageBlock, OcrImageInput, OcrResult } from "./types";

const logger = createModuleLogger("OCR/PluginEngine");
const errorHandler = createModuleErrorHandler("OCR/PluginEngine");
const DEFAULT_PLUGIN_BATCH_SIZE = 8;
const MAX_PLUGIN_BATCH_SIZE = 32;
const DEFAULT_JOB_IDLE_TIMEOUT_MS = 300_000;
const JOB_CANCEL_GRACE_MS = 30_000;

const pluginJobTails = new Map<string, Promise<void>>();

async function runExclusivePluginJob<T>(
  pluginId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = pluginJobTails.get(pluginId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  pluginJobTails.set(pluginId, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (pluginJobTails.get(pluginId) === tail) {
      pluginJobTails.delete(pluginId);
    }
  }
}

interface PluginOcrConfig {
  pluginId: string;
  contributionId: string;
  modelProfile?: string;
  language?: string;
}

interface PluginOcrBatchResult {
  results?: Array<{
    id?: string;
    groupId?: string;
    blockId?: string;
    imageId?: string;
    text?: string;
    confidence?: number;
    boxes?: Array<{
      text?: string;
      confidence?: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    lines?: Array<{
      text: string;
      score: number;
      bbox: number[][];
    }>;
    status?: "success" | "error";
    error?: string;
  }>;
}

interface PluginExecutionTarget {
  pluginId: string;
  plugin: PluginProxy;
  method: string;
  batchSize: number;
  batchMode: "host" | "plugin";
  progressEvent?: string;
  executionMode: "request" | "job";
  completionEvent?: string;
  failureEvent?: string;
  cancelledEvent?: string;
  cancelMethod?: string;
  idleTimeoutMs: number;
}

interface PluginOcrProgressEvent {
  jobId?: string;
  streamId?: string;
  offset?: number;
  completed?: number;
  total?: number;
  results?: NonNullable<PluginOcrBatchResult["results"]>;
}

interface PluginOcrJobEvent extends PluginOcrProgressEvent {
  error?: string;
}

interface PluginOcrJobAck {
  accepted?: boolean;
  jobId?: string;
}

function isOcrEngineContribution(
  contribution: PluginContribution
): contribution is PluginOcrEngineContribution {
  return (
    contribution.type === "ocr-engine" &&
    typeof (contribution as PluginOcrEngineContribution).method === "string"
  );
}

function getContributionId(
  contribution: PluginOcrEngineContribution,
  index: number
) {
  return contribution.id || contribution.method || `ocr-engine-${index + 1}`;
}

function resolveOcrContribution(
  plugin: PluginProxy,
  contributionId: string
): PluginOcrEngineContribution | undefined {
  const contributions = (plugin.manifest.contributions ?? []).filter(
    isOcrEngineContribution
  );

  return contributions.find(
    (item, index) => getContributionId(item, index) === contributionId
  );
}

function resolvePluginBatchSize(
  contribution?: PluginOcrEngineContribution
): number {
  const declaredSize = contribution?.capabilities?.maxBatchSize;

  if (!Number.isFinite(declaredSize) || Number(declaredSize) <= 0) {
    return DEFAULT_PLUGIN_BATCH_SIZE;
  }

  return Math.min(
    MAX_PLUGIN_BATCH_SIZE,
    Math.max(1, Math.floor(Number(declaredSize)))
  );
}

function assertPluginReady(
  pluginId: string,
  contributionId: string
): PluginExecutionTarget {
  if (!pluginId || !contributionId) {
    throw new Error("未选择可用的 OCR 插件引擎，请先安装并选择 OCR 扩展插件");
  }

  const plugin = pluginManager.getActivePlugin(pluginId);

  if (!plugin) {
    throw new Error(
      `未安装 OCR 插件 "${pluginId}"，请先在插件管理中导入并启用 OCR 扩展插件`
    );
  }

  const state = pluginManager.pluginStates[plugin.id];
  if (state?.isBroken) {
    throw new Error(`OCR 插件 "${plugin.name}" 已损坏，请重新安装插件`);
  }

  if (!(state?.enabled ?? plugin.enabled)) {
    throw new Error(`OCR 插件 "${plugin.name}" 未启用，请先在插件管理中启用`);
  }

  const contribution = resolveOcrContribution(plugin, contributionId);
  if (!contribution) {
    throw new Error(
      `OCR 插件 "${plugin.name}" 不存在贡献点: ${contributionId}，请重新选择引擎`
    );
  }

  const methods =
    plugin.getMetadata?.().methods ?? plugin.manifest.methods ?? [];
  const hasMethod = methods.some((item) => item.name === contribution.method);

  if (!hasMethod) {
    throw new Error(
      `OCR 插件 "${plugin.name}" 的贡献点 ${contributionId} 引用了不存在的方法: ${contribution.method}`
    );
  }

  return {
    pluginId: plugin.id,
    plugin,
    method: contribution.method,
    batchSize: resolvePluginBatchSize(contribution),
    batchMode:
      contribution?.capabilities?.batchMode === "plugin" ? "plugin" : "host",
    progressEvent:
      contribution?.capabilities?.streamingResults === true
        ? contribution.capabilities.progressEvent
        : undefined,
    executionMode:
      contribution.capabilities?.executionMode === "job" ? "job" : "request",
    completionEvent: contribution.capabilities?.completionEvent,
    failureEvent: contribution.capabilities?.failureEvent,
    cancelledEvent: contribution.capabilities?.cancelledEvent,
    cancelMethod: contribution.capabilities?.cancelMethod,
    idleTimeoutMs:
      Number(contribution.capabilities?.idleTimeoutMs) > 0
        ? Number(contribution.capabilities?.idleTimeoutMs)
        : DEFAULT_JOB_IDLE_TIMEOUT_MS,
  };
}

function blockToOcrImage(block: ImageBlock): OcrImageInput {
  return {
    id: block.id,
    groupId: block.imageId,
    path: block.path,
    dataUrl: block.path ? undefined : block.dataUrl,
    width: block.width,
    height: block.height,
    metadata: {
      startY: block.startY,
      endY: block.endY,
    },
  };
}

function createPendingResults(images: OcrImageInput[]): OcrResult[] {
  return images.map((image) => ({
    blockId: image.id,
    imageId: image.groupId ?? image.id,
    text: "",
    status: "pending" as const,
  }));
}

function getPluginResultKey(
  result: NonNullable<PluginOcrBatchResult["results"]>[number]
) {
  const imageId = result.groupId ?? result.imageId ?? result.id;
  const blockId = result.id ?? result.blockId ?? result.imageId;
  return `${imageId}:${blockId}`;
}

function getImageKey(image: OcrImageInput) {
  return `${image.groupId ?? image.id}:${image.id}`;
}

function mapPluginResults(
  images: OcrImageInput[],
  pluginResults: NonNullable<PluginOcrBatchResult["results"]>
): OcrResult[] {
  const resultByKey = new Map(
    pluginResults.map((result) => [getPluginResultKey(result), result])
  );

  return images.map((image) => {
    const pluginResult = resultByKey.get(getImageKey(image));

    if (!pluginResult) {
      return {
        blockId: image.id,
        imageId: image.groupId ?? image.id,
        text: "",
        status: "error" as const,
        error: "OCR 插件未返回该图片块的识别结果",
      };
    }

    if (pluginResult.status === "error") {
      return {
        blockId: image.id,
        imageId: image.groupId ?? image.id,
        text: pluginResult.text?.trim() ?? "",
        confidence: pluginResult.confidence,
        boxes: pluginResult.boxes,
        lines: pluginResult.lines,
        status: "error" as const,
        error: pluginResult.error || "OCR 插件识别失败",
      };
    }

    return {
      blockId: image.id,
      imageId: image.groupId ?? image.id,
      text: pluginResult.text?.trim() ?? "",
      confidence: pluginResult.confidence,
      boxes: pluginResult.boxes,
      lines: pluginResult.lines,
      status: "success" as const,
    };
  });
}

function mergePluginResults(
  currentResults: OcrResult[],
  images: OcrImageInput[],
  pluginResults: NonNullable<PluginOcrBatchResult["results"]>
): OcrResult[] {
  const resultByKey = new Map(
    pluginResults.map((result) => [getPluginResultKey(result), result])
  );
  const nextResults = [...currentResults];

  images.forEach((image, index) => {
    const pluginResult = resultByKey.get(getImageKey(image));
    if (!pluginResult) return;
    nextResults[index] = mapPluginResults([image], [pluginResult])[0];
  });

  return nextResults;
}

function createOcrStreamId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isPluginOcrProgressEvent(
  data: unknown
): data is PluginOcrProgressEvent & {
  results: NonNullable<PluginOcrBatchResult["results"]>;
} {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as PluginOcrProgressEvent).results)
  );
}

function replaceUnfinishedResults(
  results: OcrResult[],
  status: "cancelled" | "error",
  error?: string
): OcrResult[] {
  return results.map((result) => {
    if (result.status === "success" || result.status === "error") {
      return result;
    }

    return {
      ...result,
      status,
      error: status === "error" ? error : undefined,
    };
  });
}

export function usePluginOcrEngine() {
  const recognizeImages = async (
    images: OcrImageInput[],
    config: PluginOcrConfig,
    onProgress?: (results: OcrResult[]) => void,
    signal?: AbortSignal
  ): Promise<OcrResult[]> => {
    const results = createPendingResults(images);
    let currentResults = results;
    const unsubscribeEvents: Array<() => void> = [];

    onProgress?.(results);

    try {
      const target = assertPluginReady(config.pluginId, config.contributionId);

      logger.info(`使用插件 OCR 引擎识别 (${images.length} 块)`, {
        pluginId: target.pluginId,
        method: target.method,
        blocksCount: images.length,
        batchSize: target.batchSize,
        batchMode: target.batchMode,
      });

      const processingResults = results.map((result) => ({
        ...result,
        status: "processing" as const,
      }));
      currentResults = processingResults;
      onProgress?.(processingResults);

      if (signal?.aborted) {
        const cancelledResults = replaceUnfinishedResults(
          processingResults,
          "cancelled"
        );
        onProgress?.(cancelledResults);
        return cancelledResults;
      }

      if (target.executionMode === "job") {
        return await runExclusivePluginJob(target.pluginId, async () => {
          if (signal?.aborted) {
            currentResults = replaceUnfinishedResults(
              currentResults,
              "cancelled"
            );
            onProgress?.([...currentResults]);
            return currentResults;
          }

          const {
            progressEvent,
            completionEvent,
            failureEvent,
            cancelledEvent,
            cancelMethod,
          } = target;
          if (
            !target.plugin.onSidecarEvent ||
            !progressEvent ||
            !completionEvent ||
            !failureEvent ||
            !cancelledEvent ||
            !cancelMethod
          ) {
            throw new Error(
              `OCR 插件 "${target.plugin.name}" 的 API v3 作业能力声明不完整`
            );
          }

          const jobId = createOcrStreamId();
          let settled = false;
          let submitted = false;
          let abortRequested = false;
          let cancellationReason: "user" | "idle-timeout" | null = null;
          let idleTimer: ReturnType<typeof setTimeout> | undefined;
          let cancellationGraceTimer: ReturnType<typeof setTimeout> | undefined;
          let resolveJob!: (results: OcrResult[]) => void;
          let rejectJob!: (error: Error) => void;
          const jobCompletion = new Promise<OcrResult[]>((resolve, reject) => {
            resolveJob = resolve;
            rejectJob = reject;
          });
          // 作业终态可能早于提交确认到达，先挂载拒绝处理器避免短暂的未处理拒绝。
          void jobCompletion.catch(() => undefined);

          const clearJobTimers = () => {
            if (idleTimer) clearTimeout(idleTimer);
            if (cancellationGraceTimer) clearTimeout(cancellationGraceTimer);
          };
          unsubscribeEvents.push(clearJobTimers);
          const finishJob = (
            result: { results: OcrResult[] } | { error: Error }
          ) => {
            if (settled) return;
            settled = true;
            clearJobTimers();
            if ("error" in result) rejectJob(result.error);
            else resolveJob(result.results);
          };

          const requestCancellation = (reason: "user" | "idle-timeout") => {
            if (settled || cancellationReason) return;
            if (!submitted) {
              abortRequested = true;
              return;
            }
            cancellationReason = reason;
            if (idleTimer) clearTimeout(idleTimer);

            void Promise.resolve(
              execute<{ cancelled?: boolean }>({
                service: target.pluginId,
                method: cancelMethod,
                params: { jobId },
              })
            ).then((response) => {
              if (!response.success || response.data?.cancelled !== true) {
                logger.warn("OCR 插件未确认作业取消请求", {
                  pluginId: target.pluginId,
                  jobId,
                  error: response.success ? undefined : response.error,
                });
              }
            });

            cancellationGraceTimer = setTimeout(() => {
              if (reason === "user") {
                currentResults = replaceUnfinishedResults(
                  currentResults,
                  "cancelled"
                );
                finishJob({ results: currentResults });
              } else {
                finishJob({
                  error: new Error(
                    `OCR 插件连续 ${target.idleTimeoutMs}ms 未报告进度，且未在取消宽限期内返回终态`
                  ),
                });
              }
            }, JOB_CANCEL_GRACE_MS);
          };

          const resetIdleTimeout = () => {
            if (settled || cancellationReason) return;
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(
              () => requestCancellation("idle-timeout"),
              target.idleTimeoutMs
            );
          };

          const subscribe = (
            eventName: string,
            callback: (event: PluginOcrJobEvent) => void
          ) => {
            unsubscribeEvents.push(
              target.plugin.onSidecarEvent!(eventName, (data) => {
                if (
                  settled ||
                  typeof data !== "object" ||
                  data === null ||
                  (data as PluginOcrJobEvent).jobId !== jobId
                ) {
                  return;
                }
                callback(data as PluginOcrJobEvent);
              })
            );
          };

          subscribe(progressEvent, (event) => {
            if (!Array.isArray(event.results)) return;
            currentResults = mergePluginResults(
              currentResults,
              images,
              event.results
            );
            onProgress?.([...currentResults]);
            resetIdleTimeout();
          });
          subscribe(completionEvent, (event) => {
            if (!Array.isArray(event.results)) {
              finishJob({
                error: new Error("OCR 作业完成事件缺少 results 数组"),
              });
              return;
            }
            currentResults = mapPluginResults(images, event.results);
            onProgress?.([...currentResults]);
            finishJob({ results: currentResults });
          });
          subscribe(failureEvent, (event) => {
            finishJob({ error: new Error(event.error || "OCR 插件作业失败") });
          });
          subscribe(cancelledEvent, (event) => {
            if (Array.isArray(event.results)) {
              currentResults = mergePluginResults(
                currentResults,
                images,
                event.results
              );
            }
            if (cancellationReason === "idle-timeout") {
              finishJob({
                error: new Error(
                  `OCR 插件连续 ${target.idleTimeoutMs}ms 未报告进度，作业已取消`
                ),
              });
              return;
            }
            currentResults = replaceUnfinishedResults(
              currentResults,
              "cancelled"
            );
            onProgress?.([...currentResults]);
            finishJob({ results: currentResults });
          });

          if (signal) {
            const abortHandler = () => {
              abortRequested = true;
              requestCancellation("user");
            };
            signal.addEventListener("abort", abortHandler, { once: true });
            unsubscribeEvents.push(() =>
              signal.removeEventListener("abort", abortHandler)
            );
          }

          const submission = await execute<PluginOcrJobAck>({
            service: target.pluginId,
            method: target.method,
            params: {
              jobId,
              images: images.map(ocrImageToPluginImage),
              options: {
                modelProfile: config.modelProfile,
                language: config.language,
              },
            },
          });
          if (
            !submission.success ||
            submission.data?.accepted !== true ||
            submission.data.jobId !== jobId
          ) {
            throw submission.success
              ? new Error("OCR 插件未确认作业提交")
              : submission.error;
          }

          submitted = true;
          resetIdleTimeout();
          if (abortRequested || signal?.aborted) requestCancellation("user");
          return await jobCompletion;
        });
      }

      if (target.batchMode === "plugin") {
        const streamId = createOcrStreamId();
        if (target.progressEvent && target.plugin.onSidecarEvent) {
          unsubscribeEvents.push(
            target.plugin.onSidecarEvent(target.progressEvent, (data) => {
              if (
                signal?.aborted ||
                !isPluginOcrProgressEvent(data) ||
                data.streamId !== streamId
              ) {
                return;
              }

              currentResults = mergePluginResults(
                currentResults,
                images,
                data.results
              );
              onProgress?.([...currentResults]);
            })
          );
        }

        const response = await execute<PluginOcrBatchResult>({
          service: target.pluginId,
          method: target.method,
          params: {
            streamId,
            images: images.map(ocrImageToPluginImage),
            options: {
              modelProfile: config.modelProfile,
              language: config.language,
            },
          },
        });

        if (!response.success) {
          throw response.error;
        }

        if (signal?.aborted) {
          currentResults = replaceUnfinishedResults(
            currentResults,
            "cancelled"
          );
          onProgress?.([...currentResults]);
          return currentResults;
        }

        const pluginResults = response.data?.results;
        if (!Array.isArray(pluginResults)) {
          throw new Error("OCR 插件返回结果格式错误：缺少 results 数组");
        }

        currentResults = mapPluginResults(images, pluginResults);
        onProgress?.([...currentResults]);
        return currentResults;
      }

      for (let offset = 0; offset < images.length; offset += target.batchSize) {
        if (signal?.aborted) {
          currentResults = replaceUnfinishedResults(
            currentResults,
            "cancelled"
          );
          onProgress?.([...currentResults]);
          return currentResults;
        }

        const batchImages = images.slice(offset, offset + target.batchSize);
        const response = await execute<PluginOcrBatchResult>({
          service: target.pluginId,
          method: target.method,
          params: {
            images: batchImages.map(ocrImageToPluginImage),
            options: {
              modelProfile: config.modelProfile,
              language: config.language,
            },
          },
        });

        if (!response.success) {
          throw response.error;
        }

        if (signal?.aborted) {
          currentResults = replaceUnfinishedResults(
            currentResults,
            "cancelled"
          );
          onProgress?.([...currentResults]);
          return currentResults;
        }

        const pluginResults = response.data?.results;
        if (!Array.isArray(pluginResults)) {
          throw new Error("OCR 插件返回结果格式错误：缺少 results 数组");
        }

        const batchResults = mapPluginResults(batchImages, pluginResults);
        currentResults = [...currentResults];
        batchResults.forEach((result, index) => {
          currentResults[offset + index] = result;
        });
        onProgress?.([...currentResults]);
      }

      return currentResults;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "插件 OCR 识别失败",
        context: {
          pluginId: config.pluginId,
          contributionId: config.contributionId,
          blocksCount: images.length,
        },
        showToUser: false,
      });

      const errorResults = replaceUnfinishedResults(
        currentResults,
        "error",
        error instanceof Error ? error.message : String(error)
      );
      onProgress?.(errorResults);
      return errorResults;
    } finally {
      unsubscribeEvents.forEach((unsubscribe) => unsubscribe());
    }
  };

  const recognizeBatch = async (
    blocks: ImageBlock[],
    config: PluginOcrConfig,
    onProgress?: (results: OcrResult[]) => void,
    signal?: AbortSignal
  ): Promise<OcrResult[]> => {
    return recognizeImages(
      blocks.map(blockToOcrImage),
      config,
      onProgress,
      signal
    );
  };

  return {
    recognizeBatch,
    recognizeImages,
  };
}
