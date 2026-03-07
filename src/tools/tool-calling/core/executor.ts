import { toolRegistryManager } from "@/services/registry";
import type { ParsedToolRequest, ToolExecutionResult, ToolCallConfig, ToolApprovalResult } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { taskManager } from "./async-task";
import { parseToolTarget } from "./utils/tool-parser";

const logger = createModuleLogger("tool-calling/executor");

export interface ExecutorOptions {
  config: ToolCallConfig;
  onBeforeExecute?: (request: ParsedToolRequest) => Promise<ToolApprovalResult | boolean>;
}

function buildErrorResult(request: ParsedToolRequest, message: string, durationMs = 0): ToolExecutionResult {
  return {
    requestId: request.requestId,
    toolName: request.toolName,
    status: "error",
    result: message,
    durationMs,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 执行超时（${timeoutMs}ms）`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function executeSingleRequest(
  request: ParsedToolRequest,
  options: ExecutorOptions
): Promise<ToolExecutionResult> {
  const startedAt = Date.now();

  // 检查解析验证错误
  if (request.validation && !request.validation.isValid) {
    const errorMessages = request.validation.errors?.join("; ") || "解析格式错误";
    return buildErrorResult(request, `工具请求解析失败：${errorMessages}`, Date.now() - startedAt);
  }

  const target = parseToolTarget(request.toolName);

  if (!target) {
    return buildErrorResult(
      request,
      `无效 tool_name 格式：${request.toolName}，期望格式为 toolId_methodName`,
      Date.now() - startedAt
    );
  }

  // 检查方法是否启用
  const methodKey = `${target.toolId}_${target.methodName}`;
  const isMethodEnabled = options.config.methodToggles?.[methodKey] !== false;
  if (!isMethodEnabled) {
    return buildErrorResult(
      request,
      `方法已被禁用：${target.toolId}.${target.methodName}，请在智能体设置中开启`,
      Date.now() - startedAt
    );
  }

  // 自动化批准逻辑判断
  const isGlobalAuto = options.config.mode === "auto";
  const isToolAutoApprove = options.config.autoApproveTools?.[target.toolId] ?? options.config.defaultAutoApprove;
  const isMethodAutoApprove = options.config.autoApproveMethods?.[methodKey] ?? false;

  // 方法级自动批准优先级高于工具级
  const shouldAutoApprove = isGlobalAuto && (isMethodAutoApprove || isToolAutoApprove);

  if (!shouldAutoApprove) {
    const approvalResult = await options.onBeforeExecute?.(request);
    if (approvalResult === false || approvalResult === "rejected") {
      return buildErrorResult(request, "工具调用被拒绝：用户未授权", Date.now() - startedAt);
    }
    if (approvalResult === "silent_cancelled") {
      return {
        requestId: request.requestId,
        toolName: request.toolName,
        status: "denied",
        result: "SILENT_CANCEL",
        durationMs: Date.now() - startedAt,
      };
    }
  }

  if (!toolRegistryManager.hasTool(target.toolId)) {
    return buildErrorResult(request, `工具不存在：${target.toolId}`, Date.now() - startedAt);
  }

  let toolInstance: Record<string, unknown>;
  try {
    toolInstance = toolRegistryManager.getRegistry(target.toolId) as unknown as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildErrorResult(request, `获取工具实例失败：${message}`, Date.now() - startedAt);
  }

  const method = toolInstance[target.methodName];
  if (typeof method !== "function") {
    return buildErrorResult(request, `方法不存在：${target.toolId}.${target.methodName}`, Date.now() - startedAt);
  }

  const metadata =
    typeof (
      toolInstance as {
        getMetadata?: () => {
          methods?: Array<{ name: string; agentCallable?: boolean; executionMode?: "sync" | "async" }>;
        };
      }
    ).getMetadata === "function"
      ? (
          toolInstance as {
            getMetadata: () => {
              methods?: Array<{ name: string; agentCallable?: boolean; executionMode?: "sync" | "async" }>;
            };
          }
        ).getMetadata()
      : undefined;

  const methodMeta = metadata?.methods?.find((m) => m.name === target.methodName);
  if (methodMeta?.agentCallable !== true) {
    return buildErrorResult(
      request,
      `方法不可调用：${target.toolId}.${target.methodName} 未标记为 agentCallable`,
      Date.now() - startedAt
    );
  }

  // 参数合并策略：Default (settingsSchema) < Agent Preset (toolSettings) < LLM Call (request.args)
  const schemaDefaults: Record<string, unknown> = {};
  const schema = (toolInstance as { settingsSchema?: Array<{ modelPath: string; defaultValue?: unknown }> })
    .settingsSchema;
  if (schema) {
    for (const item of schema) {
      if (item.defaultValue !== undefined) {
        schemaDefaults[item.modelPath] = item.defaultValue;
      }
    }
  }
  const agentPreset = options.config.toolSettings?.[target.toolId] ?? {};
  const mergedArgs = { ...schemaDefaults, ...agentPreset, ...request.args };

  // 检查是否为异步方法
  if (methodMeta?.executionMode === "async") {
    try {
      const taskId = await taskManager.submitTask(request.toolName, mergedArgs, request.requestId);
      const durationMs = Date.now() - startedAt;

      const asyncResult = {
        type: "async_task",
        taskId,
        message: "任务已提交，请使用 tool-calling_getTaskStatus 查询进度",
      };

      return {
        requestId: request.requestId,
        toolName: request.toolName,
        status: "success",
        result: JSON.stringify(asyncResult),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      logger.error("异步任务提交失败", error, {
        requestId: request.requestId,
        toolName: request.toolName,
      });
      return buildErrorResult(request, `异步任务提交失败：${message}`, durationMs);
    }
  }

  try {
    const invokePromise = Promise.resolve(
      (method as (args: Record<string, unknown>) => unknown).call(toolInstance, mergedArgs)
    );
    const data = await withTimeout(invokePromise, options.config.timeout, request.toolName);
    const durationMs = Date.now() - startedAt;
    const result = typeof data === "string" ? data : JSON.stringify(data ?? null);

    return {
      requestId: request.requestId,
      toolName: request.toolName,
      status: "success",
      result,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("工具执行失败", {
      requestId: request.requestId,
      toolName: request.toolName,
      error: message,
    });
    return buildErrorResult(request, message, durationMs);
  }
}

/**
 * 执行一批解析后的工具请求
 */
export async function executeToolRequests(
  requests: ParsedToolRequest[],
  options: ExecutorOptions
): Promise<ToolExecutionResult[]> {
  if (requests.length === 0) {
    return [];
  }

  if (options.config.parallelExecution) {
    return await Promise.all(requests.map((request) => executeSingleRequest(request, options)));
  }

  const results: ToolExecutionResult[] = [];
  for (const request of requests) {
    results.push(await executeSingleRequest(request, options));
  }
  return results;
}
