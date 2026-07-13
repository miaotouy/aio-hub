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
      description:
        "注入当前 Agent 可用工具定义。支持通过参数指定工具 ID 列表（无视启用开关）",
      example: "{{tools::toolId1::toolId2}}",
      acceptsArgs: true,
      priority: 95,
      supported: true,
      contextFree: false,
      execute: async (context, args) => {
        const config = context.agent?.toolCallConfig;
        const includeToolIds =
          args && args.length > 0
            ? args.map((a) => a.trim()).filter(Boolean)
            : undefined;

        if (
          !config?.enabled &&
          (!includeToolIds || includeToolIds.length === 0)
        ) {
          return "";
        }

        return toolDiscovery.generatePrompt({
          protocol: config?.protocol || "vcp",
          config: config || ({} as any),
          agentId: context.agent?.id,
          includeToolIds,
        });
      },
    },
    {
      name: "tool_usage",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "注入当前工具调用协议的使用说明（如 VCP 格式说明）",
      example: "{{tool_usage}}",
      acceptsArgs: false,
      priority: 92,
      supported: true,
      contextFree: false,
      execute: async (context) => {
        const config = context.agent?.toolCallConfig;
        return toolDiscovery.getInstructions(config?.protocol || "vcp");
      },
    },
    {
      name: "tool_context",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description:
        "注入当前已启用工具的实时运行时上下文。支持通过参数指定工具 ID 列表",
      example: "{{tool_context::toolId1}}",
      acceptsArgs: true,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: async (context, args) => {
        const toolConfig = context.agent?.toolCallConfig;
        const extensionConfig = context.agent?.extensionConfig;
        const includeToolIds =
          args && args.length > 0
            ? args.map((a) => a.trim()).filter(Boolean)
            : undefined;

        const toolsEnabled =
          toolConfig?.enabled || (includeToolIds && includeToolIds.length > 0);
        const extensionsEnabled = extensionConfig?.enabled;

        if (!toolsEnabled && !extensionsEnabled) {
          return "";
        }

        return toolDiscovery.getAgentContexts({
          toolConfig: toolConfig || ({} as any),
          extensionConfig,
          agentId: context.agent?.id,
          includeToolIds,
        });
      },
    },
  ];

  registry.registerMany(toolMacros);
}
