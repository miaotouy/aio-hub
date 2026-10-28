// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { tokenCalculatorService } from "@/tools/token-calculator/token-calculator.registry";
import type { PipelineContext } from "../../types/pipeline";

const scopes = new WeakMap<
  PipelineContext,
  ReturnType<typeof tokenCalculatorService.createScope>
>();

/** One calculation scope follows the context through processors and preview assembly. */
export function getContextTokenCalculator(context: PipelineContext) {
  let scope = scopes.get(context);
  if (!scope) {
    scope = tokenCalculatorService.createScope();
    scopes.set(context, scope);
  }
  return scope;
}
