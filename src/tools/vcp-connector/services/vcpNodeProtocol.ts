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

function stripProtocolArgs(args: Record<string, any>): Record<string, any> {
  const {
    command: _command,
    commandName: _commandName,
    command_name: _command_name,
    toolCommand: _toolCommand,
    tool_command: _tool_command,
    ...cleanArgs
  } = args;
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
   * AIO -> VCP: 更新静态占位符 (update_static_placeholders)
   */
  public sendUpdateStaticPlaceholders(placeholders: Record<string, string>) {
    this.sendJson({
      type: "update_static_placeholders",
      data: { placeholders },
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
        await this.handleInternalRequestFile(requestId, toolArgs);
        return;
      }

      // 1. 解析 toolName 和 methodName
      // VCP 协议标准模式：tool_name 为工具 ID，command 在 toolArgs 中传递
      const rawToolId = toolName;
      const rawMethodName = resolveCommandName(toolArgs);

      if (!rawToolId || !rawMethodName) {
        throw new Error(
          `Invalid tool call: toolName="${toolName}", command="${rawMethodName}". ` +
            `VCP protocol requires toolArgs.command to be provided.`
        );
      }

      logger.debug(`Executing VCP tool: ${rawToolId}.${rawMethodName}`);

      // 2. 规范化并获取工具注册表
      // 分布式协议会将连字符转为下划线，这里需要尝试转回连字符格式
      let toolId = rawToolId;
      let registry = null;

      if (toolRegistryManager.hasTool(toolId)) {
        registry = toolRegistryManager.getRegistry(toolId);
      } else {
        // 尝试将下划线还原为连字符 (例如 directory_tree -> directory-tree)
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

      const methodName = rawMethodName;

      // 3. 校验权限 (检查是否在暴露名单中)
      const distStore = useVcpDistributedStore();
      const metadata = registry.getMetadata?.();
      const method = metadata?.methods.find(
        (m) =>
          m.name === methodName ||
          m.protocolConfig?.vcpCommand?.trim() === methodName
      );

      if (!method) {
        throw new Error(`Method ${methodName} not found in tool ${toolId}`);
      }

      const resolvedMethodName = method.name;

      // 校验逻辑必须与 ExposedToolsList.vue 保持一致
      // 注意：store 中的 fullId 依然使用冒号分隔符，这里需要保持一致
      const fullId = `${toolId}:${resolvedMethodName}`;
      const isAutoRegister = distStore.config.autoRegisterTools;
      const isDisabled = (distStore.config.disabledToolIds || []).includes(
        fullId
      );
      const isManuallyExposed = (
        distStore.config.exposedToolIds || []
      ).includes(fullId);

      // 判定是否允许暴露：
      // A. 是自动发现的 AI 工具且未被禁用
      // B. 是手动添加的工具
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

      // 4. 执行工具
      // 注意：这里假设 registry 实例上有对应的 methodName 方法
      // 在 AIO 架构中，通常 registry 就是服务本身
      const service = registry as any;
      if (typeof service[resolvedMethodName] !== "function") {
        throw new Error(
          `Method ${resolvedMethodName} not implemented in tool ${toolId}`
        );
      }

      const cleanArgs = stripProtocolArgs(toolArgs);
      const context: ToolContext = {
        isAsync: false,
        requestId,
        signal: abortController.signal,
        reportStatus: (message: string) => {
          logger.debug(`Distributed tool progress: ${toolId}`, {
            requestId,
            methodName: resolvedMethodName,
            message,
          });
        },
      };

      const result = await withDistributedTimeout(
        Promise.resolve(service[resolvedMethodName](cleanArgs, context)),
        `${toolId}.${resolvedMethodName}`,
        () => abortController.abort()
      );

      // 5. 回传成功结果
      this.sendToolResult({
        requestId,
        status: "success",
        result,
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

  private async handleInternalRequestFile(requestId: string, args: any) {
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
        const result = await withDistributedTimeout(
          toolCallingStore.requestApproval(
            `vcp-file-transfer:${this.serverId}`,
            approvalRequest as any,
            requestId
          ),
          "VCP 文件传输审批"
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
