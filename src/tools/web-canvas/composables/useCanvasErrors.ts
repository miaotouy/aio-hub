import { ref, type Ref } from "vue";
import type { CanvasConfig } from "../types/config";

export interface RuntimeError {
  id: string; // 唯一标识
  canvasId: string; // 所属画布 ID
  level: "error" | "warn" | "info"; // 错误级别
  message: string; // 错误消息
  filename?: string; // 出错文件名
  lineno?: number; // 行号
  colno?: number; // 列号
  stack?: string; // 堆栈信息
  timestamp: number; // 发生时间戳
  stale: boolean; // 是否过期（文件已修改但预览未刷新）
}

export function useCanvasErrors(config: Ref<CanvasConfig>) {
  // 运行时错误列表
  const runtimeErrors = ref<RuntimeError[]>([]);

  /**
   * 添加运行时错误
   */
  function addRuntimeError(error: Omit<RuntimeError, "id" | "stale">) {
    const newError: RuntimeError = {
      ...error,
      id: Math.random().toString(36).slice(2),
      stale: false,
    };

    const maxErrors = config.value.maxRuntimeErrors ?? 10;

    // 检查是否已存在相同错误（避免重复）
    const exists = runtimeErrors.value.some(
      (e) =>
        e.canvasId === newError.canvasId &&
        e.message === newError.message &&
        e.filename === newError.filename &&
        e.lineno === newError.lineno,
    );

    if (!exists) {
      runtimeErrors.value.push(newError);

      // 超出限制时，移除最旧的错误
      if (runtimeErrors.value.length > maxErrors) {
        runtimeErrors.value.shift();
      }
    }
  }

  /**
   * 清空指定画布的错误
   */
  function clearRuntimeErrors(canvasId: string) {
    runtimeErrors.value = runtimeErrors.value.filter((e) => e.canvasId !== canvasId);
  }

  /**
   * 标记指定画布的错误为过期（文件修改后调用）
   */
  function markErrorsAsStale(canvasId: string) {
    runtimeErrors.value.forEach((e) => {
      if (e.canvasId === canvasId) {
        e.stale = true;
      }
    });
  }

  /**
   * 清除指定画布的过期错误（预览刷新完成后调用）
   */
  function clearStaleRuntimeErrors(canvasId: string) {
    runtimeErrors.value = runtimeErrors.value.filter((e) => !(e.canvasId === canvasId && e.stale));
  }

  /**
   * 获取指定画布的活跃错误（未过期）
   */
  function getActiveRuntimeErrors(canvasId: string): RuntimeError[] {
    return runtimeErrors.value.filter((e) => e.canvasId === canvasId && !e.stale);
  }

  /**
   * 获取格式化后的错误信息（用于上下文注入）
   */
  function getFormattedErrorContext(canvasId: string, limit = 10): string {
    const errors = getActiveRuntimeErrors(canvasId);

    if (errors.length === 0) {
      return "";
    }

    let context = `⚠️ Runtime Errors in Preview (${errors.length}):\n`;

    errors.slice(0, limit).forEach((err, idx) => {
      context += `${idx + 1}. [${err.level.toUpperCase()}] ${err.message}\n`;
      if (err.filename) {
        // 尝试缩短文件名，如果是 asset:// 协议，只保留相对路径
        const shortFile = err.filename.includes("asset://") ? err.filename.split("/").pop() : err.filename;
        context += `   at ${shortFile}:${err.lineno}:${err.colno}\n`;
      }
      if (err.stack && err.level === "error") {
        // 只取前两行堆栈，避免太长
        const stackLines = err.stack
          .split("\n")
          .filter((line) => line.trim())
          .slice(0, 2);
        if (stackLines.length > 0) {
          context += `   Stack: ${stackLines.join("\n   ")}\n`;
        }
      }
      context += `   Time: ${new Date(err.timestamp).toLocaleTimeString()}\n`;
    });

    if (errors.length > limit) {
      context += `... and ${errors.length - limit} more errors.\n`;
    }

    context += `\n(Note: These errors occurred in the live preview. Please fix them before proceeding.)`;

    return context;
  }

  return {
    runtimeErrors,
    addRuntimeError,
    clearRuntimeErrors,
    markErrorsAsStale,
    clearStaleRuntimeErrors,
    getActiveRuntimeErrors,
    getFormattedErrorContext,
  };
}