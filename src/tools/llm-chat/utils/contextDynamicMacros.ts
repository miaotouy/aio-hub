// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { MacroProcessor } from "../macro-engine/MacroProcessor";
import { MacroRegistry } from "../macro-engine/MacroRegistry";
import type { ProcessableMessage } from "../types/context";

// VCPToolBox/modules/messageProcessor.js expands these placeholders upstream.
const VCP_DYNAMIC_MACROS = new Set([
  "Time",
  "Date",
  "Today",
  "Festival",
  "VCPDynamicTools",
]);
type MacroMessage = Pick<
  ProcessableMessage,
  "content" | "sourceType" | "_originalContent"
> & {
  _mergedSources?: readonly MacroMessage[];
};

/** Inspect retained templates without evaluating macros or mutating conversation variables. */
export function getContextDynamicMacros(message: MacroMessage): string[] {
  const registry = MacroRegistry.getInstance();
  const names = new Set<string>();
  function visit(source: MacroMessage) {
    if (source._mergedSources?.length) {
      source._mergedSources.forEach(visit);
      return;
    }
    // Historical text is literal; only pending input carries its expansion template.
    if (source.sourceType === "session_history" && !source._originalContent)
      return;
    const text =
      source._originalContent ??
      (typeof source.content === "string"
        ? source.content
        : source.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n"));
    for (const macro of MacroProcessor.extractMacros(text)) {
      if (
        registry.getMacro(macro.name)?.dynamic ||
        VCP_DYNAMIC_MACROS.has(macro.name)
      )
        names.add(macro.name);
    }
  }
  visit(message);
  return [...names];
}
