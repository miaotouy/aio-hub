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

import { describe, it, expect } from "vitest";
import { PipelineEngine } from "../PipelineEngine";
import { getInitialProcessors } from "../defaultProcessors";
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

  it("should handle default processors and skip Pinia-dependent ones gracefully", async () => {
    // 获取默认处理器
    const processors = getInitialProcessors();

    const context = createMockContext();
    // 模拟消息格式化处理器需要的 ProcessableMessage 结构
    context.messages = [
      {
        role: "user",
        content: "Hello",
        id: "msg-1",
        timestamp: Date.now(),
      } as any,
    ];

    // 在没有 Pinia 的环境下执行
    // 这会触发 async-task-processor 和 transcription-processor 的降级逻辑
    const result = await PipelineEngine.execute(context, processors);

    expect(result).toBeDefined();
    // 验证消息列表仍然存在（即使被格式化了）
    expect(result.messages).toBeDefined();
    // 验证日志中记录了处理过程（如果有的话）
    console.log(
      "Pipeline Logs:",
      result.logs.map((l) => l.message)
    );
  });
});
