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

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { toolRegistryManager } from "@/services/registry";
import { useVcpDistributedStore } from "../stores/vcpDistributedStore";
import { vcpBridgeFactory } from "./VcpBridgeFactory";
import { useToolCallingStore } from "@/tools/llm-chat/stores/toolCallingStore";
import type {
  VcpToolManifest,
  ExecuteToolRequest,
  ToolResultResponse,
  ReportIpData,
  VcpManifestsResponse,
  VcpToolExecutionResult,
  VcpToolApprovalRequest,
} from "../types/distributed";
import type { ToolContext } from "@/services/types";
import {
  inspectFileForExternalTransfer,
  readFileForExternalTransfer,
} from "@/tools/aio-file-operator/actions";

const logger = createModuleLogger("vcp-connector/node-protocol");
const errorHandler = createModuleErrorHandler("vcp-connector/node-protocol");
const DISTRIBUTED_TOOL_TIMEOUT_MS = 115_000;
const EXTERNAL_FILE_RATE_WINDOW_MS = 60_000;
const EXTERNAL_FILE_RATE_LIMIT = 20;
const EXTERNAL_FILE_MAX_CONCURRENCY = 2;

interface NormalizedExecuteToolRequest {
  requestId: string;
  toolName: string;
  toolArgs: Record<string, any>;
}

function pickString(source: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function parseToolArgs(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object") return { ...(value as Record<string, any>) };
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? { ...(parsed as Record<string, any>) }
      : null;
  } catch {
    return null;
  }
}

function normalizeExecuteToolRequest(
  request: ExecuteToolRequest | Record<string, any>
): NormalizedExecuteToolRequest {
  const source = (request || {}) as Record<string, any>;
  const data =
    source.data && typeof source.data === "object"
      ? (source.data as Record<string, any>)
      : source;
  const toolArgs =
    parseToolArgs(
      data.toolArgs ||
        data.tool_args ||
        data.args ||
        data.arguments ||
        data.params
    ) || stripTransportFields(data);

  return {
    requestId: pickString(data, ["requestId", "request_id", "id"]),
    toolName: pickString(data, ["toolName", "tool_name", "name"]),
    toolArgs,
  };
}

function stripTransportFields(
  source: Record<string, any>
): Record<string, any> {
  const {
    requestId: _requestId,
    request_id: _request_id,
    id: _id,
    toolName: _toolName,
    tool_name: _tool_name,
    name: _name,
    ...args
  } = source;
  return args;
}

function resolveCommandName(args: Record<string, any>): string {
  return pickString(args, [
    "command",
    "commandName",
    "command_name",
    "toolCommand",
    "tool_command",
  ]);
}

/**
 * 将 VCP 批量调用参数（command1/path1, command2/path2, ...）拆分成
 * 与单次调用相同形状的参数对象。非索引参数会作为公共参数复制到每一项。
 */
function splitIndexedToolArgs(
  args: Record<string, any>
): Record<string, any>[] | null {
  const indices = Object.keys(args)
    .map((key) => key.match(/^command(\d+)$/)?.[1])
    .filter((index): index is string => Boolean(index))
    .sort((a, b) => Number(a) - Number(b));

  if (indices.length === 0) return null;

  const commonArgs: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!/^.+\d+$/.test(key)) {
      commonArgs[key] = value;
    }
  }

  return indices.map((index) => {
    const groupArgs: Record<string, any> = { ...commonArgs };
    const suffix = new RegExp(`^(.+?)${index}$`);

    for (const [key, value] of Object.entries(args)) {
      const match = key.match(suffix);
      if (match) groupArgs[match[1]] = value;
    }

    return groupArgs;
  });
}

function stripProtocolArgs(args: Record<string, any>): Record<string, any> {
  const cleanArgs: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    if (
      key === "command" ||
      key === "commandName" ||
      key === "command_name" ||
      key === "toolCommand" ||
      key === "tool_command" ||
      /^command\d+$/.test(key)
    ) {
      continue;
    }
    cleanArgs[key] = value;
  }
  return cleanArgs;
}

async function withDistributedTimeout<T>(
  promise: Promise<T>,
  label: string,
  onTimeout?: () => void
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(
        new Error(
          `${label} 分布式执行超时（${DISTRIBUTED_TOOL_TIMEOUT_MS}ms），已提前返回以避免 VCP 服务端 60s 等待超时`
        )
      );
    }, DISTRIBUTED_TOOL_TIMEOUT_MS);

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

