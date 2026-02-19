export interface VcpDistributedConfig {
  /** 节点友好名称 */
  serverName: string;
  /** 手动指定的暴露工具 ID 列表，若为空则根据 distributedExposed 自动发现 */
  exposedToolIds: string[];
  /** 是否自动注册所有标记为 distributedExposed 的工具 */
  autoRegisterTools: boolean;
}

export interface VcpToolManifest {
  name: string; // 对应 AIO 的 toolId:methodName
  description: string;
  parameters: any; // JSON Schema
}

export interface VcpNodeStatus {
  nodeId: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  lastHeartbeat?: number;
  exposedTools: VcpToolManifest[];
}

export interface VcpDistributedMessage {
  type: "register_tools" | "register_tools_ack" | "execute_tool" | "tool_result" | "report_ip" | "update_static_placeholders";
  data: any;
}

export interface ExecuteToolRequest {
  requestId: string;
  toolName: string;
  toolArgs: Record<string, any>;
}

export interface ToolResultResponse {
  requestId: string;
  status: "success" | "error";
  result?: any;
  error?: string;
}

export interface ReportIpData {
  localIPs: string[];
  publicIP: string;
  serverName: string;
}