// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ContextProcessor } from "../../types/pipeline";

export interface ContextProcessors {
  sessionLoader: ContextProcessor;
  regexProcessor: ContextProcessor;
  injectionAssembler: ContextProcessor;
  recallProcessor: ContextProcessor;
  transcriptionProcessor: ContextProcessor;
  worldbookProcessor: ContextProcessor;
  tokenLimiter: ContextProcessor;
  asyncTaskProcessor: ContextProcessor;
  variableProcessor: ContextProcessor;
  messageFormatter: ContextProcessor;
  assetResolver: ContextProcessor;
}

/** Initial registry order; selection and priority sorting stay with the execution owner. */
export function getContextProcessorList(
  p: ContextProcessors
): ContextProcessor[] {
  return [
    p.sessionLoader,
    p.regexProcessor,
    p.injectionAssembler,
    p.recallProcessor,
    p.transcriptionProcessor,
    p.worldbookProcessor,
    p.tokenLimiter,
    p.asyncTaskProcessor,
    p.variableProcessor,
    p.messageFormatter,
    p.assetResolver,
  ];
}
