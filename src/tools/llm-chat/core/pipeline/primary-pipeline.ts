import type { PipelineContext } from "./types";

/**
 * 执行主上下文管道。
 *
 * @param context - 管道上下文。
 * @returns 返回处理后的上下文。
 */
export async function executePrimaryPipeline(
  context: PipelineContext,
): Promise<PipelineContext> {
  // 暂留空实现，仅返回原始上下文
  return context;
}
