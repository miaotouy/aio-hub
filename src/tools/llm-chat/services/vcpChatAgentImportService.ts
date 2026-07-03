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

import { readDir, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useVcpStore } from "@/tools/vcp-connector/stores/vcpConnectorStore";
import { getPureModelId } from "@/utils/modelIdUtils";
import type {
  AgentImportModelRecommendation,
  AgentImportSourceMeta,
  ExportableAgent,
  ParsedAgentImportBundle,
} from "../types/agentImportExport";
import type { LlmProfile } from "@/types/llm-profiles";
import type { ChatMessageNode } from "../types/message";
import type { ChatRegexRule } from "../types/chatRegex";
import type { LlmParameters } from "../types/llm";
import { AgentCategory, DEFAULT_TOOL_CALL_CONFIG } from "../types";
import { isSameHost } from "../composables/useIsVcpChannel";

const logger = createModuleLogger("llm-chat/vcpChatAgentImportService");

const AVATAR_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

type VcpPromptMode = "original" | "preset" | "modular";

interface VcpAdvancedPromptBlock {
  type?: string;
  content?: string;
  text?: string;
  disabled?: boolean;
  selectedVariant?: string | number;
  variants?: Array<string | { id?: string; name?: string; content?: string }>;
}

export interface VcpChatConfig {
  name?: string;
  systemPrompt?: string;
  originalSystemPrompt?: string;
  promptMode?: VcpPromptMode | string;
  presetSystemPrompt?: string;
  advancedSystemPrompt?: string | { blocks?: VcpAdvancedPromptBlock[] };
  model?: string;
  temperature?: unknown;
  maxOutputTokens?: unknown;
  top_p?: unknown;
  top_k?: unknown;
  contextTokenLimit?: unknown;
  stripRegexes?: unknown[];
  description?: string;
}

interface VcpChatRegexRuleInput {
  id?: string;
  title?: string;
  findPattern?: string;
  replaceWith?: string;
  applyToFrontend?: boolean;
  applyToContext?: boolean;
  applyToRoles?: string[];
  minDepth?: number;
  maxDepth?: number;
  disabled?: boolean;
}

export interface VcpChatAgentScanItem {
  vcpAgentId: string;
  dirPath: string;
  configPath: string;
  name: string;
  model?: string;
  avatarPath?: string;
  avatarSource?: "agent-dir" | "avatarimage";
  regexPath?: string;
  hasRegexRules: boolean;
  promptMode?: VcpPromptMode;
  updatedAt?: string;
  warnings: string[];
  selectable: boolean;
  parseError?: string;
  config?: VcpChatConfig;
}

export interface VcpChatAgentScanResult {
  inputPath: string;
  agentsDir: string;
  rootKind: "vcp-root" | "agents-dir" | "manual-collection";
  isStandardRoot: boolean;
  items: VcpChatAgentScanItem[];
  warnings: string[];
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("\\")
    .replace(/[\\/]+/g, "\\");
}

function parentPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(
    normalized.lastIndexOf("\\"),
    normalized.lastIndexOf("/")
  );
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function fileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(
    normalized.lastIndexOf("\\"),
    normalized.lastIndexOf("/")
  );
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

async function safeReadDir(path: string): Promise<any[] | null> {
  try {
    return await readDir(path);
  } catch {
    return null;
  }
}

async function safeReadText(path: string): Promise<string | null> {
  try {
    return await readTextFile(path);
  } catch {
    return null;
  }
}

async function safeReadBinary(path: string): Promise<ArrayBuffer | null> {
  try {
    const bytes = await readFile(path);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
  } catch {
    return null;
  }
}

function entryName(entry: any): string {
  return String(entry.name || entry.path || "");
}

function isDirectoryEntry(entry: any): boolean {
  return entry.isDirectory === true || entry.children !== undefined;
}

function isValidVcpConfig(data: unknown): data is VcpChatConfig {
  if (!data || typeof data !== "object") return false;
  const obj = data as VcpChatConfig;
  return (
    typeof obj.systemPrompt === "string" ||
    typeof obj.originalSystemPrompt === "string" ||
    typeof obj.presetSystemPrompt === "string" ||
    typeof obj.advancedSystemPrompt === "string" ||
    !!obj.name ||
    !!obj.model
  );
}

