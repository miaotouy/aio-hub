import { computed } from "vue";
import type { ParsedToolRequest, ToolCallConfig, ToolCallCycleResult } from "../types";
import type { ToolCallingProtocol } from "../core/protocols/base";
import { VcpToolCallingProtocol } from "../core/protocols/vcp-protocol";
import { createToolDiscoveryService } from "../core/discovery";
import { formatResultsForContext, processToolCallCycle } from "../core/engine";

const toolDiscovery = createToolDiscoveryService();
const defaultProtocol: ToolCallingProtocol = new VcpToolCallingProtocol();

export function useToolCalling() {
  const resolveProtocol = (protocol?: ToolCallConfig["protocol"]): ToolCallingProtocol => {
    if (protocol === "vcp" || !protocol) {
      return defaultProtocol;
    }
    return defaultProtocol;
  };

  const processCycle = async (
    assistantText: string,
    config: ToolCallConfig,
    onBeforeExecute?: (request: ParsedToolRequest) => Promise<boolean>,
  ): Promise<ToolCallCycleResult> => {
    const protocol = resolveProtocol(config.protocol);
    return await processToolCallCycle(assistantText, {
      protocol,
      config,
      onBeforeExecute,
    });
  };

  const formatCycleResults = (
    results: ToolCallCycleResult["executionResults"],
    protocolId?: ToolCallConfig["protocol"],
  ): string => {
    return formatResultsForContext(results, resolveProtocol(protocolId));
  };

  const generateToolsPrompt = (config: ToolCallConfig, agentId?: string): string => {
    return toolDiscovery.generatePrompt({
      protocol: config.protocol || "vcp",
      config,
      agentId,
    });
  };

  const hasToolCallingEnabled = computed(
    () => (config: ToolCallConfig | undefined) => Boolean(config?.enabled),
  );

  return {
    processCycle,
    formatCycleResults,
    generateToolsPrompt,
    getDiscoveredMethods: toolDiscovery.getDiscoveredMethods,
    invalidateDiscoveryCache: toolDiscovery.invalidateCache,
    hasToolCallingEnabled,
  };
}