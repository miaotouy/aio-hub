// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createRegexProcessor } from "../pipeline/processors/regex-processor";

export const regexProcessor = createRegexProcessor({
  logger: createModuleLogger("primary:regex-processor"),
});
