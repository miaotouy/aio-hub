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
  ];

  registry.registerMany(toolMacros);
}