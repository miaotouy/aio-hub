/**
 * 知识库相关宏
 * 提供 {{kb}} 和 {{kb_list}} 宏，用于简化知识库检索的注入
 */

import type { MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import type { MacroDefinition } from "../MacroRegistry";

/**
 * 注册知识库宏
 */
export function registerKnowledgeMacros(registry: MacroRegistry): void {
  const knowledgeMacros: MacroDefinition[] = [
    {
      name: "kb",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description:
        "触发知识库检索并注入结果。无参数时检索所有已启用的关联知识库；可指定知识库名称和召回上限。",
      example: "{{kb}}",
      acceptsArgs: true,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        const agent = context.agent;
        const kbConfig = agent?.knowledgeBaseConfig;

        // 如果没有配置或未启用，返回空
        if (!kbConfig?.enabled) {
          return "";
        }

        const enabledBindings = kbConfig.bindings.filter((b) => b.enabled);
        if (enabledBindings.length === 0) {
          return "";
        }

        // 解析参数: {{kb::name::limit}}
        const targetName = args?.[0];
        const limitOverride = args?.[1] ? parseInt(args[1]) : undefined;

        // 如果指定了名称，只生成该知识库的占位符
        if (targetName) {
          const binding = enabledBindings.find((b) => b.kbName === targetName);
          if (!binding) {
            return `（未找到知识库: ${targetName}）`;
          }
          return buildPlaceholder(binding, limitOverride);
        }

        // 未指定名称，生成所有已启用知识库的占位符
        return enabledBindings
          .map((b) => buildPlaceholder(b, limitOverride))
          .join("\n");
      },
    },
    {
      name: "kb_list",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "列出当前智能体关联的知识库信息（供 LLM 感知可用知识源）",
      example: "{{kb_list}}",
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context) => {
        const agent = context.agent;
        const kbConfig = agent?.knowledgeBaseConfig;

        if (!kbConfig?.enabled) {
          return "未配置知识库。";
        }

        const enabledBindings = kbConfig.bindings.filter((b) => b.enabled);
        if (enabledBindings.length === 0) {
          return "未启用任何知识库。";
        }

        let output = `可用知识库 (${enabledBindings.length} 个):\n`;
        enabledBindings.forEach((binding) => {
          const mode = binding.mode || "always";
          output += `- [${binding.kbName}] 模式=${mode}`;
          if (binding.limit) output += `, 上限=${binding.limit}`;
          if (binding.group) output += `, 分组=${binding.group}`;
          output += "\n";
        });

        return output.trim();
      },
    },
  ];

  registry.registerMany(knowledgeMacros);
}

/**
 * 根据 binding 配置生成对应的【kb】占位符
 */
function buildPlaceholder(
  binding: {
    kbName: string;
    limit?: number;
    minScore?: number;
    mode?: string;
    modeParams?: string[];
  },
  limitOverride?: number
): string {
  const parts: string[] = [];

  // 位置 0: kbName
  parts.push(binding.kbName);

  // 位置 1: limit
  const limit = limitOverride ?? binding.limit;
  parts.push(limit?.toString() || "");

  // 位置 2: minScore
  parts.push(binding.minScore?.toFixed(2) || "");

  // 位置 3: mode
  parts.push(binding.mode || "always");

  // 位置 4: modeParams
  if (binding.modeParams && binding.modeParams.length > 0) {
    parts.push(binding.modeParams.join(","));
  } else {
    parts.push("");
  }

  // 位置 5: engineId (预留位置给 KnowledgeProcessor 解析器)
  parts.push("");

  // 从末尾裁剪默认值
  while (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last === "" || last === "always") {
      parts.pop();
    } else {
      break;
    }
  }

  if (parts.length === 0) {
    return `【kb::${binding.kbName}】`;
  }

  return `【kb::${parts.join("::")}】`;
}
