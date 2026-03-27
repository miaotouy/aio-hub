export interface VcpDistributedConfig {
  /** 节点友好名称 */
  serverName: string;
  /** 手动指定的额外暴露工具 ID 列表 */
  exposedToolIds: string[];
  /** 被禁用（排除）的工具 ID 列表 */
  disabledToolIds: string[];
  /** 是否自动发现并注册所有 AI 工具 (agentCallable) */
  autoRegisterTools: boolean;
  /** 是否开启桥接 VCP 工具功能 */
  enableBridge: boolean;
  /** 被禁用的桥接工具/命令 ID 列表 (格式: toolName 或 toolName:command) */
  disabledBridgeToolIds: string[];
}

export interface VcpToolManifest {
  name: string; // 对应 AIO 的 toolId:methodName
  displayName: string; // 用于 UI 显示的友好名称
  description: string;
  parameters: any; // JSON Schema
  pluginType: "tool" | "static" | "service" | "hybridservice";
  entryPoint: {
    script?: string;
    command?: string;
  };
  communication?: {
    protocol: "stdio" | "http" | "direct";
  };
  capabilities?: {
    invocationCommands?: Array<{
      command: string;
      description: string;
      example: string;
    }>;
  };
  isInternal?: boolean; // 是否为内部工具（基础设施）
}

export interface VcpNodeStatus {
  nodeId: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  lastHeartbeat?: number;
  exposedTools: VcpToolManifest[];
}

export interface VcpDistributedMessage {
  type:
    | "register_tools"
    | "register_tools_ack"
    | "execute_tool"
    | "tool_result"
    | "report_ip"
    | "update_static_placeholders"
    | "get_vcp_manifests"
    | "vcp_manifest_response"
    | "execute_vcp_tool"
    | "vcp_tool_result"
    | "vcp_tool_status"
    | "tool_approval_request"
    | "tool_approval_response"
    | "connection_ack"
    | "assign_node_id";
  data: any;
}

/** VCP -> AIO: 远程工具执行状态（进度更新） */
export interface VcpToolStatusData {
  taskId: string;
  bridgeType: "log" | "info";
  content?: string;
  status?: string;
  progress?: number;
  job_id?: string;
  tool_name?: string;
  [key: string]: any;
}

/** VCP 侧返回的插件清单（来自 VCPToolBridge 插件） */
export interface VcpBridgeManifest {
  name: string; // 插件 ID (e.g. "FileOperator")
  displayName: string; // 插件显示名
  description: string; // 插件描述
  /** 插件配置定义 (映射到 AIO 的 settingsSchema) */
  configSchema?: Record<string, { type: string; description: string; default?: any }>;
  capabilities: {
    invocationCommands: VcpBridgeCommand[];
  };
}

/** VCP 插件暴露的单个命令 */
export interface VcpBridgeCommand {
  command?: string; // 命令名称 (e.g. "ReadFile")
  commandIdentifier?: string; // 兼容 VCP 原始 manifest 中的字段名
  displayName?: string; // 显示名称
  description: string; // 命令描述
  parameters?: any; // JSON Schema 格式的参数描述
  example?: string; // 调用示例
}

/** VCP -> AIO: 清单响应 */
export interface VcpManifestsResponse {
  plugins: VcpBridgeManifest[];
  vcpVersion?: string;
}

/** AIO -> VCP: 执行远程工具请求 */
export interface ExecuteVcpToolRequest {
  requestId: string;
  toolName: string; // VCP 插件名 (e.g. "FileOperator")
  toolArgs: Record<string, any>; // 包含 command 和参数
}

/** VCP -> AIO: 远程工具执行结果 */
export interface VcpToolExecutionResult {
  requestId: string;
  status: "success" | "error";
  result?: any;
  error?: string;
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

/** VCP -> AIO: 工具调用批准请求 */
export interface VcpToolApprovalRequest {
  requestId: string;
  toolName: string;
  maid: string;
  args: Record<string, any>;
  timestamp: string;
}

/** AIO -> VCP / VCP -> AIO: 工具调用批准响应 */
export interface VcpToolApprovalResponse {
  requestId: string;
  approved: boolean;
}
