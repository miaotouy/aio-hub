import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { toolRegistryManager } from "@/services/registry";
import { invoke } from "@tauri-apps/api/core";
import { useVcpDistributedStore } from "../stores/vcpDistributedStore";
import { vcpBridgeFactory } from "./VcpBridgeFactory";
import type {
  VcpToolManifest,
  ExecuteToolRequest,
  ToolResultResponse,
  ReportIpData,
  VcpManifestsResponse,
  VcpToolExecutionResult,
} from "../types/distributed";

const logger = createModuleLogger("vcp-connector/node-protocol");
const errorHandler = createModuleErrorHandler("vcp-connector/node-protocol");

export class VcpNodeProtocol {
  constructor(private sendJson: (data: any) => void) {}

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
      data: response,
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
  public async handleExecuteTool(request: ExecuteToolRequest) {
    const { requestId, toolName, toolArgs } = request;
    logger.info(`Executing tool: ${toolName}`, { requestId, toolArgs });

    try {
      // 0. 特殊处理内置工具：internal_request_file
      if (toolName === "internal_request_file") {
        await this.handleInternalRequestFile(requestId, toolArgs);
        return;
      }

      // 1. 解析 toolName 和 methodName
      // VCP 协议标准模式：tool_name 为工具 ID，command 在 toolArgs 中传递
      const rawToolId = toolName;
      const rawMethodName = (toolArgs?.command as string) || "";

      if (!rawToolId || !rawMethodName) {
        throw new Error(
          `Invalid tool call: toolName="${toolName}", command="${rawMethodName}". ` +
            `VCP protocol requires toolArgs.command to be provided.`,
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
          logger.debug(`Resolved toolId through hyphen conversion: ${rawToolId} -> ${toolId}`);
        }
      }

      if (!registry) {
        const availableTools = toolRegistryManager.getAllToolIds().join(", ");
        throw new Error(`工具 "${rawToolId}" 尚未注册。可用的工具: ${availableTools}`);
      }

      const methodName = rawMethodName;

      // 3. 校验权限 (检查是否在暴露名单中)
      const distStore = useVcpDistributedStore();
      const metadata = registry.getMetadata?.();
      const method = metadata?.methods.find((m) => m.name === methodName);

      if (!method) {
        throw new Error(`Method ${methodName} not found in tool ${toolId}`);
      }

      // 校验逻辑必须与 ExposedToolsList.vue 保持一致
      // 注意：store 中的 fullId 依然使用冒号分隔符，这里需要保持一致
      const fullId = `${toolId}:${methodName}`;
      const isAutoRegister = distStore.config.autoRegisterTools;
      const isDisabled = (distStore.config.disabledToolIds || []).includes(fullId);
      const isManuallyExposed = (distStore.config.exposedToolIds || []).includes(fullId);

      // 判定是否允许暴露：
      // A. 是自动发现的 AI 工具且未被禁用
      // B. 是手动添加的工具
      const isAllowed = (isAutoRegister && method.agentCallable && !isDisabled) || isManuallyExposed;

      if (!isAllowed) {
        throw new Error(`Method ${methodName} in tool ${toolId} is not exposed or is disabled for distributed calling`);
      }

      // 4. 执行工具
      // 注意：这里假设 registry 实例上有对应的 methodName 方法
      // 在 AIO 架构中，通常 registry 就是服务本身
      const service = registry as any;
      if (typeof service[methodName] !== "function") {
        throw new Error(`Method ${methodName} not implemented in tool ${toolId}`);
      }

      const result = await service[methodName](toolArgs);

      // 5. 回传成功结果
      this.sendToolResult({
        requestId,
        status: "success",
        result,
      });
    } catch (error: any) {
      errorHandler.error(error, "Tool execution failed", { context: { requestId, toolName } });

      // 6. 回传错误
      this.sendToolResult({
        requestId,
        status: "error",
        error: error.message || String(error),
      });
    }
  }

  /**
   * 处理内置文件请求工具
   */
  private async handleInternalRequestFile(requestId: string, args: any) {
    const fileUrl = args.fileUrl as string;
    if (!fileUrl) throw new Error("Missing fileUrl in internal_request_file");

    // 移除 file:/// 前缀
    const filePath = fileUrl.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");

    logger.info(`Handling internal_request_file: ${filePath}`);

    // 1. 读取文件为 Base64
    const fileData = await invoke<string>("read_file_as_base64", { path: filePath });

    // 2. 检测 MIME 类型 (使用后端能力)
    const mimeType = await invoke<string>("get_file_mime_type", { path: filePath });

    // 3. 回传结果
    this.sendToolResult({
      requestId,
      status: "success",
      result: {
        fileData,
        mimeType,
      },
    });
  }
}
