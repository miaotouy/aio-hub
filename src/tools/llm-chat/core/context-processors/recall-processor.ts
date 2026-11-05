// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { resolvePlaceholderRetrieval } from "@/tools/recall/services/api";
import { createRecallProcessors } from "../pipeline/processors/recall-processor";

export const { RecallProcessor, recallProcessor } = createRecallProcessors({
  resolvePlaceholderRetrieval,
});
export type RecallProcessor = InstanceType<typeof RecallProcessor>;
