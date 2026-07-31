import type {
  ContextProcessor,
  PipelineContext,
  ProcessorExecutionResult,
} from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/PipelineEngine");
const errorHandler = createModuleErrorHandler("llm-chat/PipelineEngine");

const RESULT_STATUSES = new Set<ProcessorExecutionResult["status"]>([
  "applied",
  "skipped",
  "degraded",
  "failed",
]);

function isProcessorExecutionResult(
  value: unknown
): value is ProcessorExecutionResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProcessorExecutionResult>;
  return (
    typeof candidate.status === "string" &&
    RESULT_STATUSES.has(candidate.status as ProcessorExecutionResult["status"]) &&
    typeof candidate.message === "string" &&
    (candidate.status !== "failed" || "error" in candidate)
  );
}

function resultLevel(
  status: ProcessorExecutionResult["status"]
): "info" | "warn" | "error" {
  if (status === "degraded") return "warn";
  if (status === "failed") return "error";
  return "info";
}

function recordResult(
  context: PipelineContext,
  processor: ContextProcessor,
  result: ProcessorExecutionResult
): void {
  context.logs.push({
    processorId: processor.id,
    level: resultLevel(result.status),
    status: result.status,
    message: result.message,
    details: result.details,
  });
}

function abortForProcessorError(
  context: PipelineContext,
  processor: ContextProcessor,
  error: unknown,
  message: string,
  details?: unknown
): never {
  errorHandler.handle(error, {
    showToUser: false,
    context: { processorId: processor.id },
  });
  recordResult(context, processor, {
    status: "failed",
    message,
    error,
    details,
  });
  throw error;
}

/**
 * Executes enabled context processors in order.
 *
 * A processor must explicitly report whether it applied, skipped, degraded, or
 * failed. Skips and safe degradations continue the request construction. An
 * explicit failure, an invalid result, or an uncaught exception aborts the
 * pipeline so a partially processed context cannot be sent to the model.
 */
export class PipelineEngine {
  static async execute(
    context: PipelineContext,
    processors: ContextProcessor[]
  ): Promise<PipelineContext> {
    logger.info("开始执行上下文管道", {
      processorCount: processors.length,
      processors: processors.map((processor) => processor.id),
    });

    for (const processor of processors) {
      logger.debug("执行处理器", { id: processor.id });
      let candidate: unknown;
      try {
        candidate = await processor.execute(context);
      } catch (error) {
        abortForProcessorError(
          context,
          processor,
          error,
          `处理步骤 [${processor.name}] 发生未恢复异常，已终止请求构建。`
        );
      }

      if (!isProcessorExecutionResult(candidate)) {
        const error = new Error(
          `处理器 [${processor.name}] 未返回有效的执行结果。`
        );
        abortForProcessorError(
          context,
          processor,
          error,
          `处理步骤 [${processor.name}] 返回无效结果，已终止请求构建。`
        );
      }
      const result = candidate;

      if (result.status === "failed") {
        abortForProcessorError(
          context,
          processor,
          result.error,
          result.message,
          result.details
        );
      }

      recordResult(context, processor, result);
      const logContext = {
        id: processor.id,
        status: result.status,
        details: result.details,
      };
      if (result.status === "degraded") {
        logger.warn(result.message, logContext);
      } else {
        logger.debug(result.message, logContext);
      }
    }

    logger.info("上下文管道执行完毕");
    return context;
  }
}
