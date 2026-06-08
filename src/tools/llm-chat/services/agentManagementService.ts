/**
 * Agent 管理服务
 *
 * 提供 9 个 agentCallable 方法，使 LLM 能通过工具调用管理智能体配置。
 * 采用路径式操作（field path）定位 + 值覆盖的方式操作配置。
 * 读取/导出时使用 YAML 格式输出，底层存储保持 JSON。
 */

import yaml from "js-yaml";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useAgentStore } from "../stores/agentStore";
import { getLocalISOString } from "@/utils/time";
import {
  stripDefaultContextCompressionPromptsFromParameters,
  type ChatAgent,
  type ChatMessageNode,
} from "../types";

const logger = createModuleLogger("llm-chat/agentManagementService");
const errorHandler = createModuleErrorHandler(
  "llm-chat/agentManagementService"
);

// ============================================================
// 常量定义
// ============================================================

/** 字段权限黑名单：禁止修改的字段 */
const FIELD_BLACKLIST = new Set([
  "id",
  "createdAt",
  "lastUsedAt",
  "avatarHistory",
]);

/** section 分段映射 */
const SECTION_FIELDS: Record<string, string[]> = {
  metadata: [
    "name",
    "displayName",
    "description",
    "icon",
    "category",
    "tags",
    "modelId",
    "profileId",
    "userProfileId",
    "agentVersion",
    "version",
  ],
  presetMessages: ["presetMessages", "displayPresetCount", "greetings"],
  parameters: ["parameters"],
  toolCallConfig: ["toolCallConfig"],
  regexConfig: ["regexConfig"],
  knowledgeConfig: ["knowledgeBaseConfig", "knowledgeSettings"],
  assets: ["assets", "assetGroups"],
  advanced: [
    "interactionConfig",
    "virtualTimeConfig",
    "variableConfig",
    "extensionConfig",
    "llmThinkRules",
    "richTextStyleOptions",
    "visualGuideline",
    "worldbookIds",
    "worldbookSettings",
    "quickActionSetIds",
    "defaultToolCallCollapsed",
  ],
};

// ============================================================
// 路径解析器
// ============================================================

/**
 * 解析路径段，支持以下格式：
 * - "fieldName" → 普通字段
 * - "array[0]" → 数组索引
 * - "array[id=xxx]" → 数组按 ID 定位
 */
interface PathSegment {
  key: string;
  arrayAccess?: { type: "index"; index: number } | { type: "id"; id: string };
}

function parsePathSegments(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  // 按 . 分割，但需要处理包含 . 的 key（如 toolToggles.web-canvas）
  // 策略：先按 . 分割，然后处理数组访问语法
  const parts = path.split(".");

  for (const part of parts) {
    const bracketMatch = part.match(/^([^[]+)\[(.+)\]$/);
    if (bracketMatch) {
      const key = bracketMatch[1];
      const accessor = bracketMatch[2];

      if (accessor.startsWith("id=")) {
        segments.push({
          key,
          arrayAccess: { type: "id", id: accessor.substring(3) },
        });
      } else if (/^\d+$/.test(accessor)) {
        segments.push({
          key,
          arrayAccess: { type: "index", index: parseInt(accessor, 10) },
        });
      } else {
        // 不认识的格式，当作普通 key
        segments.push({ key: part });
      }
    } else {
      segments.push({ key: part });
    }
  }

  return segments;
}

/**
 * 根据路径解析对象中的字段位置
 * @returns { parent, key, value } 或抛出错误
 */
export function resolveFieldPath(
  obj: any,
  path: string
): { parent: any; key: string; value: any } {
  const segments = parsePathSegments(path);

  let current = obj;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    if (segment.arrayAccess) {
      // 先访问 key 得到数组
      const arr = current[segment.key];
      if (!Array.isArray(arr)) {
        throw new Error(`路径 "${path}" 中 "${segment.key}" 不是数组`);
      }

      let item: any;
      if (segment.arrayAccess.type === "index") {
        const idx = segment.arrayAccess.index;
        if (idx < 0 || idx >= arr.length) {
          throw new Error(
            `路径 "${path}" 中索引 [${idx}] 超出范围 (数组长度: ${arr.length})`
          );
        }
        item = arr[idx];

        if (isLast) {
          return { parent: arr, key: String(idx), value: item };
        }
      } else {
        // type === "id"
        const targetId = segment.arrayAccess.id;
        const foundIndex = arr.findIndex((el: any) => el.id === targetId);
        if (foundIndex === -1) {
          throw new Error(`路径 "${path}" 中未找到 id="${targetId}" 的元素`);
        }
        item = arr[foundIndex];

        if (isLast) {
          return { parent: arr, key: String(foundIndex), value: item };
        }
      }

      current = item;
    } else {
      // 普通字段访问
      if (isLast) {
        return {
          parent: current,
          key: segment.key,
          value: current[segment.key],
        };
      }

      if (current[segment.key] === undefined || current[segment.key] === null) {
        throw new Error(`路径 "${path}" 中 "${segment.key}" 不存在或为 null`);
      }

      current = current[segment.key];
    }
  }

  throw new Error(`路径 "${path}" 解析失败`);
}

