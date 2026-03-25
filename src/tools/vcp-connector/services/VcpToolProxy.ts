import type { ToolRegistry, ServiceMetadata, MethodParameter } from "@/services/types";
import type { SettingItem, BuiltinSettingComponent } from "@/types/settings-renderer";
import type { VcpBridgeManifest, VcpBridgeCommand } from "../types/distributed";

export type VcpRemoteExecuteFn = (pluginId: string, command: string, args: Record<string, any>) => Promise<any>;

/**
 * VCP 工具代理类
 * 将一个 VCP 插件映射为一个 AIO ToolRegistry 实例
 */
export class VcpToolProxy implements ToolRegistry {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly settingsSchema?: SettingItem<any>[];

  private bridgeCommands: VcpBridgeCommand[];
  private executeRemote: VcpRemoteExecuteFn;

  constructor(manifest: VcpBridgeManifest, executeFn: VcpRemoteExecuteFn, disabledIds: string[] = []) {
    // 使用 vcp: 前缀，防止 ID 冲突
    this.id = `vcp:${manifest.name}`;
    this.name = manifest.displayName || manifest.name;
    this.description = manifest.description || `VCP 桥接工具: ${this.name}`;
    this.executeRemote = executeFn;

    // 映射 configSchema 到 settingsSchema
    if (manifest.configSchema) {
      this.settingsSchema = Object.entries(manifest.configSchema).map(([key, schema]) => {
        const type = schema.type?.toLowerCase();
        let component: BuiltinSettingComponent = "ElInput";

        if (type === "boolean") component = "ElSwitch";
        else if (type === "number" || type === "integer") component = "ElInputNumber";

        return {
          id: `${this.id}:${key}`,
          component,
          label: key,
          modelPath: key,
          hint: schema.description || "",
          keywords: key,
          defaultValue: schema.default,
        };
      });
    }

    // 过滤掉被禁用的命令
    const allCommands = manifest.capabilities?.invocationCommands || [];
    this.bridgeCommands = allCommands.filter((cmd) => {
      const fullId = `${manifest.name}:${cmd.command}`;
      return !disabledIds.includes(fullId);
    });

    // 动态挂载方法到实例上，供 ToolRegistryManager 调用
    for (const cmd of this.bridgeCommands) {
      const methodName = cmd.command;
      (this as any)[methodName] = async (args: Record<string, any>) => {
        return this.executeRemote(manifest.name, methodName, args);
      };
    }
  }

  /**
   * 提供工具元数据，供 LLM Agent 发现
   */
  public getMetadata(): ServiceMetadata {
    return {
      methods: this.bridgeCommands.map((cmd) => ({
        name: cmd.command,
        displayName: cmd.displayName || cmd.command,
        description: cmd.description,
        parameters: this.parseParameters(cmd),
        returnType: "Promise<any>",
        example: cmd.example,
        agentCallable: true, // 桥接工具默认允许 Agent 调用
        distributedExposed: false, // 禁止循环暴露回 VCP
      })),
    };
  }

  /**
   * 解析 VCP 命令参数
   * 由于 VCP 插件的参数元数据可能不完整，这里进行启发式解析
   */
  private parseParameters(cmd: VcpBridgeCommand): MethodParameter[] {
    // 1. 如果有显式的参数定义，优先使用
    if (cmd.parameters && typeof cmd.parameters === "object") {
      // 如果是符合 AIO 格式的数组，直接返回
      if (Array.isArray(cmd.parameters)) {
        return cmd.parameters;
      }
      // 如果是 JSON Schema 格式，尝试简单转换
      if (cmd.parameters.properties) {
        return Object.entries(cmd.parameters.properties).map(([name, prop]: [string, any]) => ({
          name,
          type: prop.type || "string",
          description: prop.description,
          required: Array.isArray(cmd.parameters.required) ? cmd.parameters.required.includes(name) : true,
        }));
      }
    }

    // 2. 启发式解析：从描述中提取参数
    // 匹配模式：- 参数名 (类型, 必需/可选): 描述
    // 例如：- SearchTopic (字符串, 必需): 检索的目标主题
    const parameters: MethodParameter[] = [];
    const lines = cmd.description.split("\n");
    const paramRegex = /[-*]\s*([a-zA-Z0-9_-]+)\s*\(([^)]+)\):\s*(.*)/;

    for (const line of lines) {
      const match = line.match(paramRegex);
      if (match) {
        const [, name, typeAndRequired, description] = match;
        const isRequired = typeAndRequired.includes("必需") || typeAndRequired.includes("必需");
        let type = "string";

        if (typeAndRequired.includes("布尔") || typeAndRequired.includes("boolean")) type = "boolean";
        else if (
          typeAndRequired.includes("数字") ||
          typeAndRequired.includes("number") ||
          typeAndRequired.includes("整数")
        )
          type = "number";
        else if (typeAndRequired.includes("数组") || typeAndRequired.includes("array")) type = "array";
        else if (typeAndRequired.includes("对象") || typeAndRequired.includes("object")) type = "object";

        parameters.push({
          name: name.trim(),
          type,
          description: description.trim(),
          required: isRequired,
        });
      }
    }

    return parameters;
  }
}
