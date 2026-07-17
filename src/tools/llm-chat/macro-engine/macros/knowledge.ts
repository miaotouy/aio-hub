import type { MacroDefinition, MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import {
  parseKnowledgePlaceholder,
  serializeKnowledgePlaceholder,
  type KnowledgePlaceholder,
} from "../../core/context-processors/knowledge-placeholder";

function parseNamedArgs(
  args: string[] | undefined
): Omit<KnowledgePlaceholder, "raw" | "messageIndex"> {
  if (!args?.length) return {};
  const parsed = parseKnowledgePlaceholder(
    `【knowledge::${args.join("::")}】`,
    -1
  );
  const { raw: _raw, messageIndex: _messageIndex, ...options } = parsed;
  return options;
}

export function registerKnowledgeMacros(registry: MacroRegistry): void {
  const macros: MacroDefinition[] = [
    {
      name: "knowledge",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description:
        "生成已启用资料绑定的 Knowledge 占位符；参数使用 library=<资料库 ID> 等命名形式。",
      example: "{{knowledge}}",
      acceptsArgs: true,
      priority: 90,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        const config = context.agent?.knowledgeConfig;
        if (!config?.enabled) return "";
        const options = parseNamedArgs(args);
        const bindings = config.bindings.filter((binding) => binding.enabled);
        const selected = options.library
          ? bindings.filter((binding) => binding.libraryId === options.library)
          : bindings;
        if (options.library && !selected.length)
          return `（未找到资料库: ${options.library}）`;
        return selected
          .map((binding) =>
            serializeKnowledgePlaceholder({
              library: binding.libraryId,
              strategy: options.strategy ?? binding.strategy,
              limit: options.limit ?? binding.limit,
              minScore: options.minScore ?? binding.minScore,
              when: options.when ?? "always",
              citation: options.citation ?? binding.citation,
            })
          )
          .join("\n");
      },
    },
    {
      name: "knowledge_list",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "列出当前智能体已启用的资料库绑定。",
      example: "{{knowledge_list}}",
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context) => {
        const bindings =
          context.agent?.knowledgeConfig?.bindings.filter(
            (binding) => binding.enabled
          ) ?? [];
        if (!bindings.length) return "未启用任何资料库。";
        return bindings
          .map(
            (binding) =>
              `- [${binding.libraryName}] ID=${binding.libraryId}，strategy=${binding.strategy ?? "auto"}`
          )
          .join("\n");
      },
    },
  ];
  registry.registerMany(macros);
}