export function isVcpChatConfig(data: unknown): data is VcpChatConfig {
  if (!isValidVcpConfig(data)) return false;
  const obj = data as VcpChatConfig;
  return !("type" in obj) && !("agents" in obj);
}

async function resolveAgentsDir(inputPath: string): Promise<{
  agentsDir: string;
  rootKind: VcpChatAgentScanResult["rootKind"];
  isStandardRoot: boolean;
  warnings: string[];
} | null> {
  const warnings: string[] = [];
  const appDataAgents = joinPath(inputPath, "AppData", "Agents");
  if (await safeReadDir(appDataAgents)) {
    return {
      agentsDir: appDataAgents,
      rootKind: "vcp-root",
      isStandardRoot: true,
      warnings,
    };
  }

  const inputEntries = await safeReadDir(inputPath);
  if (!inputEntries) return null;

  const configInSelf = await safeReadText(joinPath(inputPath, "config.json"));
  if (fileName(inputPath).toLowerCase() === "agents" || !configInSelf) {
    const hasAgentConfig = await hasChildConfig(inputPath, inputEntries);
    if (hasAgentConfig) {
      if (fileName(inputPath).toLowerCase() !== "agents") {
        warnings.push(
          "未检测到标准 VCPChat 根目录，已按手动角色集合目录扫描。"
        );
      }
      return {
        agentsDir: inputPath,
        rootKind:
          fileName(inputPath).toLowerCase() === "agents"
            ? "agents-dir"
            : "manual-collection",
        isStandardRoot: fileName(inputPath).toLowerCase() === "agents",
        warnings,
      };
    }
  }

  return null;
}

async function hasChildConfig(
  rootPath: string,
  entries: any[]
): Promise<boolean> {
  for (const entry of entries) {
    if (!isDirectoryEntry(entry)) continue;
    const name = entryName(entry);
    if (!name) continue;
    if (await safeReadText(joinPath(rootPath, name, "config.json"))) {
      return true;
    }
  }
  return false;
}

async function findAgentAvatar(agentDir: string): Promise<string | undefined> {
  for (const ext of AVATAR_EXTENSIONS) {
    const path = joinPath(agentDir, `avatar.${ext}`);
    if (await safeReadBinary(path)) return path;
  }
  return undefined;
}

async function findAvatarImage(
  rootPath: string,
  agentName: string
): Promise<string | undefined> {
  if (!agentName) return undefined;
  const avatarDir = joinPath(rootPath, "AppData", "avatarimage");
  for (const ext of AVATAR_EXTENSIONS) {
    const path = joinPath(avatarDir, `${agentName}.${ext}`);
    if (await safeReadBinary(path)) return path;
  }
  return undefined;
}

function normalizePromptMode(mode: unknown): VcpPromptMode {
  return mode === "preset" || mode === "modular" || mode === "original"
    ? mode
    : "original";
}

