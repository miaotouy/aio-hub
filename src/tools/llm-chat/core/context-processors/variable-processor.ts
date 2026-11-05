// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createVariableProcessor } from "../pipeline/processors/variable-processor";

export const variableProcessor = createVariableProcessor({
  logger: createModuleLogger("primary:variable-processor"),
});
