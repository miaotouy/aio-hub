// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { tokenCalculatorService } from "@/tools/token-calculator/token-calculator.registry";
import type { AttachmentLike } from "../../types/pipeline-attachment";
import type { PipelineContext } from "../../types/pipeline";

import {
  calculateTokensWithImageSlicing,
  getContextImageSlicingOptions,
} from "./image-slicing";

type TokenScope = ReturnType<typeof tokenCalculatorService.createScope>;
const SCOPE_KEY = "contextTextTokenCalculationScope";

/** The context owns reuse, including across development-time module replacements. */
export function getContextTokenCalculator(
  context: PipelineContext
): TokenScope {
  let scope = context.sharedData.get(SCOPE_KEY) as TokenScope | undefined;
  if (!scope) {
    const base = tokenCalculatorService.createScope();
    scope = {
      ...base,
      calculateMessageTokens: (text, modelId, attachments, options) =>
        calculateTokensWithImageSlicing(
          base,
          text,
          modelId,
          attachments as AttachmentLike[] | undefined,
          context.settings?.requestSettings?.longImageSlicing,
          options,
          getContextImageSlicingOptions(context)
        ),
    };
    context.sharedData.set(SCOPE_KEY, scope);
  }
  return scope;
}
