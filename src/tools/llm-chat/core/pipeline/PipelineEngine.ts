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

import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/PipelineEngine");
const errorHandler = createModuleErrorHandler("llm-chat/PipelineEngine");

/**
 * 消息构建管道执行引擎
 *
 * 负责按顺序执行处理器列表，处理日志和错误。
 * 纯 TypeScript 实现，不依赖 Pinia 或 Vue 运行时。
 */
export class PipelineEngine {
  /**
   * 执行管道
   *
   * @param context 管道上下文
   * @param processors 要执行的处理器列表（应已排序且过滤启用状态）
   * @returns 处理后的上下文
   */
  static async execute(
    context: PipelineContext,
    processors: ContextProcessor[]
  ): Promise<PipelineContext> {
    logger.info("开始执行上下文管道", {
      processorCount: processors.length,
      processors: processors.map((p) => p.id),
    });

    for (const processor of processors) {
      await errorHandler.wrapAsync(
        async () => {
          logger.debug("执行处理器", { id: processor.id });
          await processor.execute(context);
        },
        {
          userMessage: `处理步骤 [${processor.name}] 失败`,
          context: { processorId: processor.id },
        }
      );
    }

    logger.info("上下文管道执行完毕");
    return context;
  }
}
