// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { tokenCalculatorService } from "@/tools/token-calculator/token-calculator.registry";
import type { PipelineContext } from "../../types/pipeline";

type TokenScope = ReturnType<typeof tokenCalculatorService.createScope>;
const SCOPE_KEY = "contextTextTokenCalculationScope";

/** The context owns reuse, including across development-time module replacements. */
export function getContextTokenCalculator(context: PipelineContext): TokenScope {
  let scope = context.sharedData.get(SCOPE_KEY) as TokenScope | undefined;
  if (!scope) {
    scope = tokenCalculatorService.createScope();
    context.sharedData.set(SCOPE_KEY, scope);
  }
  return scope;
}
