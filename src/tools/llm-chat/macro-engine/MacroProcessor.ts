// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { MacroRegistry } from "./MacroRegistry";
import { createMacroProcessorClass } from "./runtime/processor";
export type {
  MacroValidationResult,
  MacroProcessResult,
  MacroExecution,
} from "./runtime/processor";

export const MacroProcessor = createMacroProcessorClass({
  logger: createModuleLogger("llm-chat/macro-processor"),
  errorHandler: createModuleErrorHandler("llm-chat/macro-processor"),
  getRegistry: () => MacroRegistry.getInstance(),
});
export type MacroProcessor = InstanceType<typeof MacroProcessor>;