/**
 * 通过路径设置字段值
 */
export function setFieldByPath(obj: any, path: string, value: any): void {
  const { parent, key } = resolveFieldPath(obj, path);
  parent[key] = value;
}

// ============================================================
// 值类型自动推断
// ============================================================

/**
 * 自动推断字符串值的实际类型
 */
function inferValueType(value: string): any {
  // 布尔值
  if (value === "true") return true;
  if (value === "false") return false;

  // null
  if (value === "null") return null;

  // JSON 对象或数组
  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      // 解析失败，当作字符串
      return value;
    }
  }

  // 数字（整数或浮点数）
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }

  // 其他情况保留为字符串
  return value;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取智能体摘要信息
 */
function getAgentSummary(agent: ChatAgent) {
  return {
    id: agent.id,
    name: agent.name,
    displayName: agent.displayName || agent.name,
    description: agent.description || "",
    category: agent.category || "",
    tags: agent.tags || [],
    modelId: agent.modelId,
    agentVersion: agent.agentVersion || "",
  };
}

/**
 * 提取指定 section 的配置数据
 */
function extractSection(
  agent: ChatAgent,
  section: string
): Record<string, any> {
  const fields = SECTION_FIELDS[section];
  if (!fields) {
    throw new Error(
      `未知的 section: "${section}"，可选值: ${Object.keys(SECTION_FIELDS).join(", ")}`
    );
  }

  const result: Record<string, any> = {};
  for (const field of fields) {
    const value = (agent as any)[field];
    if (value !== undefined) {
      result[field] = value;
    }
  }
  return result;
}

function stripDefaultPromptsFromAgentOutput<T extends Record<string, any>>(
  data: T
): T {
  if (!data.parameters) return data;

  return {
    ...data,
    parameters: stripDefaultContextCompressionPromptsFromParameters(
      data.parameters
    ),
  };
}

/**
 * 格式化值用于显示（截断过长的内容）
 */
function formatValueForDisplay(value: any, maxLength = 80): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    if (value.length > maxLength) {
      return `"${value.substring(0, maxLength)}..."(${value.length}字符)`;
    }
    return `"${value}"`;
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    if (json.length > maxLength) {
      return `${json.substring(0, maxLength)}...(${json.length}字符)`;
    }
    return json;
  }
  return String(value);
}

// ============================================================
// 9 个方法实现
// ============================================================

/**
 * 1. list_agents - 列出所有智能体摘要
 */
export async function list_agents(params: {
  filter?: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    let agents = [...agentStore.agents];

    // 应用过滤器
    if (params.filter) {
      const filter = params.filter.trim();

      if (filter.startsWith("category:")) {
        const category = filter.substring("category:".length).trim();
        agents = agents.filter((a) => a.category === category);
      } else if (filter.startsWith("tag:")) {
        const tag = filter.substring("tag:".length).trim();
        agents = agents.filter((a) => a.tags?.includes(tag));
      }
    }

    const summaries = agents.map(getAgentSummary);
    return JSON.stringify(summaries, null, 2);
  } catch (error) {
    errorHandler.error(error, "列出智能体失败");
    return JSON.stringify({ error: "列出智能体失败", detail: String(error) });
  }
}

/**
 * 2. search_agents - 按关键词搜索智能体
 */
