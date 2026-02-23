import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { toolRegistryManager } from "@/services/registry";
import { invoke } from "@tauri-apps/api/core";
import type { VcpToolManifest, ExecuteToolRequest, ToolResultResponse, ReportIpData } from "../types/distributed";

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

      // 1. 解析 toolName (格式通常是 toolId:methodName)
      const [toolId, methodName] = toolName.includes(":") ? toolName.split(":") : [toolName, ""];

      if (!toolId || !methodName) {
        throw new Error(`Invalid tool name format: ${toolName}. Expected toolId:methodName`);
      }

      // 2. 获取工具注册表
      const registry = toolRegistryManager.getRegistry(toolId);
      if (!registry) {
        throw new Error(`Tool registry not found: ${toolId}`);
      }

      // 3. 校验权限 (distributedExposed)
      const metadata = registry.getMetadata?.();
      const method = metadata?.methods.find((m) => m.name === methodName);

      if (!method || !method.distributedExposed) {
        throw new Error(`Method ${methodName} is not exposed for distributed calling in tool ${toolId}`);
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
