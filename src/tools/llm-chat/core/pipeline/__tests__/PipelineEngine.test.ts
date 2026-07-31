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

const mocks = vi.hoisted(() => ({
  handleError: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: (module: string) => ({
    wrapAsync: async <T>(
      fn: () => Promise<T>,
      options: Record<string, unknown>
    ): Promise<T | null> => {
      try {
        return await fn();
      } catch (error) {
        mocks.handleError(error, { ...options, module });
        return null;
      }
    },
  }),
}));

import { PipelineEngine } from "../PipelineEngine";
import type {
  PipelineContext,
  ContextProcessor,
} from "../../../types/pipeline";

describe("PipelineEngine (Independent Mode)", () => {
  const createMockContext = (): PipelineContext => ({
    messages: [],
    index: {
      id: "test",
      name: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any,
    detail: { id: "test" } as any,
    sharedData: new Map(),
    logs: [],
    agentConfig: {
      id: "test",
      name: "test",
      createdAt: new Date().toISOString(),
      modelId: "test",
      profileId: "test",
    },
    settings: {
      theme: "system",
      fontSize: 14,
      showTokenCount: true,
    } as any,
    timestamp: Date.now(),
  });

  it("should execute processors in order without Pinia/Vue", async () => {
    const executionOrder: string[] = [];

    const processorA: ContextProcessor = {
      id: "processor-a",
      name: "Processor A",
      description: "Test A",
      priority: 10,
      execute: async (ctx) => {
        executionOrder.push("A");
        ctx.sharedData.set("a", true);
      },
    };

    const processorB: ContextProcessor = {
      id: "processor-b",
      name: "Processor B",
      description: "Test B",
      priority: 20,
      execute: async (ctx) => {
        executionOrder.push("B");
        ctx.sharedData.set("b", ctx.sharedData.get("a"));
      },
    };

    const context = createMockContext();

    await PipelineEngine.execute(context, [processorA, processorB]);

    expect(executionOrder).toEqual(["A", "B"]);
    expect(context.sharedData.get("b")).toBe(true);
  });

  beforeEach(() => {
    mocks.handleError.mockReset();
  });

  it("reports a failed processor and continues with the remaining processors", async () => {
    const executionOrder: string[] = [];
    const failure = new Error("processor failed");
    const failingProcessor: ContextProcessor = {
      id: "failing-processor",
      name: "Failing Processor",
      description: "Fails for the test",
      priority: 10,
      execute: async () => {
        executionOrder.push("failing");
        throw failure;
      },
    };
    const followingProcessor: ContextProcessor = {
      id: "following-processor",
      name: "Following Processor",
      description: "Runs after a failure",
      priority: 20,
      execute: async (context) => {
        executionOrder.push("following");
        context.sharedData.set("continued", true);
      },
    };
    const context = createMockContext();

    const result = await PipelineEngine.execute(context, [
      failingProcessor,
      followingProcessor,
    ]);

    expect(result).toBe(context);
    expect(executionOrder).toEqual(["failing", "following"]);
    expect(context.sharedData.get("continued")).toBe(true);
    expect(mocks.handleError).toHaveBeenCalledWith(failure, {
      module: "llm-chat/PipelineEngine",
      userMessage: "处理步骤 [Failing Processor] 失败",
      context: { processorId: "failing-processor" },
    });
  });
});
