import type { MacroDefinition, MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import {
  formatKnowledgeLibraryDirectory,
  listAuthorizedKnowledgeLibraries,
} from "@/tools/knowledge-base/services/access";

export function registerKnowledgeMacros(registry: MacroRegistry): void {
  const macros: MacroDefinition[] = [
    {
      name: "knowledge_list",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description:
        "在当前位置列出当前智能体获授权访问的 Knowledge 资料库；不会执行检索。",
      example: "{{knowledge_list}}",
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: async (context) => {
        const libraries = await listAuthorizedKnowledgeLibraries(
          context.agent?.knowledgeAccess
        );
        return formatKnowledgeLibraryDirectory(libraries);
      },
    },
  ];
  registry.registerMany(macros);
}
