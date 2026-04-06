import { createToolDiscoveryService } from "@/tools/tool-calling/core/discovery";
import type { MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import type { MacroDefinition } from "../MacroRegistry";

const toolDiscovery = createToolDiscoveryService();

export function registerToolMacros(registry: MacroRegistry): void {
  const toolMacros: MacroDefinition[] = [
    {
      name: "tools",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "注入当前 Agent 可用工具定义（协议格式）",
      example: "{{tools}}",
      acceptsArgs: false,
      priority: 95,
      supported: true,
      contextFree: false,
      execute: async (context) => {
        const config = context.agent?.toolCallConfig;
        if (!config?.enabled) {
          return "";
        }

        return toolDiscovery.generatePrompt({
          protocol: config.protocol || "vcp",
          config,
          agentId: context.agent?.id,
        });
      },
    },
    {
      name: "tool_context",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "注入当前已启用工具的实时运行时上下文（如影子文件状态）",
      example: "{{tool_context}}",
      acceptsArgs: false,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: async (context) => {
        const config = context.agent?.toolCallConfig;
        if (!config?.enabled) {
          return "";
        }

        return toolDiscovery.getToolContexts({
          config,
          agentId: context.agent?.id,
        });
      },
    },
  ];

  registry.registerMany(toolMacros);
}
