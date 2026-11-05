// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createModelMatchResolver } from "../core/pipeline/model-match";
export type {
  ModelMatchContext,
  ModelMatchConfig,
} from "../core/pipeline/model-match";

export const isModelMatchSatisfied = createModelMatchResolver({
  logger: createModuleLogger("llm-chat/modelMatchUtils"),
});