export class VcpNodeProtocol {
  private readonly inFlightControllers = new Map<string, AbortController>();
  private readonly externalFileRequestTimes: number[] = [];
  private externalFileTransfersInFlight = 0;

  constructor(
    private sendJson: (data: any) => void,
    private readonly serverId = "unknown-vcp-server"
  ) {}

  /**
   * Best-effort cancellation for the optional distributed cancel_tool frame.
   */
  public handleCancelTool(requestId: string): boolean {
    const controller = this.inFlightControllers.get(requestId);
    if (!controller || controller.signal.aborted) return false;

    controller.abort();
    logger.info("Cancelled in-flight distributed tool", { requestId });
    return true;
  }

  /**
   * A disconnected node can no longer receive server-side cancellation frames.
   * Abort every execution started by this WebSocket locally instead.
   */
  public abortAllInFlight(): void {
    useToolCallingStore().cancelExternalRequests("VCP 连接已断开");
    for (const [requestId, controller] of this.inFlightControllers) {
      if (!controller.signal.aborted) {
        controller.abort();
        logger.info("Cancelled in-flight distributed tool after disconnect", {
          requestId,
        });
      }
    }
  }

  /**
   * AIO -> VCP: 工具注册 (register_tools)
   */
  public sendRegisterTools(serverName: string, tools: VcpToolManifest[]) {
    logger.info(`Registering ${tools.length} tools to VCP from ${serverName}`);
    this.sendJson({
      type: "register_tools",
      data: {
        serverName,
        tools,
        capabilities: {
          cancelTool: true,
        },
      },
    });
  }

  /**
   * AIO -> VCP: IP 上报 (report_ip)
   */
  public sendReportIp(data: ReportIpData) {
    this.sendJson({
      type: "report_ip",
      data,
    });
  }

  /**
   * AIO -> VCP: 执行结果 (tool_result)
   */
  public sendToolResult(response: ToolResultResponse) {
    this.sendJson({
      type: "tool_result",
      data: {
        ...response,
        request_id: response.requestId,
      },
    });
  }

  /**
   * VCP -> AIO: 处理工具调用批准请求
   */
  public async handleToolApprovalRequest(
    data: VcpToolApprovalRequest
  ): Promise<void> {
    const { requestId, toolName, args, maid } = data;
    logger.info(`Received tool approval request from VCP: ${toolName}`, {
      requestId,
      maid,
      args,
    });

    const toolCallingStore = useToolCallingStore();

    // 1. 转换为 AIO 内部格式 (ParsedToolRequest)
    // 注意：VCP 的 toolName 可能是插件名，args 中可能包含 command
    const parsedRequest = {
      requestId,
      toolId: toolName,
      methodName: (args.command as string) || "",
      toolName: toolName,
      rawBlock: JSON.stringify(args, null, 2),
      args: args,
    };

    // 2. 映射 sessionId (vcp-${maid})
    const sessionId = `vcp-${maid}`;

    // 3. 调用 toolCallingStore.requestApproval 并等待用户操作
    const result = await toolCallingStore.requestApproval(
      sessionId,
      parsedRequest as any,
      requestId
    );

    // 4. 发送响应回 VCP
    // AIO 的结果有多种，映射为布尔值
    const approved = result === "approved";
    this.sendToolApprovalResponse(requestId, approved);
  }

  /**
   * AIO -> VCP: 发送工具调用批准响应
   */
  public sendToolApprovalResponse(requestId: string, approved: boolean): void {
    logger.info(`Sending tool approval response to VCP: ${requestId}`, {
      approved,
    });
    this.sendJson({
      type: "tool_approval_response",
      data: { requestId, approved },
    });
  }

  /**
   * VCP -> AIO: 清单响应 (vcp_manifest_response)
   */
  public handleVcpManifestsResponse(response: VcpManifestsResponse) {
    const requestId = (response as any).requestId; // 假设后端回传了 requestId
    vcpBridgeFactory.handleManifestsResponse(requestId, response.plugins);
  }

  /**
   * VCP -> AIO: 远程工具执行结果 (vcp_tool_result)
   */
  public handleVcpToolResult(response: VcpToolExecutionResult) {
    vcpBridgeFactory.handleToolResult(response.requestId, response);
  }

  /**
   * VCP -> AIO: 远程工具执行状态 (vcp_tool_status)
   */
  public handleVcpToolStatus(data: any) {
    vcpBridgeFactory.handleToolStatus(data);
  }

