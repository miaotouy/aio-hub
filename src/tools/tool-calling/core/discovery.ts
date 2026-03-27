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
  toolDescription?: string;
  methods: MethodMetadata[];
  settingsSchema?: any[];
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

  const sortedAutoApprove = Object.keys(config.autoApproveTools || {})
    .sort()
    .reduce<Record<string, boolean>>((acc, key) => {
      const value = config.autoApproveTools[key];
      if (typeof value === "boolean") {
        acc[key] = value;
      }
      return acc;
    }, {});

  const sortedMethodToggles = Object.keys(config.methodToggles || {})
    .sort()
    .reduce<Record<string, boolean>>((acc, key) => {
      const value = config.methodToggles![key];
      if (typeof value === "boolean") {
        acc[key] = value;
      }
      return acc;
    }, {});

  const sortedMethodAutoApprove = Object.keys(config.autoApproveMethods || {})
    .sort()
    .reduce<Record<string, boolean>>((acc, key) => {
      const value = config.autoApproveMethods![key];
      if (typeof value === "boolean") {
        acc[key] = value;
      }
      return acc;
    }, {});

  const sortedOverrides = Object.keys(config.overrides || {})
    .sort()
    .reduce<Record<string, any>>((acc, key) => {
      acc[key] = config.overrides![key];
      return acc;
    }, {});

  return JSON.stringify({
    enabled: config.enabled,
    mode: config.mode,
    toolToggles: sortedToggles,
    methodToggles: sortedMethodToggles,
    autoApproveTools: sortedAutoApprove,
    autoApproveMethods: sortedMethodAutoApprove,
    overrides: sortedOverrides,
    defaultToolEnabled: config.defaultToolEnabled,
    defaultAutoApprove: config.defaultAutoApprove,
    maxIterations: config.maxIterations,
    timeout: config.timeout,
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
      // 如果工具明确标记为禁用（通常是插件），则跳过
      if ((tool as any).enabled === false) {
        continue;
      }

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
        toolDescription: tool.description,
        methods: callableMethods.map((m) => ({
          ...m,
          toolName: m.toolName || tool.name || tool.id,
        })),
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
    const enabledToolsWithMethods = allDiscovered
      .filter((tool) => resolveToolEnabled(tool.toolId, options.config))
      .map((tool) => {
        // 根据 methodToggles 过滤方法
        const filteredMethods = tool.methods.filter((method) => {
          const methodKey = `${tool.toolId}_${method.name}`;
          const toggle = options.config.methodToggles?.[methodKey];
          // 如果显式设置为 false，则禁用；否则默认启用（因为工具级已经启用了）
          return toggle !== false;
        });

        return {
          ...tool,
          methods: filteredMethods,
        };
      })
      .filter((tool) => tool.methods.length > 0);

    if (enabledToolsWithMethods.length === 0) {
      promptCache.set(cacheKey, "");
      return "";
    }

    const protocolInput: ToolDefinitionInput[] = enabledToolsWithMethods.map((tool) => {
      const toolOverride = options.config.overrides?.[tool.toolId];

      return {
        toolId: tool.toolId,
        toolName: toolOverride?.enabled ? toolOverride.displayName || tool.toolName : tool.toolName,
        toolDescription: toolOverride?.enabled ? toolOverride.description || tool.toolDescription : tool.toolDescription,
        methods: tool.methods.map((method) => {
          const methodKey = `${tool.toolId}:${method.name}`;
          const methodOverride = options.config.overrides?.[methodKey];

          let baseMethod = { ...method };
          if (methodOverride?.enabled) {
            baseMethod = {
              ...method,
              displayName: methodOverride.displayName || method.displayName,
              description: methodOverride.description || method.description,
              example: methodOverride.example || method.example,
            };
          }

          // 为异步方法添加标注
          if (baseMethod.executionMode === "async") {
            const asyncNote = "[异步方法] 此方法会立即返回任务ID，需要使用 tool-calling_getTaskStatus 查询结果";
            const estimatedDuration = method.asyncConfig?.estimatedDuration;
            const durationNote = estimatedDuration ? ` (预计耗时: ${estimatedDuration}秒)` : "";

            return {
              ...baseMethod,
              description: `${asyncNote}${durationNote}\n${baseMethod.description || ""}`.trim(),
            };
          }
          return baseMethod;
        }),
      };
    });

    const definitions = protocolImpl.generateToolDefinitions(protocolInput);
    const instructions = protocolImpl.generateUsageInstructions();

    const prompt = ["## 可用工具列表", definitions, "", instructions].join("\n");

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
