// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { createModuleLogger } from "../../../../utils/logger";
import type { TokenCalculationScope } from "../../../token-calculator/core/messageTokenCalculator";

/** Execution-owned diagnostics and scoped token calculation. No host is loaded here. */
export type ContextLogger = Pick<
  ReturnType<typeof createModuleLogger>,
  "debug" | "info" | "warn" | "error"
>;
export type ContextTokenCalculator = TokenCalculationScope;
export interface ContextTokenPorts {
  logger: ContextLogger;
  getContextTokenCalculator(
    context: import("../../types/pipeline").PipelineContext
  ): ContextTokenCalculator;
}

export interface ContextServicePorts {
  logger: ContextLogger;
  errorHandler: Pick<
    ReturnType<
      (typeof import("../../../../utils/errorHandler"))["createModuleErrorHandler"]
    >,
    "handle"
  >;
}