export async function scanVcpChatAgents(
  inputPath: string
): Promise<VcpChatAgentScanResult> {
  const resolved = await resolveAgentsDir(inputPath);
  if (!resolved) {
    throw new Error("未找到 VCPChat Agent 配置目录");
  }

  const entries = (await safeReadDir(resolved.agentsDir)) || [];
  const appDataRoot =
    resolved.rootKind === "vcp-root"
      ? inputPath
      : fileName(resolved.agentsDir).toLowerCase() === "agents"
        ? parentPath(parentPath(resolved.agentsDir))
        : inputPath;

  const items: VcpChatAgentScanItem[] = [];
  for (const entry of entries) {
    if (!isDirectoryEntry(entry)) continue;
    const vcpAgentId = entryName(entry);
    if (!vcpAgentId) continue;

    const dirPath = joinPath(resolved.agentsDir, vcpAgentId);
    const configPath = joinPath(dirPath, "config.json");
    const warnings: string[] = [];
    let config: VcpChatConfig | undefined;
    let parseError: string | undefined;
    let name = vcpAgentId;

    try {
      const text = await readTextFile(configPath);
      const parsed = JSON.parse(text);
      if (!isValidVcpConfig(parsed)) {
        throw new Error("config.json 不像 VCPChat Agent 配置");
      }
      config = parsed;
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        name = parsed.name.trim();
      } else {
        warnings.push("缺少 name 字段，已使用目录 ID 作为名称。");
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
      warnings.push(`解析 config.json 失败：${parseError}`);
    }

    const agentAvatar = await findAgentAvatar(dirPath);
    const avatarImage =
      !agentAvatar && config?.name
        ? await findAvatarImage(appDataRoot, config.name)
        : undefined;
    const regexPath = joinPath(dirPath, "regex_rules.json");
    const regexText = await safeReadText(regexPath);
    const hasInlineRegex =
      Array.isArray(config?.stripRegexes) && config.stripRegexes.length > 0;

    items.push({
      vcpAgentId,
      dirPath,
      configPath,
      name,
      model: config?.model,
      avatarPath: agentAvatar || avatarImage,
      avatarSource: agentAvatar
        ? "agent-dir"
        : avatarImage
          ? "avatarimage"
          : undefined,
      regexPath: regexText ? regexPath : undefined,
      hasRegexRules: !!regexText || hasInlineRegex,
      promptMode: normalizePromptMode(config?.promptMode),
      warnings,
      selectable: !!config && !parseError,
      parseError,
      config,
    });
  }

  logger.info("VCPChat Agent 扫描完成", {
    inputPath,
    agentsDir: resolved.agentsDir,
    count: items.length,
  });

  return {
    inputPath,
    agentsDir: resolved.agentsDir,
    rootKind: resolved.rootKind,
    isStandardRoot: resolved.isStandardRoot,
    items,
    warnings: resolved.warnings,
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function resolveModularPrompt(
  value: VcpChatConfig["advancedSystemPrompt"]
): string {
  if (typeof value === "string") return value;
  const blocks = value?.blocks;
  if (!Array.isArray(blocks)) return "";

  return blocks
    .filter((block) => !block.disabled)
    .map((block) => {
      if (block.type === "newline") return "\n";
      if (Array.isArray(block.variants) && block.variants.length > 0) {
        const selected = block.selectedVariant;
        const matched =
          block.variants.find((variant, index) => {
            if (typeof variant === "string") return index === selected;
            return (
              variant.id === selected ||
              variant.name === selected ||
              index === selected
            );
          }) || block.variants[0];
        return typeof matched === "string" ? matched : matched.content || "";
      }
      return block.content || block.text || "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveSystemPrompt(config: VcpChatConfig): string {
  const mode = normalizePromptMode(config.promptMode);
  if (mode === "preset") {
    return config.presetSystemPrompt || config.systemPrompt || "";
  }
  if (mode === "modular") {
    return (
      resolveModularPrompt(config.advancedSystemPrompt) ||
      config.systemPrompt ||
      config.originalSystemPrompt ||
      ""
    );
  }
  return config.originalSystemPrompt || config.systemPrompt || "";
}

function createSystemPresetMessage(content: string): ChatMessageNode {
  return {
    id: `preset-system-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    parentId: null,
    childrenIds: [],
    content,
    role: "system",
    status: "complete",
    isEnabled: true,
    timestamp: new Date().toISOString(),
  };
}

function mapParameters(config: VcpChatConfig): LlmParameters {
  const parameters: LlmParameters = {};
  const temperature = toNumber(config.temperature);
  const maxTokens = toNumber(config.maxOutputTokens);
  const topP = toNumber(config.top_p);
  const topK = toNumber(config.top_k);
  const contextTokenLimit = toNumber(config.contextTokenLimit);

  if (temperature !== undefined) parameters.temperature = temperature;
  if (maxTokens !== undefined) parameters.maxTokens = maxTokens;
  if (topP !== undefined) parameters.topP = topP;
  if (topK !== undefined) parameters.topK = topK;
  if (contextTokenLimit !== undefined && contextTokenLimit > 0) {
    parameters.contextManagement = {
      enabled: true,
      maxContextTokens: contextTokenLimit,
      retainedCharacters: undefined,
    };
  }
  return parameters;
}

function normalizeRoles(roles: unknown): ChatRegexRule["targetRoles"] {
  if (!Array.isArray(roles) || roles.length === 0)
    return ["system", "user", "assistant"];
  const allowed = new Set(["system", "user", "assistant", "tool"]);
  return roles
    .map((role) => String(role).toLowerCase())
    .filter((role): role is ChatRegexRule["targetRoles"][number] =>
      allowed.has(role)
    );
}

function mapRegexRule(
  rule: VcpChatRegexRuleInput,
  index: number
): ChatRegexRule | null {
  if (!rule.findPattern) return null;
  return {
    id: rule.id || `vcp-regex-${Date.now()}-${index}`,
    enabled: !rule.disabled,
    name: rule.title || rule.id || `VCPChat 正则 ${index + 1}`,
    regex: rule.findPattern,
    replacement: rule.replaceWith || "",
    flags: "gm",
    applyTo: {
      render: rule.applyToFrontend !== false,
      request: !!rule.applyToContext,
    },
    targetRoles: normalizeRoles(rule.applyToRoles),
    depthRange:
      rule.minDepth !== undefined || rule.maxDepth !== undefined
        ? { min: rule.minDepth, max: rule.maxDepth }
        : undefined,
    replacementType: "regex",
    substitutionMode: "NONE",
    applyInStreaming: false,
    order: index,
  };
}

function mapRegexConfig(
  rules: unknown[]
): ExportableAgent["regexConfig"] | undefined {
  const mapped = rules
    .map((rule, index) => mapRegexRule(rule as VcpChatRegexRuleInput, index))
    .filter((rule): rule is ChatRegexRule => !!rule);
  if (mapped.length === 0) return undefined;
  return {
    bindingMode: "message",
    presets: [
      {
        id: `vcp-regex-preset-${Date.now()}`,
        name: "VCPChat 正则规则",
        enabled: true,
        rules: mapped,
        priority: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  };
}

async function readRegexRules(item: VcpChatAgentScanItem): Promise<unknown[]> {
  if (item.regexPath) {
    const text = await safeReadText(item.regexPath);
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.rules)) return parsed.rules;
      } catch (error) {
        logger.warn("解析 VCPChat regex_rules.json 失败", {
          path: item.regexPath,
          error,
        });
      }
    }
  }
  return Array.isArray(item.config?.stripRegexes)
    ? item.config.stripRegexes
    : [];
}

export function recommendVcpChatModel(
  modelId?: string
): AgentImportModelRecommendation {
  const { enabledProfiles } = useLlmProfiles();
  const vcpStore = useVcpStore();
  const wsUrl = vcpStore.config.wsUrl;

  if (wsUrl) {
    const vcpProfile = enabledProfiles.value.find(
      (profile) => profile.baseUrl && isSameHost(profile.baseUrl, wsUrl)
    );
    if (vcpProfile) {
      return recommendModelFromVcpProfile(vcpProfile, modelId);
    }
  }

  if (modelId) {
    const targetModelId = getPureModelId(modelId);
    const matchedProfile = enabledProfiles.value.find((profile) =>
      profile.models.some((model) => model.id === targetModelId)
    );
    if (matchedProfile) {
      return {
        profileId: matchedProfile.id,
        modelId: targetModelId,
        reason: "exact-model",
        note: "按模型名精确匹配。",
      };
    }
  }

  const firstProfile = enabledProfiles.value[0];
  return {
    profileId: firstProfile?.id,
    modelId: firstProfile?.models[0]?.id || modelId,
    reason: "fallback",
    note: "未找到 VCP 或同名模型，已回退到第一个可用模型。",
  };
}

function recommendModelFromVcpProfile(
  vcpProfile: LlmProfile,
  modelId?: string
): AgentImportModelRecommendation {
  const targetModelId = getPureModelId(modelId);
  const matched = targetModelId
    ? vcpProfile.models.find(
        (model) => model.id === targetModelId || model.name === targetModelId
      )
    : undefined;
  const fallback = vcpProfile.models[0];

  return {
    profileId: vcpProfile.id,
    modelId: matched?.id || fallback?.id,
    reason: "vcp-host",
    note: matched
      ? "已按 VCP 连接推荐，并匹配原模型。"
      : fallback
        ? "已按 VCP 连接推荐，原模型不在该渠道中，已使用该渠道的其他模型。"
        : "已按 VCP 连接推荐，但该渠道暂无可用模型。",
  };
}

export async function convertVcpChatScanItemsToImportBundle(
  items: VcpChatAgentScanItem[]
): Promise<ParsedAgentImportBundle> {
  const agents: ExportableAgent[] = [];
  const assets: ParsedAgentImportBundle["assets"] = {};
  const sourceMeta: Record<string, AgentImportSourceMeta> = {};
  const modelRecommendations: Record<string, AgentImportModelRecommendation> =
    {};

  for (const item of items) {
    if (!item.config) continue;
    const tempId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const prompt = resolveSystemPrompt(item.config);
    const regexRules = await readRegexRules(item);
    const avatarExt = item.avatarPath?.split(".").pop()?.toLowerCase() || "png";
    const avatarAssetPath = item.avatarPath
      ? `assets/avatar.${avatarExt}`
      : undefined;

    const agent: ExportableAgent = {
      id: tempId,
      name: item.name,
      displayName: item.name,
      description: item.config.description,
      icon: avatarAssetPath,
      modelId: item.config.model || "",
      category: AgentCategory.Character,
      parameters: mapParameters(item.config),
      presetMessages: prompt ? [createSystemPresetMessage(prompt)] : [],
      regexConfig: mapRegexConfig(regexRules),
      toolCallConfig: {
        ...JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG)),
        enabled: true,
        protocol: "vcp",
        convertToolRoleToUser: true,
        autoInjectIfMacroMissing: false,
      },
    } as ExportableAgent;

    (agent as any).avatarHistory = avatarAssetPath ? [avatarAssetPath] : [];
    agents.push(agent);
    assets[tempId] = {};

    if (item.avatarPath && avatarAssetPath) {
      const avatar = await safeReadBinary(item.avatarPath);
      if (avatar) assets[tempId][avatarAssetPath] = avatar;
    }

    sourceMeta[tempId] = {
      source: "vcp-chat",
      sourceLabel: "VCPChat",
      originalId: item.vcpAgentId,
      originalPath: item.dirPath,
      warnings: item.warnings,
    };
    modelRecommendations[tempId] = recommendVcpChatModel(item.config.model);
  }

  return {
    agents,
    assets,
    sourceMeta,
    modelRecommendations,
  };
}

export async function convertVcpChatConfigToImportBundle(
  config: VcpChatConfig,
  options: {
    originalId?: string;
    originalPath?: string;
    avatar?: { path: string; content: ArrayBuffer };
    regexRules?: unknown[];
    warnings?: string[];
  } = {}
): Promise<ParsedAgentImportBundle> {
  const item: VcpChatAgentScanItem = {
    vcpAgentId: options.originalId || config.name || "vcp-chat-agent",
    dirPath: options.originalPath || "",
    configPath: options.originalPath || "",
    name: config.name?.trim() || options.originalId || "VCPChat Agent",
    model: config.model,
    hasRegexRules:
      !!options.regexRules?.length || !!config.stripRegexes?.length,
    promptMode: normalizePromptMode(config.promptMode),
    warnings: options.warnings || [],
    selectable: true,
    config,
  };
  const bundle = await convertVcpChatScanItemsToImportBundle([item]);
  const agentId = bundle.agents[0]?.id;
  if (agentId && options.avatar) {
    const ext = options.avatar.path.split(".").pop()?.toLowerCase() || "png";
    const assetPath = `assets/avatar.${ext}`;
    bundle.assets[agentId][assetPath] = options.avatar.content;
    bundle.agents[0].icon = assetPath;
    (bundle.agents[0] as any).avatarHistory = [assetPath];
  }
  if (agentId && options.regexRules?.length) {
    bundle.agents[0].regexConfig = mapRegexConfig(options.regexRules);
  }
  return bundle;
}
