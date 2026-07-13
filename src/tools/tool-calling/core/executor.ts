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

import { toolRegistryManager } from "@/services/registry";
import type {
  ParsedToolRequest,
  ToolExecutionResult,
  ToolCallConfig,
  ToolApprovalResult,
  ToolCallStatus,
} from "../types";
import type { ToolContext } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { taskManager } from "./async-task";

const logger = createModuleLogger("tool-calling/executor");

export interface ExecutorOptions {
  config: ToolCallConfig;
  onBeforeExecute?: (
    request: ParsedToolRequest
  ) => Promise<ToolApprovalResult | boolean>;
  onStatusChange?: (requestId: string, status: ToolCallStatus) => void;
}

function buildErrorResult(
  request: ParsedToolRequest,
  message: string,
  durationMs = 0
): ToolExecutionResult {
  return {
    requestId: request.requestId,
    toolName: request.toolName,
    status: "error",
    result: message,
    durationMs,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
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

interface RequestSecurityContext {
  isBlocked: boolean;
  blockMessage?: string;
  forceApproval: boolean;
  mergedArgs: Record<string, unknown>;
  toolInstance?: any;
  methodMeta?: any;
}

async function prepareRequestContext(
  request: ParsedToolRequest,
  config: ToolCallConfig
): Promise<RequestSecurityContext> {
  const context: RequestSecurityContext = {
    isBlocked: false,
    forceApproval: false,
    mergedArgs: {},
  };

  if (request.validation && !request.validation.isValid) {
    return context;
  }

  const toolId = request.toolId;
  const methodName = request.methodName;

  if (!toolRegistryManager.hasTool(toolId)) {
    return context;
  }

  try {
    const toolInstance = toolRegistryManager.getRegistry(toolId) as any;
    context.toolInstance = toolInstance;

    const method = toolInstance[methodName];
    if (typeof method !== "function") {
      return context;
    }

    const metadata =
      typeof toolInstance.getMetadata === "function"
        ? toolInstance.getMetadata()
        : undefined;
    const methodMeta = metadata?.methods?.find(
      (m: any) => m.name === methodName
    );
    context.methodMeta = methodMeta;

    // 参数合并
    const schemaDefaults: Record<string, unknown> = {};
    const schema = toolInstance.settingsSchema;
    if (schema) {
      for (const item of schema) {
        if (item.defaultValue !== undefined) {
          schemaDefaults[item.modelPath] = item.defaultValue;
        }
      }
    }
    const agentPreset = config.toolSettings?.[toolId] ?? {};
    const { command: _, ...cleanArgs } = request.args ?? {};
    const mergedArgs = { ...schemaDefaults, ...agentPreset, ...cleanArgs };

    // 类型适配
    if (methodMeta?.parameters) {
      for (const param of methodMeta.parameters) {
        const val = mergedArgs[param.name];
        if (val !== undefined) {
          if (param.type === "boolean") {
            mergedArgs[param.name] =
              String(val).toLowerCase() === "true" || val === true;
          } else if (param.type === "number") {
            const num = Number(val);
            if (!isNaN(num)) mergedArgs[param.name] = num;
          }
        }
      }
    }
    context.mergedArgs = mergedArgs;

    // 安全策略检查
    if (typeof toolInstance.checkSecurityPolicy === "function") {
      const policy = await Promise.resolve(
        toolInstance.checkSecurityPolicy(methodName, mergedArgs)
      );
      if (policy && typeof policy === "object") {
        if (policy.status === "block") {
          context.isBlocked = true;
          context.blockMessage = policy.message;
        } else if (policy.status === "approve") {
          context.forceApproval = true;
        }
      }
    }
  } catch (e) {
    logger.error(`准备请求安全上下文失败: ${toolId}.${methodName}`, e);
  }

  return context;
}

async function executeSingleRequest(
  request: ParsedToolRequest,
  options: ExecutorOptions,
  approvalCache?: Map<string, Promise<ToolApprovalResult | boolean>>,
  securityContext?: RequestSecurityContext
): Promise<ToolExecutionResult> {
  const startedAt = Date.now();

  // 检查解析验证错误
  if (request.validation && !request.validation.isValid) {
    const errorMessages =
      request.validation.errors?.join("; ") || "解析格式错误";
    return buildErrorResult(
      request,
      `工具请求解析失败：${errorMessages}`,
      Date.now() - startedAt
    );
  }

  // 优先使用已解析的 toolId/methodName（由协议层填充）
  const target = {
    toolId: request.toolId,
    methodName: request.methodName,
  };

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

  // 获取或准备安全上下文
  const ctx =
    securityContext || (await prepareRequestContext(request, options.config));

  // 1. 检查是否被安全策略拦截（死区）
  if (ctx.isBlocked) {
    return {
      requestId: request.requestId,
      toolName: request.toolName,
      status: "denied",
      result: ctx.blockMessage || "安全策略拦截：完全禁止访问此范围（死区）",
      durationMs: Date.now() - startedAt,
    };
  }

  const forceApproval = ctx.forceApproval;
  const mergedArgs = ctx.mergedArgs;
  const toolInstance = ctx.toolInstance;
  const methodMeta = ctx.methodMeta;

  // 2. 检查是否需要审批
  if (forceApproval || !shouldAutoApprove(request, options.config)) {
    // 方案 2.3：在进入审批挂起状态前，允许工具实例先接收到“预览数据”
    try {
      if (
        toolInstance &&
        typeof toolInstance.onToolCallPreview === "function"
      ) {
        await Promise.resolve(
          toolInstance.onToolCallPreview(
            request.requestId,
            target.methodName,
            mergedArgs
          )
        );
      }
    } catch (e) {
      logger.debug(`工具预览分发失败: ${target.toolId}`, e);
    }

    // 优先从缓存中获取审批结果，避免重复触发审批流程
    const approvalResult = approvalCache?.has(request.requestId)
      ? await approvalCache.get(request.requestId)
      : await options.onBeforeExecute?.(request);
    if (approvalResult === false || approvalResult === "rejected") {
      // 尝试通知工具实例执行清理逻辑
      try {
        if (
          toolInstance &&
          typeof toolInstance.onToolCallDiscarded === "function"
        ) {
          await Promise.resolve(
            toolInstance.onToolCallDiscarded(
              request.requestId,
              target.methodName,
              mergedArgs
            )
          );
        }
      } catch (e) {
        logger.warn(`通知工具清理失败: ${target.toolId}`, e);
      }

      return {
        requestId: request.requestId,
        toolName: request.toolName,
        status: "denied",
        result: "工具调用被拒绝：用户未授权",
        durationMs: Date.now() - startedAt,
      };
    }
  }

  // 审批通过（或自动批准），开始执行
  options.onStatusChange?.(request.requestId, "executing");

  if (!toolRegistryManager.hasTool(target.toolId)) {
    return buildErrorResult(
      request,
      `工具不存在：${target.toolId}`,
      Date.now() - startedAt
    );
  }

  if (!toolInstance) {
    return buildErrorResult(
      request,
      `获取工具实例失败`,
      Date.now() - startedAt
    );
  }

  const method = toolInstance[target.methodName];
  if (typeof method !== "function") {
    return buildErrorResult(
      request,
      `方法不存在：${target.toolId}.${target.methodName}`,
      Date.now() - startedAt
    );
  }

  if (methodMeta?.agentCallable !== true) {
    return buildErrorResult(
      request,
      `方法不可调用：${target.toolId}.${target.methodName} 未标记为 agentCallable`,
      Date.now() - startedAt
    );
  }

  // 检查是否为异步方法
  if (methodMeta?.executionMode === "async") {
    try {
      const taskId = await taskManager.submitTask(
        target.toolId,
        target.methodName,
        mergedArgs,
        request.requestId
      );
      const durationMs = Date.now() - startedAt;

      const asyncResult = {
        type: "async_task",
        taskId,
        message: "任务已提交，请使用 tool-calling_getTaskStatus 查询进度",
      };

      // 异步任务提交成功也视为 completed（执行权移交给任务管理器）
      options.onStatusChange?.(request.requestId, "completed");

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
      return buildErrorResult(
        request,
        `异步任务提交失败：${message}`,
        durationMs
      );
    }
  }
  try {
    // 构造统一的 ToolContext，通过第二参数传递
    const toolContext: ToolContext = {
      isAsync: false,
      reportStatus: (message: string) => {
        options.onStatusChange?.(request.requestId, "executing");
        logger.debug(`工具执行进度上报: ${request.toolName}`, { message });
      },
    };

    const invokePromise = Promise.resolve(
      (
        method as (
          args: Record<string, unknown>,
          context?: ToolContext
        ) => unknown
      ).call(toolInstance, mergedArgs, toolContext)
    );
    const data = await withTimeout(
      invokePromise,
      options.config.timeout,
      request.toolName
    );
    const durationMs = Date.now() - startedAt;
    const result =
      typeof data === "string" ? data : JSON.stringify(data ?? null);

    options.onStatusChange?.(request.requestId, "completed");

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
    options.onStatusChange?.(request.requestId, "error");
    return buildErrorResult(request, message, durationMs);
  }
}

/**
 * 判断一个工具请求是否应该被自动批准
 */
function shouldAutoApprove(
  request: ParsedToolRequest,
  config: ToolCallConfig
): boolean {
  const isGlobalAuto = config.mode === "auto";
  const isToolAutoApprove =
    config.autoApproveTools?.[request.toolId] ?? config.defaultAutoApprove;
  const methodKey = `${request.toolId}_${request.methodName}`;
  const isMethodAutoApprove = config.autoApproveMethods?.[methodKey] ?? false;

  // 方法级自动批准优先级高于工具级
  return isGlobalAuto && (isMethodAutoApprove || isToolAutoApprove);
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

  // 1. 准备所有请求的安全上下文
  const securityContexts = new Map<string, RequestSecurityContext>();
  for (const request of requests) {
    const ctx = await prepareRequestContext(request, options.config);
    securityContexts.set(request.requestId, ctx);
  }

  // 审批缓存，用于解耦审批发起与执行等待
  const approvalCache = new Map<
    string,
    Promise<ToolApprovalResult | boolean>
  >();

  // 2. 统一处理预审批逻辑
  if (options.onBeforeExecute) {
    for (const request of requests) {
      const ctx = securityContexts.get(request.requestId);
      const isBlocked = ctx?.isBlocked ?? false;
      const forceApproval = ctx?.forceApproval ?? false;

      // 如果已被安全策略拦截（死区），则不需要发起审批，直接在执行阶段返回 denied
      if (isBlocked) {
        continue;
      }

      const needsApproval =
        forceApproval || !shouldAutoApprove(request, options.config);
      const isParsedValid = !request.validation || request.validation.isValid;

      if (needsApproval && isParsedValid) {
        // 💡 兼容预览钩子：在进入审批挂起状态前，允许工具实例先接收到“预览数据”
        try {
          const toolInstance = ctx?.toolInstance;
          if (
            toolInstance &&
            typeof toolInstance.onToolCallPreview === "function"
          ) {
            Promise.resolve(
              toolInstance.onToolCallPreview(
                request.requestId,
                request.methodName,
                ctx?.mergedArgs ?? {}
              )
            ).catch((e) =>
              logger.debug(`预审批预览分发失败: ${request.toolId}`, e)
            );
          }
        } catch (e) {
          // 静默失败
        }

        // 发起审批并存入缓存
        approvalCache.set(request.requestId, options.onBeforeExecute(request));
      }
    }

    // 给 UI 渲染留出微量缓冲时间
    if (approvalCache.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // 3. 执行阶段
  if (options.config.parallelExecution) {
    return await Promise.all(
      requests.map((request) =>
        executeSingleRequest(
          request,
          options,
          approvalCache,
          securityContexts.get(request.requestId)
        )
      )
    );
  }

  const results: ToolExecutionResult[] = [];
  for (const request of requests) {
    const result = await executeSingleRequest(
      request,
      options,
      approvalCache,
      securityContexts.get(request.requestId)
    );
    results.push(result);
  }
  return results;
}
