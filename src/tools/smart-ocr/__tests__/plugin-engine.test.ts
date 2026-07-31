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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageBlock, OcrResult } from "../types";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getActivePlugin: vi.fn(),
  handleError: vi.fn(),
  pluginStates: {
    "test-ocr": { enabled: true, isBroken: false },
  },
}));

vi.mock("@/services/executor", () => ({ execute: mocks.execute }));
vi.mock("@/services/plugin-manager", () => ({
  pluginManager: {
    getActivePlugin: mocks.getActivePlugin,
    pluginStates: mocks.pluginStates,
  },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: mocks.handleError }),
}));

import { usePluginOcrEngine } from "../platform/plugin-engine";

const eventListeners = new Map<string, (data: unknown) => void>();

function createBlocks(count: number): ImageBlock[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `block-${index}`,
    imageId: "image-1",
    canvas: {} as HTMLCanvasElement,
    dataUrl: `data:image/png;base64,${index}`,
    startY: index * 100,
    endY: (index + 1) * 100,
    width: 100,
    height: 100,
  }));
}

function installPlugin(
  maxBatchSize: number,
  batchMode: "host" | "plugin" = "host",
  executionMode: "request" | "job" = "request"
) {
  const method = executionMode === "job" ? "submitOcrJob" : "recognizeBatch";
  const plugin = {
    id: "test-ocr",
    name: "Test OCR",
    enabled: true,
    manifest: {
      name: "Test OCR",
      methods: [{ name: method }, { name: "cancelOcrJob" }],
      contributions: [
        {
          type: "ocr-engine",
          id: "primary",
          method,
          capabilities: {
            maxBatchSize,
            batchMode,
            streamingResults: batchMode === "plugin",
            progressEvent:
              executionMode === "job"
                ? "ocrJobProgress"
                : batchMode === "plugin"
                  ? "ocrBatchProgress"
                  : undefined,
            executionMode,
            completionEvent:
              executionMode === "job" ? "ocrJobCompleted" : undefined,
            failureEvent: executionMode === "job" ? "ocrJobFailed" : undefined,
            cancelledEvent:
              executionMode === "job" ? "ocrJobCancelled" : undefined,
            cancelMethod: executionMode === "job" ? "cancelOcrJob" : undefined,
            idleTimeoutMs: executionMode === "job" ? 10_000 : undefined,
          },
        },
      ],
    },
    getMetadata: () => ({
      methods: [{ name: method }, { name: "cancelOcrJob" }],
    }),
    onSidecarEvent: (eventName: string, callback: (data: unknown) => void) => {
      eventListeners.set(eventName, callback);
      return () => eventListeners.delete(eventName);
    },
    restartSidecar: vi.fn().mockResolvedValue(undefined),
  };
  mocks.getActivePlugin.mockReturnValue(plugin);
  return plugin;
}

function successResponse(call: {
  params: { images: Array<Record<string, string>> };
}) {
  return {
    success: true as const,
    data: {
      results: call.params.images.map((image) => ({
        blockId: image.blockId,
        imageId: image.imageId,
        text: `text-${image.blockId}`,
        status: "success" as const,
      })),
    },
  };
}

