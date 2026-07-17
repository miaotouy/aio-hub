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

import type { MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import type { MacroDefinition } from "../MacroRegistry";
import {
  parseRecallPlaceholder,
  serializeRecallPlaceholder,
  type RecallPlaceholder,
} from "../../core/context-processors/recall-placeholder";

function parseNamedArgs(
  args: string[] | undefined
): Omit<RecallPlaceholder, "raw" | "messageIndex"> {
  if (!args?.length) return {};
  const parsed = parseRecallPlaceholder(`【recall::${args.join("::")}】`, -1);
  const { raw: _raw, messageIndex: _messageIndex, ...options } = parsed;
  return options;
}

export function registerRecallMacros(registry: MacroRegistry): void {
  const macros: MacroDefinition[] = [
    {
      name: "recall",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description:
        "生成已启用思绪绑定的 Recall 占位符；参数使用 collection=<集合 ID> 等命名形式。",
      example: "{{recall}}",
      acceptsArgs: true,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        const config = context.agent?.recallConfig;
        if (!config?.enabled) return "";
        const options = parseNamedArgs(args);
        const bindings = config.bindings.filter((binding) => binding.enabled);
        const selected = options.collection
          ? bindings.filter(
              (binding) => binding.recallId === options.collection
            )
          : bindings;
        if (options.collection && !selected.length) {
          return `（未找到思绪集: ${options.collection}）`;
        }
        return selected
          .map((binding) => {
            const when = options.when ?? binding.when;
            return serializeRecallPlaceholder({
              collection: binding.recallId,
              profile: options.profile ?? binding.profile,
              limit: options.limit ?? binding.limit,
              minScore: options.minScore ?? binding.minScore,
              when,
              gateTags:
                when === "gate"
                  ? (options.gateTags ?? binding.whenParams)
                  : undefined,
              everyTurns:
                when === "turn"
                  ? (options.everyTurns ?? Number(binding.whenParams?.[0]))
                  : undefined,
              entries:
                when === "static"
                  ? (options.entries ?? binding.whenParams)
                  : undefined,
            });
          })
          .join("\n");
      },
    },
    {
      name: "recall_list",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "列出当前智能体已启用的思绪绑定。",
      example: "{{recall_list}}",
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context) => {
        const bindings =
          context.agent?.recallConfig?.bindings.filter(
            (binding) => binding.enabled
          ) ?? [];
        if (!bindings.length) return "未启用任何思绪集。";
        return bindings
          .map(
            (binding) =>
              `- [${binding.recallName}] ID=${binding.recallId}，profile=${binding.profile ?? "semantic"}`
          )
          .join("\n");
      },
    },
  ];
  registry.registerMany(macros);
}
