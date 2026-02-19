import type { MethodMetadata, ToolRegistry } from "@/services/types";
import { toolRegistryManager } from "@/services/registry";
import type { ToolCallConfig } from "@/tools/llm-chat/types/agent";
import { createModuleLogger } from "@/utils/logger";
import type { ToolCallingProtocol, ToolDefinitionInput } from "./protocols/base";
import { VcpToolCallingProtocol } from "./protocols/vcp-protocol";

const logger = createModuleLogger("tool-calling/discovery");

type DiscoveredToolMethods = {
  toolId: string;
  toolName: string;
  methods: MethodMetadata[];
};

type GeneratePromptOptions = {
  protocol: string;
  config: ToolCallConfig;
  agentId?: string;
};

const SUPPORTED_PROTOCOLS: Record<string, ToolCallingProtocol> = {
  vcp: new VcpToolCallingProtocol(),
};

function hasMetadataProvider(tool: ToolRegistry): tool is ToolRegistry & {
  getMetadata: NonNullable<ToolRegistry["getMetadata"]>;
} {
  return typeof tool.getMetadata === "function";
}

function resolveToolEnabled(toolId: string, config: ToolCallConfig): boolean {
  const toggle = config.toolToggles?.[toolId];
  if (typeof toggle === "boolean") {
    return toggle;
  }
  return config.defaultToolEnabled;
}

function stableStringifyConfig(config: ToolCallConfig): string {
  const sortedToggles = Object.keys(config.toolToggles || {})
    .sort()
    .reduce<Record<string, boolean>>((acc, key) => {
      const value = config.toolToggles[key];
      if (typeof value === "boolean") {
        acc[key] = value;
      }
      return acc;
    }, {});

  return JSON.stringify({
    enabled: config.enabled,
    mode: config.mode,
    toolToggles: sortedToggles,
    defaultToolEnabled: config.defaultToolEnabled,
    maxIterations: config.maxIterations,
    timeout: config.timeout,
    requireConfirmation: config.requireConfirmation,
    parallelExecution: config.parallelExecution,
    protocol: config.protocol,
  });
}

export function createToolDiscoveryService(): {
  generatePrompt(options: GeneratePromptOptions): string;
  getDiscoveredMethods(filter?: (method: MethodMetadata) => boolean): DiscoveredToolMethods[];
  invalidateCache(): void;
} {
  const promptCache = new Map<string, string>();

  function getDiscoveredMethods(filter?: (method: MethodMetadata) => boolean): DiscoveredToolMethods[] {
    const allTools = toolRegistryManager.getAllTools();
    const discovered: DiscoveredToolMethods[] = [];

    for (const tool of allTools) {
      if (!hasMetadataProvider(tool)) {
        continue;
      }

      const metadata = tool.getMetadata();
      const methods = metadata?.methods || [];
      
      const callableMethods = filter
        ? methods.filter(filter)
        : methods.filter((method) => method.agentCallable === true);

      if (callableMethods.length === 0) {
        continue;
      }

      discovered.push({
        toolId: tool.id,
        toolName: tool.name || tool.id,
        methods: callableMethods,
      });
    }

    return discovered;
  }

  function generatePrompt(options: GeneratePromptOptions): string {
    const protocol = options.protocol || "vcp";
    const protocolImpl = SUPPORTED_PROTOCOLS[protocol];

    if (!protocolImpl) {
      logger.warn("未知工具调用协议，返回空工具定义", { protocol });
      return "";
    }

    const cacheKey = `${protocol}|${options.agentId || "anonymous"}|${stableStringifyConfig(options.config)}`;
    const cached = promptCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (!options.config.enabled) {
      promptCache.set(cacheKey, "");
      return "";
    }

    const allDiscovered = getDiscoveredMethods();
    const enabledTools = allDiscovered.filter((tool) => resolveToolEnabled(tool.toolId, options.config));

    if (enabledTools.length === 0) {
      promptCache.set(cacheKey, "");
      return "";
    }

    const protocolInput: ToolDefinitionInput[] = enabledTools.map((tool) => ({
      toolId: tool.toolId,
      toolName: tool.toolName,
      methods: tool.methods,
    }));

    const prompt = protocolImpl.generateToolDefinitions(protocolInput);
    promptCache.set(cacheKey, prompt);
    return prompt;
  }

  function invalidateCache(): void {
    promptCache.clear();
  }

  return {
    generatePrompt,
    getDiscoveredMethods,
    invalidateCache,
  };
}