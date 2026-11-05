// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createSessionLoader } from "../pipeline/processors/session-loader";

export const sessionLoader = createSessionLoader({
  logger: createModuleLogger("primary:session-loader"),
});
