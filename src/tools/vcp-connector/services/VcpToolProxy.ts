import type { ToolRegistry, ServiceMetadata, MethodParameter } from "@/services/types";
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

  private bridgeCommands: VcpBridgeCommand[];
  private executeRemote: VcpRemoteExecuteFn;

  constructor(manifest: VcpBridgeManifest, executeFn: VcpRemoteExecuteFn, disabledIds: string[] = []) {
    // 使用 vcp: 前缀，防止 ID 冲突
    this.id = `vcp:${manifest.name}`;
    this.name = manifest.displayName || manifest.name;
    this.description = manifest.description || `VCP 桥接工具: ${this.name}`;
    this.executeRemote = executeFn;

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
   * 由于 VCP 插件的参数元数据可能不完整，这里进行启发式解析或使用默认参数
   */
  private parseParameters(cmd: VcpBridgeCommand): MethodParameter[] {
    if (cmd.parameters) {
      // 如果有 JSON Schema，可以进行转换（此处简化处理）
      // 实际应用中可以根据 schema 动态生成参数列表
      return [];
    }

    // 默认提供一个通用的参数对象，或者根据 description 尝试提取
    // 在 VCP 协议中，LLM 通常会根据 description 自行构造键值对
    return [];
  }
}
