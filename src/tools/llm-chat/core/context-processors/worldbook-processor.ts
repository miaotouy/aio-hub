// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createWorldbookProcessors } from "../pipeline/processors/worldbook-processor";

export const { WorldbookProcessor, worldbookProcessor } =
  createWorldbookProcessors({
    logger: createModuleLogger("WorldbookProcessor"),
  });
export type WorldbookProcessor = InstanceType<typeof WorldbookProcessor>;
