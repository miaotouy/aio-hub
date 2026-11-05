// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createMacroProcessingFunctions } from "../../macro-engine/runtime/processing";
export type { MacroContextData } from "../../macro-engine/runtime/processing";

export const { buildMacroContext, processMacros, processMacrosBatch } =
  createMacroProcessingFunctions({
    logger: createModuleLogger("llm-chat/core/macro-processor"),
    errorHandler: createModuleErrorHandler("llm-chat/core/macro-processor"),
  });
