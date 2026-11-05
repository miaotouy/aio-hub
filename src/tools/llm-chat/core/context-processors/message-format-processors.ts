// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createMessageFormatters } from "../pipeline/processors/message-format-processors";
import { getContextTokenCalculator } from "../context-utils/token-calculator";

export const {
  DEFAULT_SEPARATOR,
  DEFAULT_USER_PLACEHOLDER,
  DEFAULT_ASSISTANT_PLACEHOLDER,
  handleMergeSystemToHead,
  handleMergeConsecutiveRoles,
  handleEnsureAlternatingRoles,
  handleConvertSystemToUser,
  AvailableFormatters,
  messageFormatter,
} = createMessageFormatters({
  logger: createModuleLogger("llm-chat/message-format-processors"),
  getContextTokenCalculator,
});
