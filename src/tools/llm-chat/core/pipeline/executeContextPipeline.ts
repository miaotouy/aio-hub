// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { PresetConfigurationError } from "@aiohub/agent-preset-core";
import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { ContextLogger } from "./ports";

export interface ContextPipelinePorts {
  logger: ContextLogger;
  reportProcessorError(
    error: unknown,
    processor: ContextProcessor
  ): Promise<unknown>;
}

/** Execute the selected, ordered processors using the current execution lifetime. */
export async function executeContextPipeline(
  context: PipelineContext,
  processors: ContextProcessor[],
  ports: ContextPipelinePorts
): Promise<PipelineContext> {
  const { logger } = ports;
  context.signal?.throwIfAborted();
  logger.info("开始执行上下文管道", {
    processorCount: processors.length,
    processors: processors.map((p) => p.id),
  });

  for (const processor of processors) {
    context.signal?.throwIfAborted();
    let trace: ((messages: PipelineContext["messages"]) => void) | undefined;
    try {
      trace = context.traceProcessor?.(processor.name, context.messages);
    } catch {
      /* diagnostic only */
    }
    try {
      logger.debug("执行处理器", { id: processor.id });
      await processor.execute(context);
    } catch (error) {
      // A cancelled owner cannot continue to another processor or dispatch a model.
      context.signal?.throwIfAborted();
      if (error instanceof Error && error.name === "AbortError") throw error;
      await ports.reportProcessorError(error, processor);
      if (error instanceof PresetConfigurationError) throw error;
    } finally {
      try {
        trace?.(context.messages);
      } catch {
        /* diagnostic only */
      }
    }
    context.signal?.throwIfAborted();
  }

  logger.info("上下文管道执行完毕");
  return context;
}
