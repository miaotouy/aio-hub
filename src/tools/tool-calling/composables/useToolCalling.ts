// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { computed } from "vue";
import type {
  ParsedToolRequest,
  ToolCallConfig,
  ToolCallCycleResult,
  ToolApprovalResult,
  ToolCallStatus,
} from "../types";
import type { ToolCallingProtocol } from "../core/protocols/base";
import { VcpToolCallingProtocol } from "../core/protocols/vcp-protocol";
import { createToolDiscoveryService } from "../core/discovery";
import { formatResultsForContext, processToolCallCycle } from "../core/engine";

const toolDiscovery = createToolDiscoveryService();
const defaultProtocol: ToolCallingProtocol = new VcpToolCallingProtocol();

export function useToolCalling() {
  const resolveProtocol = (
    protocol?: ToolCallConfig["protocol"]
  ): ToolCallingProtocol => {
    if (protocol === "vcp" || !protocol) {
      return defaultProtocol;
    }
    return defaultProtocol;
  };

  const processCycle = async (
    assistantText: string,
    config: ToolCallConfig,
    onBeforeExecute?: (
      request: ParsedToolRequest
    ) => Promise<ToolApprovalResult | boolean>,
    onStatusChange?: (requestId: string, status: ToolCallStatus) => void
  ): Promise<ToolCallCycleResult> => {
    const protocol = resolveProtocol(config.protocol);
    return await processToolCallCycle(assistantText, {
      protocol,
      config,
      onBeforeExecute,
      onStatusChange,
    });
  };

  const formatCycleResults = (
    results: ToolCallCycleResult["executionResults"],
    protocolId?: ToolCallConfig["protocol"]
  ): string => {
    return formatResultsForContext(results, resolveProtocol(protocolId));
  };

  const generateToolsPrompt = (
    config: ToolCallConfig,
    agentId?: string
  ): string => {
    return toolDiscovery.generatePrompt({
      protocol: config.protocol || "vcp",
      config,
      agentId,
    });
  };

  const hasToolCallingEnabled = computed(
    () => (config: ToolCallConfig | undefined) => Boolean(config?.enabled)
  );

  return {
    resolveProtocol,
    processCycle,
    formatCycleResults,
    generateToolsPrompt,
    getDiscoveredMethods: toolDiscovery.getDiscoveredMethods,
    getDiscoveredExtensions: toolDiscovery.getDiscoveredExtensions,
    invalidateDiscoveryCache: toolDiscovery.invalidateCache,
    hasToolCallingEnabled,
  };
}
