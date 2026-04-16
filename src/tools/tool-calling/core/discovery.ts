import type { AgentExtensionContext, MethodMetadata, ToolRegistry } from "@/services/types";
import { toolRegistryManager } from "@/services/registry";
import { useToolsStore } from "@/stores/tools";
import type { AgentExtensionConfig, ToolCallConfig } from "@/tools/llm-chat/types/agent";
import { createModuleLogger } from "@/utils/logger";
import type { ToolCallingProtocol, ToolDefinitionInput } from "./protocols/base";
import { VcpToolCallingProtocol } from "./protocols/vcp-protocol";

const logger = createModuleLogger("tool-calling/discovery");

type DiscoveredToolMethods = {
  toolId: string;
  toolName: string;
  toolDescription?: string;
  icon?: any;
  factoryId?: string;
  methods: MethodMetadata[];
  settingsSchema?: any[];
};

type DiscoveredExtension = {
  id: string;
  name: string;
  description?: string;
  icon?: any;
  hasContext: boolean;
};

type GeneratePromptOptions = {
  protocol: string;
  config: ToolCallConfig;
  agentId?: string;
  includeToolIds?: string[];
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

function resolveExtensionEnabled(extensionId: string, config?: AgentExtensionConfig): boolean {
  if (!config) return false;
  if (!config.enabled) return false;
  const toggle = config.extensionToggles?.[extensionId];
  if (typeof toggle === "boolean") {
    return toggle;
  }
  return config.defaultExtensionEnabled;
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
  /**
   * 获取协议使用说明
   */
  getInstructions(protocol?: string): string;
  /**
   * 收集所有已启用工具或扩展提供的额外 Prompt 上下文
   */
  getAgentContexts(options: {
    toolConfig: ToolCallConfig;
    extensionConfig?: AgentExtensionConfig;
    agentId?: string;
    includeToolIds?: string[];
  }): Promise<string>;
  /**
   * 兼容旧版调用
   * @deprecated 使用 getAgentContexts 替代
   */
  getToolContexts(options: { config: ToolCallConfig; agentId?: string; includeToolIds?: string[] }): Promise<string>;
  getDiscoveredMethods(filter?: (method: MethodMetadata) => boolean): DiscoveredToolMethods[];
  getDiscoveredExtensions(): DiscoveredExtension[];
  invalidateCache(): void;
} {
  const promptCache = new Map<string, string>();

  function getDiscoveredExtensions(): DiscoveredExtension[] {
    const allTools = toolRegistryManager.getAllTools();
    const toolsStore = useToolsStore();

    return allTools
      .filter((ext) => typeof ext.getExtraPromptContext === "function")
      .map((ext) => {
        const toolConfig = toolsStore.tools.find((t) => t.path.includes(ext.id));
        return {
          id: ext.id,
          name: ext.name || ext.id,
          description: ext.description,
          icon: toolConfig?.icon,
          hasContext: true,
        };
      });
  }

  function getDiscoveredMethods(filter?: (method: MethodMetadata) => boolean): DiscoveredToolMethods[] {
    const allTools = toolRegistryManager.getAllTools();
    const toolsStore = useToolsStore();
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

      // 获取工厂 ID
      let factoryId: string | undefined;
      const allFactories = (toolRegistryManager as any).factoryToolIds as Map<string, string[]>;
      if (allFactories) {
        for (const [fid, ids] of allFactories.entries()) {
          if (ids.includes(tool.id)) {
            factoryId = fid;
            break;
          }
        }
      }

      // 尝试从 toolsStore 获取图标
      const toolConfig = toolsStore.tools.find((t) => t.path.includes(tool.id));

      discovered.push({
        toolId: tool.id,
        toolName: tool.name || tool.id,
        toolDescription: tool.description,
        icon: toolConfig?.icon,
        factoryId,
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

    const cacheKey = `${protocol}|${options.agentId || "anonymous"}|${stableStringifyConfig(options.config)}|${(
      options.includeToolIds || []
    ).join(",")}`;
    const cached = promptCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (!options.config.enabled && (!options.includeToolIds || options.includeToolIds.length === 0)) {
      promptCache.set(cacheKey, "");
      return "";
    }

    const allDiscovered = getDiscoveredMethods();
    const enabledToolsWithMethods = allDiscovered
      .filter((tool) => {
        // 如果指定了包含列表，则直接检查包含列表（强制开启）
        if (options.includeToolIds && options.includeToolIds.length > 0) {
          return options.includeToolIds.includes(tool.toolId);
        }
        // 否则遵循配置
        return resolveToolEnabled(tool.toolId, options.config);
      })
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
        toolDescription: toolOverride?.enabled
          ? toolOverride.description || tool.toolDescription
          : tool.toolDescription,
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

    const prompt = protocolImpl.generateToolDefinitions(protocolInput);

    promptCache.set(cacheKey, prompt);
    return prompt;
  }

  function getInstructions(protocol: string = "vcp"): string {
    const protocolImpl = SUPPORTED_PROTOCOLS[protocol];
    if (!protocolImpl) return "";
    return protocolImpl.generateUsageInstructions();
  }

  async function getAgentContexts(options: {
    toolConfig: ToolCallConfig;
    extensionConfig?: AgentExtensionConfig;
    agentId?: string;
    includeToolIds?: string[];
  }): Promise<string> {
    const { toolConfig, extensionConfig, includeToolIds } = options;

    // 如果两个开关都关了，且没有强制包含列表，则直接返回
    const toolsEnabled = toolConfig.enabled || (includeToolIds && includeToolIds.length > 0);
    const extensionsEnabled = extensionConfig?.enabled;

    if (!toolsEnabled && !extensionsEnabled) {
      return "";
    }

    const allExtensions = toolRegistryManager.getAllTools();

    // 筛选出已启用的扩展（包括工具和纯扩展）
    const enabledExtensions = allExtensions.filter((ext) => {
      // 1. 检查是否在强制包含列表中
      if (includeToolIds && includeToolIds.length > 0 && includeToolIds.includes(ext.id)) {
        return true;
      }

      // 2. 检查是否作为工具启用
      const isEnabledAsTool = toolConfig.enabled && resolveToolEnabled(ext.id, toolConfig);
      if (isEnabledAsTool) return true;

      // 3. 检查是否作为环境扩展启用
      const isEnabledAsExtension = resolveExtensionEnabled(ext.id, extensionConfig);
      if (isEnabledAsExtension) return true;

      return false;
    });

    const contextPromises = enabledExtensions.map(async (ext) => {
      if (typeof ext.getExtraPromptContext === "function") {
        try {
          // 构建扩展上下文（配置下推）
          const extensionContext: AgentExtensionContext = {
            toolSettings: toolConfig.toolSettings?.[ext.id] || {},
          };

          const context = await ext.getExtraPromptContext(extensionContext);
          if (context && context.trim()) {
            // 统一使用 <context_provider> 标签
            return `<context_provider id="${ext.id}">\n${context.trim()}\n</context_provider>`;
          }
        } catch (error) {
          logger.error(`获取扩展 "${ext.id}" 的额外上下文失败`, error);
        }
      }
      return "";
    });

    const contexts = await Promise.all(contextPromises);
    const filteredContexts = contexts.filter((c) => !!c);

    if (filteredContexts.length === 0) {
      return "";
    }

    return ["## 环境与工具上下文", ...filteredContexts].join("\n\n");
  }

  /**
   * 兼容旧版调用
   */
  async function getToolContexts(options: {
    config: ToolCallConfig;
    agentId?: string;
    includeToolIds?: string[];
  }): Promise<string> {
    return getAgentContexts({
      toolConfig: options.config,
      agentId: options.agentId,
      includeToolIds: options.includeToolIds,
    });
  }

  function invalidateCache(): void {
    promptCache.clear();
  }

  return {
    generatePrompt,
    getInstructions,
    getAgentContexts,
    getToolContexts,
    getDiscoveredMethods,
    getDiscoveredExtensions,
    invalidateCache,
  };
}
