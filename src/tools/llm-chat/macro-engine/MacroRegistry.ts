// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { reactive } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createMacroRegistryRuntime } from "./runtime/registry";
export { MacroPhase, MacroType } from "./runtime/definitions";
export type { MacroDefinition } from "./runtime/definitions";

export const { MacroRegistry, getMacroRegistry } = createMacroRegistryRuntime({
  logger: createModuleLogger("llm-chat/macro-registry"),
  wrapRegistryMap: (map) => reactive(map),
});
export type MacroRegistry = ReturnType<typeof getMacroRegistry>;
