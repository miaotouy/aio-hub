// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { buildMacroContext, processMacros } from "../context-utils/macro";
import { MacroProcessor } from "@/tools/llm-chat/macro-engine";
import { resolvePresetAttachments } from "../context-utils/preset-attachment-resolver";
import { freezeDatetimeDisplay } from "../../macro-engine/macros/datetime";
import { createInjectionAssembler } from "../pipeline/processors/injection-assembler";

export const injectionAssembler = createInjectionAssembler({
  logger: createModuleLogger("primary:injection-assembler"),
  createMacroProcessor: () => new MacroProcessor(),
  buildMacroContext,
  processMacros,
  freezeDatetimeDisplay,
  resolvePresetAttachments,
});
