// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createTokenLimiter } from "../pipeline/processors/token-limiter";
import { getContextTokenCalculator } from "../context-utils/token-calculator";

export const tokenLimiter = createTokenLimiter({
  logger: createModuleLogger("primary:token-limiter"),
  getContextTokenCalculator,
});