  private async executeRegisteredTool(
    rawToolId: string,
    toolArgs: Record<string, any>,
    requestId: string,
    signal: AbortSignal,
    onTimeout: () => void
  ): Promise<any> {
    const rawMethodName = resolveCommandName(toolArgs);
    if (!rawToolId || !rawMethodName) {
      throw new Error(
        `Invalid tool call: toolName="${rawToolId}", command="${rawMethodName}". ` +
          `VCP protocol requires toolArgs.command to be provided.`
      );
    }

    logger.debug(`Executing VCP tool: ${rawToolId}.${rawMethodName}`);

    // 分布式协议会将连字符转为下划线，这里需要尝试转回连字符格式。
    let toolId = rawToolId;
    let registry = null;
    if (toolRegistryManager.hasTool(toolId)) {
      registry = toolRegistryManager.getRegistry(toolId);
    } else {
      const hyphenId = toolId.replace(/_/g, "-");
      if (toolRegistryManager.hasTool(hyphenId)) {
        toolId = hyphenId;
        registry = toolRegistryManager.getRegistry(toolId);
        logger.debug(
          `Resolved toolId through hyphen conversion: ${rawToolId} -> ${toolId}`
        );
      }
    }

    if (!registry) {
      const availableTools = toolRegistryManager.getAllToolIds().join(", ");
      throw new Error(
        `工具 "${rawToolId}" 尚未注册。可用的工具: ${availableTools}`
      );
    }

    const distStore = useVcpDistributedStore();
    const metadata = registry.getMetadata?.();
    const method = metadata?.methods.find(
      (m) =>
        m.name === rawMethodName ||
        m.protocolConfig?.vcpCommand?.trim() === rawMethodName
    );
    if (!method) {
      throw new Error(`Method ${rawMethodName} not found in tool ${toolId}`);
    }

    const resolvedMethodName = method.name;
    const fullId = `${toolId}:${resolvedMethodName}`;
    const isAutoRegister = distStore.config.autoRegisterTools;
    const isDisabled = (distStore.config.disabledToolIds || []).includes(
      fullId
    );
    const isManuallyExposed = (distStore.config.exposedToolIds || []).includes(
      fullId
    );
    const isAllowed =
      (isAutoRegister &&
        (method.agentCallable || method.distributedExposed) &&
        !isDisabled) ||
      isManuallyExposed;

    if (!isAllowed) {
      throw new Error(
        `Method ${resolvedMethodName} in tool ${toolId} is not exposed or is disabled for distributed calling`
      );
    }

    const service = registry as any;
    if (typeof service[resolvedMethodName] !== "function") {
      throw new Error(
        `Method ${resolvedMethodName} not implemented in tool ${toolId}`
      );
    }

    const context: ToolContext = {
      isAsync: false,
      requestId,
      signal,
      reportStatus: (message: string) => {
        logger.debug(`Distributed tool progress: ${toolId}`, {
          requestId,
          methodName: resolvedMethodName,
          message,
        });
      },
    };

    return await withDistributedTimeout(
      Promise.resolve(
        service[resolvedMethodName](stripProtocolArgs(toolArgs), context)
      ),
      `${toolId}.${resolvedMethodName}`,
      onTimeout
    );
  }

  /**
   * VCP -> AIO: 执行请求 (execute_tool)
   */
  public async handleExecuteTool(request: ExecuteToolRequest | any) {
    const { requestId, toolName, toolArgs } =
      normalizeExecuteToolRequest(request);
    logger.info(`Executing tool: ${toolName}`, { requestId, toolArgs });

    const abortController = new AbortController();
    this.inFlightControllers.set(requestId, abortController);

    try {
      // 0. 特殊处理内置工具：internal_request_file
      if (toolName === "internal_request_file") {
        await this.handleInternalRequestFile(
          requestId,
          toolArgs,
          abortController.signal
        );
        return;
      }

      // 1. 解析 toolName 和 methodName。VCP 文本协议还支持同一工具的
      // 批量调用（command1/path1, command2/path2, ...）。
      const indexedToolArgs = splitIndexedToolArgs(toolArgs);
      const calls = indexedToolArgs || [toolArgs];
      const results: any[] = [];

      for (const [index, callArgs] of calls.entries()) {
        results.push(
          await this.executeRegisteredTool(
            toolName,
            callArgs,
            calls.length > 1 ? `${requestId}_${index + 1}` : requestId,
            abortController.signal,
            () => abortController.abort()
          )
        );
      }

      // 分布式 execute_tool 只有一个 requestId，因此批量调用聚合为一次结果。
      this.sendToolResult({
        requestId,
        status: "success",
        result: calls.length > 1 ? results : results[0],
      });
    } catch (error: any) {
      errorHandler.error(error, "Tool execution failed", {
        context: { requestId, toolName },
      });

      // 6. 回传错误
      this.sendToolResult({
        requestId,
        status: "error",
        error: error.message || String(error),
      });
    } finally {
      this.inFlightControllers.delete(requestId);
    }
  }