describe("plugin OCR batch scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventListeners.clear();
    mocks.pluginStates["test-ocr"] = { enabled: true, isBroken: false };
    installPlugin(4);
    mocks.execute.mockImplementation(successResponse);
  });

  it("splits requests by the plugin maxBatchSize and reports each completed batch", async () => {
    const progress: OcrResult[][] = [];
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(
      createBlocks(10),
      {
        pluginId: "test-ocr",
        contributionId: "primary",
      },
      (updated) => progress.push(updated)
    );

    expect(
      mocks.execute.mock.calls.map(([call]) => call.params.images.length)
    ).toEqual([4, 4, 2]);
    expect(
      progress.map(
        (items) => items.filter((item) => item.status === "success").length
      )
    ).toEqual([0, 0, 4, 8, 10]);
    expect(results).toHaveLength(10);
    expect(results.every((result) => result.status === "success")).toBe(true);
  });

  it("keeps completed batches when a later plugin call fails", async () => {
    mocks.execute
      .mockImplementationOnce(successResponse)
      .mockResolvedValueOnce({
        success: false,
        error: new Error("batch failed"),
      });
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(createBlocks(10), {
      pluginId: "test-ocr",
      contributionId: "primary",
    });

    expect(
      results.slice(0, 4).every((result) => result.status === "success")
    ).toBe(true);
    expect(results.slice(4).every((result) => result.status === "error")).toBe(
      true
    );
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("keeps the final batch cancelled when aborting during its plugin call", async () => {
    const controller = new AbortController();
    mocks.execute.mockImplementation((call) => {
      controller.abort();
      return successResponse(call);
    });
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(
      createBlocks(4),
      { pluginId: "test-ocr", contributionId: "primary" },
      undefined,
      controller.signal
    );

    expect(results.every((result) => result.status === "cancelled")).toBe(true);
  });

  it("sends one full request to plugin-managed engines and merges streamed batches", async () => {
    installPlugin(4, "plugin");
    mocks.execute.mockImplementation((call) => {
      eventListeners.get("ocrBatchProgress")?.({
        streamId: call.params.streamId,
        completed: 4,
        total: call.params.images.length,
        results: successResponse({
          params: { images: call.params.images.slice(0, 4) },
        }).data.results,
      });
      return successResponse(call);
    });
    const progress: OcrResult[][] = [];
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(
      createBlocks(10),
      {
        pluginId: "test-ocr",
        contributionId: "primary",
      },
      (updated) => progress.push(updated)
    );

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].params.images).toHaveLength(10);
    expect(mocks.execute.mock.calls[0][0].params.streamId).toEqual(
      expect.any(String)
    );
    expect(
      progress.map(
        (items) => items.filter((item) => item.status === "success").length
      )
    ).toEqual([0, 0, 4, 10]);
    expect(results.every((result) => result.status === "success")).toBe(true);
  });

  it("resolves batch capabilities by contributionId when methods are shared", async () => {
    const plugin = installPlugin(1) as any;
    plugin.manifest.contributions.push({
      type: "ocr-engine",
      id: "managed",
      method: "recognizeBatch",
      capabilities: { batchMode: "plugin", maxBatchSize: 4 },
    });
    mocks.execute.mockImplementation(successResponse);
    const { recognizeBatch } = usePluginOcrEngine();

    await recognizeBatch(createBlocks(5), {
      pluginId: "test-ocr",
      contributionId: "managed",
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].params.images).toHaveLength(5);
  });

  it("rejects a missing explicit contribution instead of falling back by method", async () => {
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(createBlocks(2), {
      pluginId: "test-ocr",
      contributionId: "removed-contribution",
    });

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(results.every((result) => result.status === "error")).toBe(true);
    expect(results[0].error).toContain("removed-contribution");
  });

  it("preserves the structured failure reason for unavailable plugins", async () => {
    const plugin = installPlugin(4) as any;
    plugin.diagnostics = [
      {
        code: "PLUGIN_SIDECAR_PLATFORM_BINARY_UNDECLARED",
        severity: "error",
        title: "当前平台没有 Sidecar 产物声明",
        message: "manifest.sidecar.executable 未声明 win32-x64",
        resolution: "构建并部署 win32-x64 产物",
      },
    ];
    mocks.pluginStates["test-ocr"] = { enabled: false, isBroken: true };

    const { recognizeBatch } = usePluginOcrEngine();
    const results = await recognizeBatch(createBlocks(1), {
      pluginId: "test-ocr",
      contributionId: "primary",
    });

    expect(results[0].error).toContain("manifest.sidecar.executable");
    expect(results[0].error).toContain("构建并部署 win32-x64 产物");
    expect(results[0].error).not.toContain("请重新安装插件");
  });

  it("waits for API v3 job events after the submit acknowledgement", async () => {
    installPlugin(4, "plugin", "job");
    mocks.execute.mockImplementation((call) => {
      const jobId = call.params.jobId;
      const images = call.params.images;
      queueMicrotask(() => {
        eventListeners.get("ocrJobProgress")?.({
          jobId,
          results: successResponse({ params: { images: images.slice(0, 4) } })
            .data.results,
        });
        eventListeners.get("ocrJobCompleted")?.({
          jobId,
          results: successResponse({ params: { images } }).data.results,
        });
      });
      return {
        success: true,
        data: { accepted: true, jobId },
      };
    });
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(createBlocks(6), {
      pluginId: "test-ocr",
      contributionId: "primary",
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].method).toBe("submitOcrJob");
    expect(results.every((result) => result.status === "success")).toBe(true);
  });

  it("sends cancelOcrJob and waits for the cancelled terminal event", async () => {
    const controller = new AbortController();
    installPlugin(4, "plugin", "job");
    mocks.execute.mockImplementation((call) => {
      if (call.method === "submitOcrJob") {
        const jobId = call.params.jobId;
        queueMicrotask(() => controller.abort());
        return {
          success: true,
          data: { accepted: true, jobId },
        };
      }

      queueMicrotask(() => {
        eventListeners.get("ocrJobCancelled")?.({
          jobId: call.params.jobId,
          results: [],
        });
      });
      return { success: true, data: { cancelled: true } };
    });
    const { recognizeBatch } = usePluginOcrEngine();

    const results = await recognizeBatch(
      createBlocks(3),
      { pluginId: "test-ocr", contributionId: "primary" },
      undefined,
      controller.signal
    );

    expect(mocks.execute.mock.calls.map(([call]) => call.method)).toEqual([
      "submitOcrJob",
      "cancelOcrJob",
    ]);
    expect(results.every((result) => result.status === "cancelled")).toBe(true);
  });

  it("submits the job before forwarding an abort raised during subscription", async () => {
    const controller = new AbortController();
    const plugin = installPlugin(4, "plugin", "job");
    const originalSubscribe = plugin.onSidecarEvent;
    let subscriptionCount = 0;
    plugin.onSidecarEvent = (
      eventName: string,
      callback: (data: unknown) => void
    ) => {
      const unsubscribe = originalSubscribe(eventName, callback);
      subscriptionCount += 1;
      if (subscriptionCount === 1) controller.abort();
      return unsubscribe;
    };
    mocks.execute.mockImplementation((call) => {
      if (call.method === "submitOcrJob") {
        return {
          success: true,
          data: { accepted: true, jobId: call.params.jobId },
        };
      }
      queueMicrotask(() => {
        eventListeners.get("ocrJobCancelled")?.({
          jobId: call.params.jobId,
          results: [],
        });
      });
      return { success: true, data: { cancelled: true } };
    });

    const { recognizeBatch } = usePluginOcrEngine();
    const results = await recognizeBatch(
      createBlocks(2),
      { pluginId: "test-ocr", contributionId: "primary" },
      undefined,
      controller.signal
    );

    expect(mocks.execute.mock.calls.map(([call]) => call.method)).toEqual([
      "submitOcrJob",
      "cancelOcrJob",
    ]);
    expect(results.every((result) => result.status === "cancelled")).toBe(true);
  });

  it("does not submit a second job while the same plugin is still busy", async () => {
    const secondController = new AbortController();
    installPlugin(4, "plugin", "job");
    mocks.execute.mockImplementation((call) => ({
      success: true,
      data: { accepted: true, jobId: call.params.jobId },
    }));
    const { recognizeBatch } = usePluginOcrEngine();

    const first = recognizeBatch(createBlocks(2), {
      pluginId: "test-ocr",
      contributionId: "primary",
    });
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    const firstCall = mocks.execute.mock.calls[0][0];
    const second = recognizeBatch(
      createBlocks(1),
      { pluginId: "test-ocr", contributionId: "primary" },
      undefined,
      secondController.signal
    );
    secondController.abort();

    await Promise.resolve();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    eventListeners.get("ocrJobCompleted")?.({
      jobId: firstCall.params.jobId,
      results: successResponse(firstCall).data.results,
    });

    await expect(first).resolves.toHaveLength(2);
    await expect(second).resolves.toEqual([
      expect.objectContaining({ status: "cancelled" }),
    ]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("settles an idle job after cancellation grace without restarting the sidecar", async () => {
    vi.useFakeTimers();
    try {
      const plugin = installPlugin(4, "plugin", "job");
      mocks.execute.mockImplementation((call) => {
        if (call.method === "submitOcrJob") {
          return {
            success: true,
            data: { accepted: true, jobId: call.params.jobId },
          };
        }
        return { success: true, data: { cancelled: true } };
      });
      const { recognizeBatch } = usePluginOcrEngine();
      const resultPromise = recognizeBatch(createBlocks(1), {
        pluginId: "test-ocr",
        contributionId: "primary",
      });

      await vi.advanceTimersByTimeAsync(10_000);
      expect(mocks.execute.mock.calls.map(([call]) => call.method)).toEqual([
        "submitOcrJob",
        "cancelOcrJob",
      ]);
      await vi.advanceTimersByTimeAsync(30_000);

      await expect(resultPromise).resolves.toEqual([
        expect.objectContaining({
          status: "error",
          error: expect.stringContaining("未在取消宽限期内返回终态"),
        }),
      ]);
      expect(plugin.restartSidecar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
