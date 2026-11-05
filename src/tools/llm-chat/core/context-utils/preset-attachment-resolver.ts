// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createPresetAttachmentResolver } from "../pipeline/preset-attachments";
export const resolvePresetAttachments = createPresetAttachmentResolver({
  logger: createModuleLogger("llm-chat/preset-attachment-resolver"),
});