  /**
   * 处理内置文件请求工具
   */
  private parseLocalFileUrl(fileUrl: unknown): string {
    if (typeof fileUrl !== "string" || !fileUrl.trim()) {
      throw new Error("internal_request_file 缺少 fileUrl");
    }

    let url: URL;
    try {
      url = new URL(fileUrl);
    } catch {
      throw new Error("internal_request_file 只接受格式正确的 file:// URL");
    }
    if (url.protocol !== "file:") {
      throw new Error("internal_request_file 只接受 file:// URL");
    }
    if (url.username || url.password || url.port || url.search || url.hash) {
      throw new Error("file:// URL 不允许凭据、端口、查询参数或片段");
    }
    if (url.hostname && url.hostname !== "localhost") {
      throw new Error("internal_request_file 不允许 UNC 或远程主机路径");
    }

    let filePath = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:/.test(filePath)) filePath = filePath.slice(1);
    if (
      !filePath ||
      (!filePath.startsWith("/") && !/^[a-zA-Z]:[\/]/.test(filePath))
    ) {
      throw new Error("file:// URL 必须解析为本机绝对路径");
    }
    return filePath;
  }

  private assertExternalFileRateLimit(): void {
    const now = Date.now();
    while (
      this.externalFileRequestTimes.length > 0 &&
      now - this.externalFileRequestTimes[0] >= EXTERNAL_FILE_RATE_WINDOW_MS
    ) {
      this.externalFileRequestTimes.shift();
    }
    if (this.externalFileTransfersInFlight >= EXTERNAL_FILE_MAX_CONCURRENCY) {
      throw new Error("外部文件传输并发请求过多，请稍后重试");
    }
    if (this.externalFileRequestTimes.length >= EXTERNAL_FILE_RATE_LIMIT) {
      throw new Error("外部文件传输请求过于频繁，请稍后重试");
    }
    this.externalFileRequestTimes.push(now);
  }

  private async handleInternalRequestFile(
    requestId: string,
    args: any,
    signal?: AbortSignal
  ) {
    const distStore = useVcpDistributedStore();
    if (!distStore.config.externalFileTransferEnabled) {
      throw new Error("当前节点已关闭 VCP 外部文件传输能力");
    }

    this.assertExternalFileRateLimit();
    this.externalFileTransfersInFlight += 1;
    try {
      const filePath = this.parseLocalFileUrl(args.fileUrl);
      const inspection = await inspectFileForExternalTransfer(filePath);
      let approvalGranted = inspection.policy === "allow";

      if (inspection.policy === "approve") {
        const toolCallingStore = useToolCallingStore();
        const approvalRequest = {
          requestId,
          toolId: "vcp-external-file-transfer",
          methodName: "read_file",
          toolName: "VCP 外部文件传输",
          rawBlock: JSON.stringify(
            {
              serverId: this.serverId,
              requestId,
              path: inspection.normalizedPath,
              size: inspection.size,
              mimeType: inspection.mimeType,
            },
            null,
            2
          ),
          args: {
            serverId: this.serverId,
            requestId,
            path: inspection.normalizedPath,
            size: inspection.size,
            mimeType: inspection.mimeType,
          },
        };
        // 该审批处于 execute_tool 的 120 秒分布式传输窗口内，必须使用略短的
        // 显式协议超时；它不跟随普通工具审批的“无限等待”用户偏好。
        const result = await toolCallingStore.requestApproval(
          `vcp-file-transfer:${this.serverId}`,
          approvalRequest as any,
          requestId,
          { signal, timeoutMs: DISTRIBUTED_TOOL_TIMEOUT_MS }
        );
        approvalGranted = result === "approved";
        if (!approvalGranted) throw new Error("用户拒绝了外部文件传输请求");
      }

      const result = await readFileForExternalTransfer({
        path: filePath,
        source: { type: "vcp", serverId: this.serverId, requestId },
        approvalGranted,
      });

      this.sendToolResult({
        requestId,
        status: "success",
        result: {
          status: "success",
          fileData: result.fileData,
          mimeType: result.mimeType,
          size: result.size,
        },
      });
    } finally {
      this.externalFileTransfersInFlight -= 1;
    }
  }
}
