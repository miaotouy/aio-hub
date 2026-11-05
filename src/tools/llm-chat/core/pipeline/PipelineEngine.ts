// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { executeContextPipeline } from "./executeContextPipeline";

const logger = createModuleLogger("llm-chat/PipelineEngine");
const errorHandler = createModuleErrorHandler("llm-chat/PipelineEngine");

/** Renderer diagnostics adapter for the shared context pipeline. */
export class PipelineEngine {
  static execute(
    context: PipelineContext,
    processors: ContextProcessor[]
  ): Promise<PipelineContext> {
    return executeContextPipeline(context, processors, {
      logger,
      reportProcessorError: (error, processor) =>
        errorHandler.wrapAsync(
          async () => {
            throw error;
          },
          {
            userMessage: `处理步骤 [${processor.name}] 失败`,
            context: { processorId: processor.id },
          }
        ),
    });
  }
}
