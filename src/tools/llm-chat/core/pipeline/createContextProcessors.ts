// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { getContextProcessorList } from "./processor-list";
import { createSessionLoader } from "./processors/session-loader";
import { createRegexProcessor } from "./processors/regex-processor";
import { createInjectionAssembler } from "./processors/injection-assembler";
import { createRecallProcessors } from "./processors/recall-processor";
import { createTranscriptionProcessor } from "./processors/transcription-processor";
import { createWorldbookProcessors } from "./processors/worldbook-processor";
import { createTokenLimiter } from "./processors/token-limiter";
import { createAsyncTaskProcessor } from "./processors/async-task-processor";
import { createVariableProcessor } from "./processors/variable-processor";
import { createMessageFormatters } from "./processors/message-format-processors";
import { createAssetResolver } from "./processors/asset-resolver";

export interface ContextProcessorServices {
  sessionLoader: Parameters<typeof createSessionLoader>[0];
  regexProcessor: Parameters<typeof createRegexProcessor>[0];
  injectionAssembler: Parameters<typeof createInjectionAssembler>[0];
  recallProcessor: Parameters<typeof createRecallProcessors>[0];
  transcriptionProcessor: Parameters<typeof createTranscriptionProcessor>[0];
  worldbookProcessor: Parameters<typeof createWorldbookProcessors>[0];
  tokenLimiter: Parameters<typeof createTokenLimiter>[0];
  asyncTaskProcessor: Parameters<typeof createAsyncTaskProcessor>[0];
  variableProcessor: Parameters<typeof createVariableProcessor>[0];
  messageFormatter: Parameters<typeof createMessageFormatters>[0];
  assetResolver: Parameters<typeof createAssetResolver>[0];
}

/** Assemble all production processors from explicit execution-owner services. */
export function createContextProcessors(services: ContextProcessorServices) {
  return getContextProcessorList({
    sessionLoader: createSessionLoader(services.sessionLoader),
    regexProcessor: createRegexProcessor(services.regexProcessor),
    injectionAssembler: createInjectionAssembler(services.injectionAssembler),
    recallProcessor: createRecallProcessors(services.recallProcessor)
      .recallProcessor,
    transcriptionProcessor: createTranscriptionProcessor(
      services.transcriptionProcessor
    ).transcriptionProcessor,
    worldbookProcessor: createWorldbookProcessors(services.worldbookProcessor)
      .worldbookProcessor,
    tokenLimiter: createTokenLimiter(services.tokenLimiter),
    asyncTaskProcessor: createAsyncTaskProcessor(services.asyncTaskProcessor),
    variableProcessor: createVariableProcessor(services.variableProcessor),
    messageFormatter: createMessageFormatters(services.messageFormatter)
      .messageFormatter,
    assetResolver: createAssetResolver(services.assetResolver),
  });
}