export async function search_agents(params: {
  query: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const query = params.query.toLowerCase().trim();

    if (!query) {
      return JSON.stringify({ error: "搜索关键词不能为空" });
    }

    const matched = agentStore.agents.filter((agent) => {
      const searchFields = [
        agent.name,
        agent.displayName || "",
        agent.description || "",
        ...(agent.tags || []),
      ];
      return searchFields.some((field) => field.toLowerCase().includes(query));
    });

    const summaries = matched.map(getAgentSummary);
    return JSON.stringify(summaries, null, 2);
  } catch (error) {
    errorHandler.error(error, "搜索智能体失败");
    return JSON.stringify({ error: "搜索智能体失败", detail: String(error) });
  }
}

/**
 * 3. read_agent_config - 读取智能体配置（YAML 格式）
 */
export async function read_agent_config(params: {
  agentId: string;
  section?: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const agent = await agentStore.ensureAgentLoaded(params.agentId);

    if (!agent) {
      return `错误: 未找到智能体 (id: ${params.agentId})`;
    }

    let data: any;

    if (!params.section || params.section === "all") {
      // 导出完整配置（排除系统字段）
      const {
        id: _id,
        createdAt: _ca,
        lastUsedAt: _lu,
        avatarHistory: _ah,
        profileId: _pid,
        ...rest
      } = agent;
      data = stripDefaultPromptsFromAgentOutput(rest);
    } else {
      data = stripDefaultPromptsFromAgentOutput(
        extractSection(agent, params.section)
      );
    }

    return yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  } catch (error) {
    errorHandler.error(error, "读取智能体配置失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}

/**
 * 4. export_agent_as_text - 导出智能体为完整文本
 */
export async function export_agent_as_text(params: {
  agentId: string;
  format?: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const agent = await agentStore.ensureAgentLoaded(params.agentId);

    if (!agent) {
      return `错误: 未找到智能体 (id: ${params.agentId})`;
    }

    // 排除系统维护字段
    const {
      id: _id,
      createdAt: _ca,
      lastUsedAt: _lu,
      avatarHistory: _ah,
      ...exportData
    } = agent;
    const cleanedExportData = stripDefaultPromptsFromAgentOutput(exportData);

    const format = params.format || "yaml";

    if (format === "json") {
      return JSON.stringify(cleanedExportData, null, 2);
    }

    return yaml.dump(cleanedExportData, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  } catch (error) {
    errorHandler.error(error, "导出智能体失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}

/**
 * 5. set_agent_field - 路径式设置字段值（核心编辑方法）
 */
export async function set_agent_field(params: {
  agentId: string;
  path: string;
  value: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();

    // 检查字段黑名单
    const topLevelField = params.path.split(".")[0].split("[")[0];
    if (FIELD_BLACKLIST.has(topLevelField)) {
      return `错误: 字段 "${topLevelField}" 为系统保护字段，禁止修改`;
    }

    // 确保智能体数据已完整加载
    const agent = await agentStore.ensureAgentLoaded(params.agentId);
    if (!agent) {
      return `错误: 未找到智能体 (id: ${params.agentId})`;
    }

    // 验证路径有效性（先尝试解析）
    let oldValue: any;
    try {
      const resolved = resolveFieldPath(agent, params.path);
      oldValue = resolved.value;
    } catch (e) {
      // 路径不存在时，检查是否可以创建（父路径存在即可）
      const pathParts = params.path.split(".");
      if (pathParts.length > 1) {
        const parentPath = pathParts.slice(0, -1).join(".");
        try {
          resolveFieldPath(agent, parentPath);
          oldValue = undefined; // 父路径存在，字段不存在，允许创建
        } catch {
          return `错误: 路径 "${params.path}" 无效 - ${(e as Error).message}`;
        }
      } else {
        // 顶层字段，允许创建
        oldValue = undefined;
      }
    }

    // 推断值类型
    const newValue = inferValueType(params.value);

    // 应用修改
    try {
      setFieldByPath(agent, params.path, newValue);
    } catch (e) {
      // 如果 setFieldByPath 失败（路径中间节点不存在），尝试创建中间节点
      const pathParts = params.path.split(".");
      let current: any = agent;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const segment = pathParts[i];
        if (current[segment] === undefined || current[segment] === null) {
          current[segment] = {};
        }
        current = current[segment];
      }
      current[pathParts[pathParts.length - 1]] = newValue;
    }

    // 持久化
    agentStore.updateAgent(params.agentId, { ...agent });

    const oldDisplay = formatValueForDisplay(oldValue);
    const newDisplay = formatValueForDisplay(newValue);

    logger.info("set_agent_field 成功", {
      agentId: params.agentId,
      path: params.path,
      oldValue: oldDisplay,
      newValue: newDisplay,
    });

    return `成功更新字段 ${params.path}: ${oldDisplay} → ${newDisplay}`;
  } catch (error) {
    errorHandler.error(error, "设置智能体字段失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}

/**
 * 6. find_replace_in_presets - 在预设消息 content 中查找替换
 */
export async function find_replace_in_presets(params: {
  agentId: string;
  search: string;
  replace: string;
  regex?: string;
  messageId?: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const agent = await agentStore.ensureAgentLoaded(params.agentId);

    if (!agent) {
      return JSON.stringify({ error: `未找到智能体 (id: ${params.agentId})` });
    }

    if (!agent.presetMessages || agent.presetMessages.length === 0) {
      return JSON.stringify({ error: "该智能体没有预设消息" });
    }

    const useRegex = params.regex === "true";
    let searchPattern: RegExp | string;

    if (useRegex) {
      try {
        searchPattern = new RegExp(params.search, "g");
      } catch (e) {
        return JSON.stringify({
          error: `无效的正则表达式: ${(e as Error).message}`,
        });
      }
    } else {
      searchPattern = params.search;
    }

    let replacedCount = 0;
    const affectedMessages: string[] = [];

    const messagesToProcess = params.messageId
      ? agent.presetMessages.filter((msg) => msg.id === params.messageId)
      : agent.presetMessages;

    if (params.messageId && messagesToProcess.length === 0) {
      return JSON.stringify({ error: `未找到消息 (id: ${params.messageId})` });
    }

    for (const msg of messagesToProcess) {
      if (!msg.content) continue;

      let newContent: string;
      let count: number;

      if (useRegex) {
        const matches = msg.content.match(searchPattern as RegExp);
        count = matches ? matches.length : 0;
        newContent = msg.content.replace(
          searchPattern as RegExp,
          params.replace
        );
      } else {
        // 全局字符串替换
        const parts = msg.content.split(params.search);
        count = parts.length - 1;
        newContent = parts.join(params.replace);
      }

      if (count > 0) {
        msg.content = newContent;
        replacedCount += count;
        affectedMessages.push(msg.id);
      }
    }

    if (replacedCount > 0) {
      // 持久化
      agentStore.persistAgent(agent);

      logger.info("find_replace_in_presets 成功", {
        agentId: params.agentId,
        replacedCount,
        affectedMessages,
      });
    }

    return JSON.stringify({ replacedCount, affectedMessages });
  } catch (error) {
    errorHandler.error(error, "查找替换失败");
    return JSON.stringify({
      error: String(error instanceof Error ? error.message : error),
    });
  }
}

/**
 * 7. add_preset_message - 新增预设消息
 */
export async function add_preset_message(params: {
  agentId: string;
  role: string;
  content: string;
  name?: string;
  position?: string;
  injectionStrategy?: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const agent = await agentStore.ensureAgentLoaded(params.agentId);

    if (!agent) {
      return `错误: 未找到智能体 (id: ${params.agentId})`;
    }

    // 确保 presetMessages 数组存在
    if (!agent.presetMessages) {
      agent.presetMessages = [];
    }

    // 验证 role
    const validRoles = ["system", "user", "assistant"];
    if (!validRoles.includes(params.role)) {
      return `错误: 无效的 role "${params.role}"，可选值: ${validRoles.join(", ")}`;
    }

    // 生成新消息
    const newMessageId = `preset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newMessage: ChatMessageNode = {
      id: newMessageId,
      parentId: null,
      childrenIds: [],
      content: params.content,
      role: params.role as any,
      status: "complete",
      isEnabled: true,
      timestamp: getLocalISOString(),
    };

    if (params.name) {
      newMessage.name = params.name;
    }

    // 解析注入策略
    if (params.injectionStrategy) {
      try {
        newMessage.injectionStrategy = JSON.parse(params.injectionStrategy);
      } catch {
        return `错误: injectionStrategy 不是有效的 JSON`;
      }
    }

    // 确定插入位置
    const position = params.position || "before:chat_history";
    const messages = agent.presetMessages;

    if (position === "start") {
      messages.unshift(newMessage);
    } else if (position === "end") {
      messages.push(newMessage);
    } else if (position === "before:chat_history") {
      const chatHistoryIndex = messages.findIndex(
        (m) => m.type === "chat_history"
      );
      if (chatHistoryIndex !== -1) {
        messages.splice(chatHistoryIndex, 0, newMessage);
      } else {
        messages.push(newMessage);
      }
    } else if (position === "after:chat_history") {
      const chatHistoryIndex = messages.findIndex(
        (m) => m.type === "chat_history"
      );
      if (chatHistoryIndex !== -1) {
        messages.splice(chatHistoryIndex + 1, 0, newMessage);
      } else {
        messages.push(newMessage);
      }
    } else if (position.startsWith("before:")) {
      const targetId = position.substring("before:".length);
      const targetIndex = messages.findIndex((m) => m.id === targetId);
      if (targetIndex !== -1) {
        messages.splice(targetIndex, 0, newMessage);
      } else {
        return `错误: 未找到目标消息 (id: ${targetId})`;
      }
    } else if (position.startsWith("after:")) {
      const targetId = position.substring("after:".length);
      const targetIndex = messages.findIndex((m) => m.id === targetId);
      if (targetIndex !== -1) {
        messages.splice(targetIndex + 1, 0, newMessage);
      } else {
        return `错误: 未找到目标消息 (id: ${targetId})`;
      }
    } else {
      return `错误: 无效的 position "${position}"`;
    }

    // 持久化
    agentStore.persistAgent(agent);

    logger.info("add_preset_message 成功", {
      agentId: params.agentId,
      messageId: newMessageId,
      role: params.role,
      position,
    });

    return newMessageId;
  } catch (error) {
    errorHandler.error(error, "添加预设消息失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}

/**
 * 8. delete_preset_message - 删除指定预设消息
 */
export async function delete_preset_message(params: {
  agentId: string;
  messageId: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const agent = await agentStore.ensureAgentLoaded(params.agentId);

    if (!agent) {
      return `错误: 未找到智能体 (id: ${params.agentId})`;
    }

    if (!agent.presetMessages || agent.presetMessages.length === 0) {
      return `错误: 该智能体没有预设消息`;
    }

    const targetIndex = agent.presetMessages.findIndex(
      (m) => m.id === params.messageId
    );
    if (targetIndex === -1) {
      return `错误: 未找到预设消息 (id: ${params.messageId})`;
    }

    const targetMessage = agent.presetMessages[targetIndex];

    // 安全限制：不允许删除 chat_history 锚点
    if (targetMessage.type === "chat_history") {
      return `错误: 不允许删除 chat_history 锚点消息`;
    }

    const messageName = targetMessage.name || targetMessage.role;

    // 执行删除
    agent.presetMessages.splice(targetIndex, 1);

    // 持久化
    agentStore.persistAgent(agent);

    logger.info("delete_preset_message 成功", {
      agentId: params.agentId,
      messageId: params.messageId,
      messageName,
    });

    return `成功删除预设消息 ${messageName} (id: ${params.messageId})`;
  } catch (error) {
    errorHandler.error(error, "删除预设消息失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}

/**
 * 9. move_preset_message - 移动预设消息到新位置
 */
export async function move_preset_message(params: {
  agentId: string;
  messageId: string;
  position: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();
    const agent = await agentStore.ensureAgentLoaded(params.agentId);

    if (!agent) {
      return `错误: 未找到智能体 (id: ${params.agentId})`;
    }

    if (!agent.presetMessages || agent.presetMessages.length === 0) {
      return `错误: 该智能体没有预设消息`;
    }

    const messages = agent.presetMessages;
    const sourceIndex = messages.findIndex((m) => m.id === params.messageId);
    if (sourceIndex === -1) {
      return `错误: 未找到预设消息 (id: ${params.messageId})`;
    }

    const position = params.position;

    // 防止无意义操作：移动到自身的 before/after
    if (
      position === `before:${params.messageId}` ||
      position === `after:${params.messageId}`
    ) {
      return `提示: 消息已在目标位置，无需移动`;
    }

    // 从数组中取出消息
    const [message] = messages.splice(sourceIndex, 1);
    const messageName = message.name || message.role;

    // 按 position 语法计算新插入点
    if (position === "start") {
      messages.unshift(message);
    } else if (position === "end") {
      messages.push(message);
    } else if (position === "before:chat_history") {
      const chatHistoryIndex = messages.findIndex(
        (m) => m.type === "chat_history"
      );
      if (chatHistoryIndex !== -1) {
        messages.splice(chatHistoryIndex, 0, message);
      } else {
        messages.push(message);
      }
    } else if (position === "after:chat_history") {
      const chatHistoryIndex = messages.findIndex(
        (m) => m.type === "chat_history"
      );
      if (chatHistoryIndex !== -1) {
        messages.splice(chatHistoryIndex + 1, 0, message);
      } else {
        messages.push(message);
      }
    } else if (position.startsWith("before:")) {
      const targetId = position.substring("before:".length);
      const targetIndex = messages.findIndex((m) => m.id === targetId);
      if (targetIndex !== -1) {
        messages.splice(targetIndex, 0, message);
      } else {
        // 回滚：将消息放回原位
        messages.splice(sourceIndex, 0, message);
        return `错误: 未找到目标消息 (id: ${targetId})`;
      }
    } else if (position.startsWith("after:")) {
      const targetId = position.substring("after:".length);
      const targetIndex = messages.findIndex((m) => m.id === targetId);
      if (targetIndex !== -1) {
        messages.splice(targetIndex + 1, 0, message);
      } else {
        // 回滚：将消息放回原位
        messages.splice(sourceIndex, 0, message);
        return `错误: 未找到目标消息 (id: ${targetId})`;
      }
    } else {
      // 无效 position，回滚
      messages.splice(sourceIndex, 0, message);
      return `错误: 无效的 position "${position}"`;
    }

    // 持久化
    agentStore.persistAgent(agent);

    logger.info("move_preset_message 成功", {
      agentId: params.agentId,
      messageId: params.messageId,
      messageName,
      position,
    });

    return `成功移动预设消息 ${messageName} (id: ${params.messageId}) 到 ${position}`;
  } catch (error) {
    errorHandler.error(error, "移动预设消息失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}

/**
 * 10. import_agent_from_text - 从 YAML/JSON 文本创建新智能体
 */
export async function import_agent_from_text(params: {
  text: string;
  format?: string;
}): Promise<string> {
  try {
    const agentStore = useAgentStore();

    // 自动检测格式
    let parsed: any;
    const text = params.text.trim();
    const format = params.format || "auto";

    if (format === "json" || (format === "auto" && text.startsWith("{"))) {
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return `错误: JSON 解析失败 - ${(e as Error).message}`;
      }
    } else {
      // 尝试 YAML 解析
      try {
        parsed = yaml.load(text);
      } catch (e) {
        return `错误: YAML 解析失败 - ${(e as Error).message}`;
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return `错误: 解析结果不是有效的对象`;
    }

    // 如果是 AgentExportFile 格式（包含 agents 数组），取第一个
    if (parsed.type === "AIO_Agent_Export" && Array.isArray(parsed.agents)) {
      parsed = parsed.agents[0];
    }

    // 验证必要字段
    if (!parsed.name) {
      return `错误: 配置缺少必要的 "name" 字段`;
    }

    // 提取创建参数
    const {
      name,
      profileId,
      modelId,
      id: _id,
      createdAt: _ca,
      lastUsedAt: _lu,
      ...options
    } = parsed;

    // 使用 store 中第一个可用的 profileId（如果未指定）
    const agents = agentStore.agents;
    const fallbackProfileId =
      profileId || (agents.length > 0 ? agents[0].profileId : "");
    const fallbackModelId =
      modelId || (agents.length > 0 ? agents[0].modelId : "");

    if (!fallbackProfileId || !fallbackModelId) {
      return `错误: 无法确定 profileId 或 modelId，请确保至少有一个已配置的智能体`;
    }

    // 创建智能体
    const newAgentId = agentStore.createAgent(
      name,
      fallbackProfileId,
      fallbackModelId,
      options
    );

    logger.info("import_agent_from_text 成功", {
      agentId: newAgentId,
      name,
    });

    return `成功创建智能体 ${name} (id: ${newAgentId})`;
  } catch (error) {
    errorHandler.error(error, "从文本导入智能体失败");
    return `错误: ${String(error instanceof Error ? error.message : error)}`;
  }
}
