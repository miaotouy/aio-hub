import {
  importPresetMessage,
  normalizePresetGroupState,
} from "@aiohub/agent-preset-core";
import { unzipSync, type Unzipped } from "fflate";
import { load as loadYaml } from "js-yaml";
import { v4 as uuidv4 } from "uuid";
import { bytesToBase64 } from "@/utils/base64";
import {
  AgentCategory,
  normalizeAgentAssetGroups,
  type ChatAgent,
  type GreetingMessage,
  type PresetMessage,
} from "../types/agent";

export type ImportedAgentDraft = Partial<ChatAgent> & Pick<ChatAgent, "name">;

/**
 * 导入过程中检测到的 ST 世界书源数据。
 * 导入器保持纯函数组合，不在本模块内落库；
 * 调用方（AgentList.vue）用它调用 worldbookStore 的导入方法。
 */
export interface ImportedWorldbookSource {
  /** ST 原始世界书结构（entries 数组或 entries 字典） */
  book: UnknownRecord;
  /** 建议的世界书名称 */
  name: string;
  /** 待绑定到 result.agents 的索引列表 */
  agentIndexes: number[];
}

/** 从导入包提取出、待落盘的私有二进制资产。 */
export interface ImportedBinaryAsset {
  /** 相对 Agent 私有目录的落盘路径，如 "assets/xxx.png" */
  path: string;
  bytes: Uint8Array;
  /** 文件大小（字节） */
  size: number;
  mimeType?: string;
}

/** 从导入包提取出、待落盘的 Agent 头像（按 agentIndex 关联）。 */
export interface ImportedAgentAvatar {
  agentIndex: number;
  /** 建议落盘文件名，如 "avatar.png" */
  filename: string;
  bytes: Uint8Array;
  size: number;
  mimeType?: string;
}

/** 某个 Agent 的待落盘私有资产集合（按 agentIndex 关联）。 */
export interface ImportedAgentPrivateAssets {
  agentIndex: number;
  assets: ImportedBinaryAsset[];
}

export interface AgentImportResult {
  agents: ImportedAgentDraft[];
  source: "aio" | "silly-tavern";
  /** 不可表达语义 / 未消费资源的汇总提示，由调用方透出给用户 */
  warnings: string[];
  /** ST 卡内嵌世界书（含 V2 data.character_book 与 V3 extensions.character_book） */
  importedWorldbooks?: ImportedWorldbookSource[];
  /** 包内提取出的 Agent 头像，由调用方落盘并回写 agent.icon */
  agentAvatars?: ImportedAgentAvatar[];
  /** 包内提取出的 Agent 私有资产，由调用方落盘并回写 agent.assets */
  privateAssets?: ImportedAgentPrivateAssets[];
}

type UnknownRecord = Record<string, unknown>;

interface BundleResourceSink {
  agentAvatars: ImportedAgentAvatar[];
  privateAssets: ImportedAgentPrivateAssets[];
  importedWorldbooks: ImportedWorldbookSource[];
  /** 已被成功消费的包内条目（normalized 路径），用于避免误告警 */
  consumed: Set<string>;
}


function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string): string {
  return typeof record[key] === "string" ? record[key] : "";
}

function createMessage(
  content: string,
  name: string,
  injectionStrategy?: PresetMessage["injectionStrategy"]
): PresetMessage {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    childrenIds: [],
    role: "system",
    status: "complete",
    content,
    name,
    isEnabled: true,
    timestamp: new Date().toISOString(),
    injectionStrategy,
  };
}

function convertMacros(text: string): string {
  return text
    .replace(/<char>/gi, "{{char}}")
    .replace(/<user>/gi, "{{user}}")
    .replace(/<persona>/gi, "{{persona}}")
    .replace(/<description>/gi, "{{description}}")
    .replace(/<scenario>/gi, "{{scenario}}")
    .replace(/<world>/gi, "{{world}}")
    .replace(/\{\{char\}\}/gi, "{{char}}")
    .replace(/\{\{user\}\}/gi, "{{user}}")
    .replace(/\{\{persona\}\}/gi, "{{persona}}")
    .replace(/\{\{description\}\}/gi, "{{description}}")
    .replace(/\{\{scenario\}\}/gi, "{{scenario}}")
    .replace(/\{\{world\}\}/gi, "{{world}}");
}

function normalizePresetMessages(value: unknown): PresetMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((message) =>
    importPresetMessage({
      ...message,
      id: readString(message, "id") || crypto.randomUUID(),
      parentId: typeof message.parentId === "string" ? message.parentId : null,
      childrenIds: Array.isArray(message.childrenIds)
        ? message.childrenIds
        : [],
      role: ["system", "user", "assistant"].includes(
        readString(message, "role")
      )
        ? (readString(message, "role") as PresetMessage["role"])
        : "system",
      status: ["generating", "complete", "error"].includes(
        readString(message, "status")
      )
        ? (readString(message, "status") as PresetMessage["status"])
        : "complete",
      content: readString(message, "content"),
      timestamp: readString(message, "timestamp") || new Date().toISOString(),
    } as PresetMessage)
  ) as PresetMessage[];
}

function normalizeAioAgent(value: unknown): ImportedAgentDraft | null {
  if (!isRecord(value)) return null;
  const name = readString(value, "name");
  if (!name) return null;
  const normalized: ImportedAgentDraft = {
    ...value,
    name,
    displayName: readString(value, "displayName") || name,
    presetMessages: normalizePresetMessages(value.presetMessages),
    presetGroups: Array.isArray(value.presetGroups) ? value.presetGroups : [],
  } as ImportedAgentDraft;
  // `assetGroups` 兼容旧占位 `unknown[]`：仅归一化合法分组，未知字段随对象保留；
  // 原值不是数组时不新增字段，避免改变无分组 Agent 的序列化结果。
  if (Array.isArray(value.assetGroups)) {
    normalized.assetGroups = normalizeAgentAssetGroups(value.assetGroups);
  }
  normalized.presetMessages = normalizePresetGroupState(
    normalized.presetMessages ?? [],
    normalized.presetGroups
  );
  delete normalized.id;
  delete normalized.createdAt;
  delete normalized.lastUsedAt;
  return normalized;
}

/** 校验包内存在指定相对路径条目（兼容配置文件位于子目录的场景）。 */
function bundleHasEntry(entries: Set<string>, fileName: string): boolean {
  const normalized = normalizeEntryPath(fileName);
  for (const name of entries) {
    if (name === normalized || name.endsWith(`/${normalized}`)) return true;
  }
  return false;
}

/**
 * 消费 AIO Agent 导出中的 bundledWorldbooks：
 * - content 内嵌（桌面 embedWorldbooks=true 导出）：内容为桌面世界书 JSON
 *   （STWorldbook，entries 为字典），转进 importedWorldbooks 通道由调用方
 *   落库并回写 worldbookIds；
 * - fileName 外链（embedWorldbooks=false，包内 worldbooks/ 目录）：包内文件
 *   已由 extractBundleResources 解析落库，这里仅校验包内文件存在，避免双份落库。
 * 无法解析的项进 warnings，不静默丢失；处理后从 draft 删除该字段，避免残留写进落库数据。
 */
function postProcessAioAgent(
  draft: ImportedAgentDraft,
  agentIndex: number,
  importedWorldbooks: ImportedWorldbookSource[],
  warnings: string[],
  bundleEntries?: Set<string>
): void {
  const record = draft as UnknownRecord;
  const bundled = record.bundledWorldbooks;
  delete record.bundledWorldbooks;
  if (!Array.isArray(bundled)) return;

  bundled.forEach((item, index) => {
    if (!isRecord(item)) {
      warnings.push(`随包世界书第 ${index + 1} 项格式无法识别，已跳过。`);
      return;
    }
    const name = readString(item, "name") || `随包世界书 ${index + 1}`;
    const content = item.content;
    if (content !== undefined && content !== null) {
      if (
        isRecord(content) &&
        (Array.isArray(content.entries) || isRecord(content.entries))
      ) {
        importedWorldbooks.push({
          book: content,
          name,
          agentIndexes: [agentIndex],
        });
        return;
      }
      warnings.push(`随包世界书「${name}」内容解析失败，已跳过。`);
      return;
    }
    const fileName = readString(item, "fileName");
    if (fileName && bundleEntries && bundleHasEntry(bundleEntries, fileName)) {
      // 包内 worldbooks/ 文件由 extractBundleResources 统一解析落库，不重复转换
      return;
    }
    warnings.push(
      fileName
        ? `随包世界书「${name}」引用的包内文件 ${fileName} 缺失，已跳过。`
        : `随包世界书「${name}」缺少可解析的世界书内容，已跳过。`
    );
  });
}

/**
 * 统计 AIO regexConfig 中的脚本型规则（replacementType === "script"）。
 * 移动端运行时仅支持正则替换、脚本型规则会被静默跳过，导入时汇总提示避免静默丢失。
 */
function collectScriptRegexWarnings(
  agents: ImportedAgentDraft[],
  warnings: string[]
): void {
  let count = 0;
  for (const draft of agents) {
    const config = draft.regexConfig;
    if (!isRecord(config) || !Array.isArray(config.presets)) continue;
    for (const preset of config.presets) {
      if (!isRecord(preset) || !Array.isArray(preset.rules)) continue;
      for (const rule of preset.rules) {
        if (isRecord(rule) && rule.replacementType === "script") count++;
      }
    }
  }
  if (count > 0) {
    warnings.push(`${count} 条脚本型正则规则在移动端不支持，已跳过。`);
  }
}

/**
 * VCP Chat config.json 识别（与桌面 agentImportService 使用的 isVcpChatConfig 判定一致）：
 * 具备 systemPrompt 系列字段之一或 name/model 字段，且不含 AIO 导出的 type/agents 字段。
 */
function isVcpChatConfigPayload(value: UnknownRecord): boolean {
  const hasVcpSignature =
    typeof value.systemPrompt === "string" ||
    typeof value.originalSystemPrompt === "string" ||
    typeof value.presetSystemPrompt === "string" ||
    typeof value.advancedSystemPrompt === "string" ||
    Boolean(value.name) ||
    Boolean(value.model);
  if (!hasVcpSignature) return false;
  return !("type" in value) && !("agents" in value);
}

function isSillyTavernCard(value: unknown): value is UnknownRecord {
  if (!isRecord(value)) return false;
  if (value.spec === "chara_card_v2" || value.spec === "chara_card_v3") {
    return true;
  }
  const data = isRecord(value.data) ? value.data : value;
  return Boolean(
    readString(data, "name") &&
    ("first_mes" in data || "description" in data || "personality" in data)
  );
}

/** ST 正则脚本（SillyTavern Regex Engine 导出格式） */
interface STRegexScript {
  scriptName?: string;
  findRegex?: string;
  replaceString?: string;
  placement?: number[];
  disabled?: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  minDepth?: number | null;
  maxDepth?: number | null;
  trimStrings?: unknown;
  substituteRegex?: number | null;
  [key: string]: unknown;
}

/** 移动端 regex-processor 消费的 agentConfig.regexConfig 结构 */
export interface MobileRegexConfig {
  presets: Array<{
    id: string;
    name: string;
    enabled: boolean;
    order: number;
    createdAt: number;
    updatedAt: number;
    rules: Array<{
      id: string;
      enabled: boolean;
      name?: string;
      regex: string;
      replacement: string;
      flags?: string;
      applyTo: { render: boolean; request: boolean };
      targetRoles: Array<"system" | "user" | "assistant">;
      depthRange?: { min?: number; max?: number };
      substitutionMode?: "NONE" | "RAW" | "ESCAPED";
      trimStrings?: string[];
      order?: number;
    }>;
  }>;
}

/** ST findRegex 支持 /pattern/flags 与纯模式两种写法 */
function parseRegexString(regexString: string): {
  pattern: string;
  flags: string;
} {
  if (!regexString) return { pattern: "", flags: "gm" };
  const matched = regexString.match(/^\/(.*)\/([gimsuy]*)$/s);
  if (matched) return { pattern: matched[1], flags: matched[2] || "gm" };
  return { pattern: regexString, flags: "gm" };
}

/**
 * ST `substituteRegex` 枚举 → 移动端 substitutionMode：
 * 0/undefined → NONE、1 → RAW、2 → ESCAPED；其他值回退 NONE 并标记未知。
 */
function convertSubstituteRegex(value: unknown): {
  mode: "NONE" | "RAW" | "ESCAPED";
  unknown: boolean;
} {
  if (value === undefined || value === null || value === 0) {
    return { mode: "NONE", unknown: false };
  }
  if (value === 1) return { mode: "RAW", unknown: false };
  if (value === 2) return { mode: "ESCAPED", unknown: false };
  return { mode: "NONE", unknown: true };
}

/**
 * ST placement 枚举 → 消息角色：
 * 0=MD_DISPLAY(全部)、1=USER_INPUT、2=AI_OUTPUT、5=WORLD_INFO(system)、6=REASONING(assistant)
 */
function convertPlacementToTargetRoles(
  script: STRegexScript
): Array<"system" | "user" | "assistant"> {
  if (!Array.isArray(script.placement) || script.placement.length === 0) {
    return ["system", "user", "assistant"];
  }
  const roles = new Set<"system" | "user" | "assistant">();
  if (script.placement.includes(0)) {
    roles.add("system");
    roles.add("user");
    roles.add("assistant");
  }
  if (script.placement.includes(1)) roles.add("user");
  if (script.placement.includes(2) || script.placement.includes(6))
    roles.add("assistant");
  if (script.placement.includes(5)) roles.add("system");
  return roles.size > 0
    ? [...roles]
    : ["system", "user", "assistant"];
}

/**
 * 把 ST regex_scripts 数组转换为移动端正则可执行的预设。
 * 按 ST 阶段语义写入 applyTo（render / request），只保留已可表达的语义；
 * 其余进 warnings（不静默）。
 */
function convertRegexScripts(
  scripts: unknown,
  presetName: string,
  warnings: string[]
): MobileRegexConfig | undefined {
  if (!Array.isArray(scripts)) return undefined;
  const rules: MobileRegexConfig["presets"][number]["rules"] = [];
  let skippedEmpty = 0;
  const unknownSubstituteValues = new Set<unknown>();

  scripts.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const script = raw as STRegexScript;
    const findRegex = typeof script.findRegex === "string" ? script.findRegex : "";
    if (!findRegex) {
      skippedEmpty++;
      return;
    }
    // ST 阶段语义：markdownOnly 仅渲染、promptOnly 仅请求；两者都不是时
    // 沿用移动端既有保守默认，只进入请求阶段，避免重复执行。
    const applyTo = script.markdownOnly
      ? { render: true, request: false }
      : script.promptOnly
        ? { render: false, request: true }
        : { render: false, request: true };
    const { pattern, flags } = parseRegexString(findRegex);
    const { mode: substitutionMode, unknown: unknownSubstitute } =
      convertSubstituteRegex(script.substituteRegex);
    if (unknownSubstitute) unknownSubstituteValues.add(script.substituteRegex);
    const trimStrings = Array.isArray(script.trimStrings)
      ? script.trimStrings.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const depthRange =
      typeof script.minDepth === "number" || typeof script.maxDepth === "number"
        ? {
            min: typeof script.minDepth === "number" ? script.minDepth : undefined,
            max: typeof script.maxDepth === "number" ? script.maxDepth : undefined,
          }
        : undefined;
    rules.push({
      id: crypto.randomUUID(),
      enabled: !script.disabled,
      name: script.scriptName || "未命名规则",
      regex: pattern,
      replacement: typeof script.replaceString === "string" ? script.replaceString : "",
      flags,
      // markdownOnly 落到 render；promptOnly 与默认落到 request
      applyTo,
      targetRoles: convertPlacementToTargetRoles(script),
      depthRange,
      ...(substitutionMode !== "NONE" ? { substitutionMode } : {}),
      ...(trimStrings.length ? { trimStrings } : {}),
      order: index,
    });
  });

  if (skippedEmpty > 0) {
    warnings.push(`跳过 ${skippedEmpty} 条缺少匹配表达式的正则规则。`);
  }
  if (unknownSubstituteValues.size > 0) {
    warnings.push(
      `正则脚本 substituteRegex 存在未识别值（${[...unknownSubstituteValues].join(
        ", "
      )}），已回退为 NONE。`
    );
  }
  if (rules.length === 0) return undefined;

  return {
    presets: [
      {
        id: crypto.randomUUID(),
        name: presetName,
        enabled: true,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        rules,
      },
    ],
  };
}

function convertSillyTavernCard(card: UnknownRecord): ImportedAgentDraft {
  const data = isRecord(card.data) ? { ...card, ...card.data } : card;
  const name = readString(data, "name") || "Imported character";
  const messages: PresetMessage[] = [];
  const append = (key: string, label: string, prefix?: string) => {
    const content = convertMacros(readString(data, key).trim());
    if (!content) return;
    messages.push(
      createMessage(
        prefix
          ? `${prefix}
${content}`
          : content,
        label
      )
    );
  };

  append("system_prompt", "System Prompt");
  append("description", "Description", "[Character Description]");
  append("personality", "Personality", "[Character Personality]");
  append("scenario", "Scenario", "[Scenario]");
  append("mes_example", "Example Messages", "[Example Dialogue]");

  const postHistory = convertMacros(
    readString(data, "post_history_instructions").trim()
  );
  if (postHistory) {
    messages.push(
      createMessage(postHistory, "Post History Instructions", {
        type: "depth",
        depth: 0,
        order: 100,
      })
    );
  }

  const depthPrompt = isRecord(data.extensions)
    ? data.extensions.depth_prompt
    : undefined;
  if (isRecord(depthPrompt) && readString(depthPrompt, "prompt")) {
    messages.push(
      createMessage(
        convertMacros(readString(depthPrompt, "prompt")),
        "Depth Prompt",
        {
          type: "depth",
          depth: typeof depthPrompt.depth === "number" ? depthPrompt.depth : 4,
          order: 100,
        }
      )
    );
  }

  const greetingContents = [
    readString(data, "first_mes"),
    ...(Array.isArray(data.alternate_greetings)
      ? data.alternate_greetings.filter(
          (item): item is string => typeof item === "string"
        )
      : []),
  ]
    .map((content) => convertMacros(content.trim()))
    .filter(Boolean);
  const greetings: GreetingMessage[] = greetingContents.map(
    (content, index) => ({
      id: uuidv4(),
      name: index === 0 ? "First Message" : `Alternate Greeting ${index}`,
      content,
      role: "assistant",
    })
  );

  const extensions = isRecord(data.extensions) ? data.extensions : undefined;
  return {
    version: 2,
    name,
    displayName: name,
    description:
      readString(data, "creator_notes") || readString(data, "creatorcomment"),
    category: AgentCategory.Character,
    icon: "Bot",
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    presetMessages: messages,
    presetGroups: [],
    greetings,
    // Keep the original card data available for later worldbook/regex import.
    extensionConfig: {
      source: "silly-tavern",
      creator: readString(data, "creator"),
      characterVersion: readString(data, "character_version"),
      characterBook: data.character_book,
      regexScripts: data.regex_scripts ?? extensions?.regex_scripts,
    },
  };
}

/**
 * 提取 ST 卡内嵌世界书（V2 data.character_book、V3 extensions.character_book）
 * 与 regex_scripts（data.regex_scripts、extensions.regex_scripts、
 * character_book.regex_scripts）。
 * 转换成功后从 extensionConfig 移除对应存档，避免双份数据。
 */
function postProcessSillyTavernDraft(
  draft: ImportedAgentDraft,
  agentIndex: number,
  importedWorldbooks: ImportedWorldbookSource[],
  warnings: string[]
): void {
  const extensionConfig = isRecord(draft.extensionConfig)
    ? draft.extensionConfig
    : undefined;
  if (!extensionConfig) return;

  const book = extensionConfig.characterBook;
  // ST 卡内嵌 character_book 的 entries 可能是数组，世界书导出文件则是字典，两者都要接受
  const bookEntries = isRecord(book) ? book.entries : undefined;
  const hasBookEntries = Array.isArray(bookEntries) || isRecord(bookEntries);
  const scripts =
    extensionConfig.regexScripts ??
    (isRecord(book) ? book.regex_scripts : undefined);

  if (isRecord(book) && hasBookEntries) {
    const bookName =
      (isRecord(book.metadata) && readString(book.metadata, "name")) ||
      readString(book, "name") ||
      draft.displayName ||
      draft.name ||
      "Imported Worldbook";
    importedWorldbooks.push({
      book,
      name: bookName,
      agentIndexes: [agentIndex],
    });
    // 交给调用方落库绑定 worldbookIds，不再保留双份存档
    delete extensionConfig.characterBook;
  }

  if (Array.isArray(scripts)) {
    const regexConfig = convertRegexScripts(
      scripts,
      `${draft.name} - 导入正则`,
      warnings
    );
    if (regexConfig) {
      draft.regexConfig = regexConfig;
      const rules = regexConfig.presets[0].rules;
      const renderCount = rules.filter((rule) => rule.applyTo.render).length;
      const requestCount = rules.filter((rule) => rule.applyTo.request).length;
      warnings.push(
        `已转换 ${rules.length} 条正则规则（渲染阶段 ${renderCount} 条、请求阶段 ${requestCount} 条）。`
      );
    }
    delete extensionConfig.regexScripts;
  }
}

function decodeBase64Json(value: string): unknown {
  const raw = value.trim();
  if (raw.startsWith("{") || raw.startsWith("[")) return JSON.parse(raw);
  const encoded = raw
    .replace(/^data:[^,]+,/, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0)
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

function base64ToBytes(base64: string): Uint8Array {
  const encoded = base64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractPngTextChunks(
  buffer: ArrayBuffer
): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const chunks: Record<string, string> = {};
  if (
    bytes.length < 8 ||
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a
  ) {
    return chunks;
  }

  const latin1 = new TextDecoder("latin1");
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const type = latin1.decode(bytes.subarray(typeStart, dataStart));
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const separator = data.indexOf(0);
      if (separator >= 0) {
        chunks[latin1.decode(data.subarray(0, separator))] = latin1.decode(
          data.subarray(separator + 1)
        );
      }
    } else if (type === "zTXt") {
      const separator = data.indexOf(0);
      if (separator >= 0 && data[separator + 1] === 0) {
        const inflated = await inflate(data.subarray(separator + 2));
        if (inflated) {
          chunks[latin1.decode(data.subarray(0, separator))] =
            latin1.decode(inflated);
        }
      }
    } else if (type === "iTXt") {
      const keywordEnd = data.indexOf(0);
      if (keywordEnd >= 0 && data.length > keywordEnd + 2) {
        const compressed = data[keywordEnd + 1] === 1;
        let cursor = keywordEnd + 3;
        const languageEnd = data.indexOf(0, cursor);
        if (languageEnd >= 0) {
          cursor = languageEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0) {
            cursor = translatedEnd + 1;
            const payload = data.subarray(cursor);
            const decoded = compressed ? await inflate(payload) : payload;
            if (decoded) {
              chunks[latin1.decode(data.subarray(0, keywordEnd))] =
                new TextDecoder().decode(decoded);
            }
          }
        }
      }
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

/** 包内可被消费的配置文件（与桌面端 agentImportService 的匹配规则一致） */
const AGENT_CONFIG_JSON = /\.agent\.json$/;
const AGENT_CONFIG_YAML = /\.agent\.(yaml|yml)$/;

/** 包内世界书文件名匹配（JSON / YAML）。 */
const WORLD_BOOK_FILE = /\.(json|ya?ml)$/i;

/** 常见扩展名 → MIME 映射，仅用于资产元数据，不参与解码。 */
const ASSET_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  txt: "text/plain",
  md: "text/markdown",
};

/** 统一 zip 内路径分隔符并去掉前导 `./` 与 `/`。 */
function normalizeEntryPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function basenameOf(path: string): string {
  const normalized = normalizeEntryPath(path);
  const separator = normalized.lastIndexOf("/");
  return separator >= 0 ? normalized.slice(separator + 1) : normalized;
}

/** 返回带结尾 `/` 的目录前缀，配置在包根时为空串。 */
function dirnameOf(path: string): string {
  const normalized = normalizeEntryPath(path);
  const separator = normalized.lastIndexOf("/");
  return separator >= 0 ? normalized.slice(0, separator + 1) : "";
}

function guessMimeType(path: string): string | undefined {
  const extension = basenameOf(path).split(".").pop()?.toLowerCase();
  return extension ? ASSET_MIME_TYPES[extension] : undefined;
}

/** 按包内路径优先返回全部配置文件（JSON 优先，与单配置旧行为一致）。 */
function findConfigEntries(
  entries: Map<string, Uint8Array>
): Array<{ name: string; data: Uint8Array }> {
  const result: Array<{ name: string; data: Uint8Array }> = [];
  for (const [name, data] of entries) {
    if (data.length === 0) continue;
    if (AGENT_CONFIG_JSON.test(name)) result.push({ name, data });
  }
  for (const [name, data] of entries) {
    if (data.length === 0) continue;
    if (AGENT_CONFIG_YAML.test(name)) result.push({ name, data });
  }
  return result;
}

/** 递归收集配置对象中引用的私有资产路径（`assets/...`）。 */
function collectAssetReferences(
  value: unknown,
  output: Set<string>,
  depth = 0
): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === "string") {
    const normalized = normalizeEntryPath(value);
    if (/(^|\/)assets\//.test(normalized)) output.add(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetReferences(item, output, depth + 1);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value))
      collectAssetReferences(item, output, depth + 1);
  }
}

/** 解析包内世界书文件为 ST 源结构，失败返回 null。 */
function parseWorldbookEntry(
  name: string,
  data: Uint8Array
): UnknownRecord | null {
  try {
    const text = new TextDecoder().decode(data);
    const parsed = name.toLowerCase().endsWith(".json")
      ? JSON.parse(text)
      : loadYaml(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 提取某个配置文件所属目录下的私有资源：
 * 头像（icon 指向的包内文件）、`assets/` 二进制、`worldbooks/` 世界书。
 * 已成功消费的条目标记进 sink.consumed，避免调用方误报“未迁移”。
 */
function extractBundleResources(
  entries: Map<string, Uint8Array>,
  configName: string,
  drafts: ImportedAgentDraft[],
  agentIndexes: number[],
  warnings: string[],
  sink: BundleResourceSink
): void {
  if (drafts.length === 0) return;
  const baseDir = dirnameOf(configName);
  const assetsPrefix = `${baseDir}assets/`;
  const worldbooksPrefix = `${baseDir}worldbooks/`;

  const assets: Array<ImportedBinaryAsset & { bundlePath: string }> = [];
  for (const [name, data] of entries) {
    if (name.endsWith("/") || data.length === 0) continue;
    if (!name.startsWith(assetsPrefix)) continue;
    const relativePath = name.slice(baseDir.length);
    assets.push({
      path: relativePath,
      bundlePath: name,
      bytes: data,
      size: data.length,
      mimeType: guessMimeType(relativePath),
    });
    sink.consumed.add(name);
  }

  // 单配置多 agent 时按配置内的资产引用精确归属；无引用则整目录归属首个 Agent，
  // 目录内未被任何 agent 引用的资产兜底归属首个 Agent，确保不丢文件。
  const matchedByAgent: Array<Array<ImportedBinaryAsset & { bundlePath: string }>> =
    drafts.map(() => []);
  const claimed = new Set<string>();
  drafts.forEach((draft, index) => {
    const references = new Set<string>();
    collectAssetReferences(draft, references);
    const referenceList = [...references];
    for (const asset of assets) {
      const filename = basenameOf(asset.bundlePath);
      const isReferenced =
        references.has(asset.path) ||
        references.has(asset.bundlePath) ||
        references.has(filename) ||
        referenceList.some((reference) => reference.endsWith(`/${filename}`));
      if (isReferenced) {
        matchedByAgent[index].push(asset);
        claimed.add(asset.path);
      }
    }
    if (matchedByAgent[index].length === 0) {
      for (const asset of assets) {
        if (claimed.has(asset.path)) continue;
        matchedByAgent[index].push(asset);
        claimed.add(asset.path);
      }
    }
  });
  if (drafts.length > 0) {
    for (const asset of assets) {
      if (!claimed.has(asset.path)) matchedByAgent[0].push(asset);
    }
  }

  matchedByAgent.forEach((list, index) => {
    if (list.length === 0) return;
    const deduped = new Map<string, ImportedBinaryAsset>();
    for (const asset of list) {
      if (deduped.has(asset.path)) continue;
      deduped.set(asset.path, {
        path: asset.path,
        bytes: asset.bytes,
        size: asset.size,
        mimeType: asset.mimeType,
      });
    }
    sink.privateAssets.push({
      agentIndex: agentIndexes[index],
      assets: [...deduped.values()],
    });
  });

  // 头像：icon 指向的包内文件（通常在配置目录或包根，也可能在 assets/ 下）
  drafts.forEach((draft, index) => {
    const icon = typeof draft.icon === "string" ? draft.icon.trim() : "";
    if (!icon || /^(https?:|data:|blob:)/i.test(icon)) return;
    const candidates = [
      normalizeEntryPath(`${baseDir}${icon}`),
      normalizeEntryPath(icon),
      normalizeEntryPath(`${assetsPrefix}${icon}`),
    ];
    for (const candidate of candidates) {
      const data = entries.get(candidate);
      if (data && data.length > 0 && !candidate.endsWith("/")) {
        sink.agentAvatars.push({
          agentIndex: agentIndexes[index],
          filename: basenameOf(candidate),
          bytes: data,
          size: data.length,
          mimeType: guessMimeType(candidate),
        });
        sink.consumed.add(candidate);
        break;
      }
    }
  });

  // 世界书：解析为 ST 源结构，交给调用方落库
  for (const [name, data] of entries) {
    if (name.endsWith("/") || data.length === 0) continue;
    if (!name.startsWith(worldbooksPrefix) || !WORLD_BOOK_FILE.test(name))
      continue;
    sink.consumed.add(name);
    const book = parseWorldbookEntry(name, data);
    if (!book) {
      warnings.push(`世界书文件 ${basenameOf(name)} 解析失败，已跳过。`);
      continue;
    }
    const fallbackName = basenameOf(name).replace(/\.(json|ya?ml)$/i, "");
    const metadata = isRecord(book.metadata) ? book.metadata : undefined;
    const bookName =
      (metadata ? readString(metadata, "name") : "") ||
      readString(book, "name") ||
      fallbackName;
    sink.importedWorldbooks.push({
      book,
      name: bookName,
      agentIndexes: [...agentIndexes],
    });
  }
}

function parseConfigBytes(name: string, data: Uint8Array): unknown {
  const text = new TextDecoder().decode(data);
  if (AGENT_CONFIG_YAML.test(name)) return loadYaml(text);
  return JSON.parse(text);
}

/**
 * 解析 AIO Agent Bundle（.agent.zip 或 PNG aiob chunk 内的 ZIP）。
 * 消费包内全部 *.agent.json / *.agent.yaml 配置，并提取同目录下的
 * 头像、`assets/` 二进制与 `worldbooks/` 世界书；仅对真正未消费的资源告警。
 */
function parseAgentBundle(zipBytes: Uint8Array): AgentImportResult {
  let entries: Unzipped;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new Error("Unsupported agent file");
  }

  const normalizedEntries = new Map<string, Uint8Array>();
  for (const [rawName, data] of Object.entries(entries)) {
    if (rawName.endsWith("/")) continue;
    normalizedEntries.set(normalizeEntryPath(rawName), data);
  }

  const configEntries = findConfigEntries(normalizedEntries);
  if (configEntries.length === 0) {
    throw new Error("Unsupported agent file");
  }

  const agents: ImportedAgentDraft[] = [];
  const warnings: string[] = [];
  const importedWorldbooks: ImportedWorldbookSource[] = [];
  const sink: BundleResourceSink = {
    agentAvatars: [],
    privateAssets: [],
    importedWorldbooks,
    consumed: new Set<string>(),
  };
  let source: AgentImportResult["source"] = "aio";

  for (const config of configEntries) {
    const payload = parseConfigBytes(config.name, config.data);
    const parsed = parseImportPayload(
      payload,
      new Set(normalizedEntries.keys())
    );
    source = parsed.source;
    const offset = agents.length;
    agents.push(...parsed.agents);
    warnings.push(...parsed.warnings);
    for (const worldbook of parsed.importedWorldbooks ?? []) {
      importedWorldbooks.push({
        ...worldbook,
        agentIndexes: worldbook.agentIndexes.map((index) => index + offset),
      });
    }
    sink.consumed.add(config.name);
    const agentIndexes = parsed.agents.map((_, index) => offset + index);
    extractBundleResources(
      normalizedEntries,
      config.name,
      parsed.agents,
      agentIndexes,
      warnings,
      sink
    );
  }

  const unconsumed = [...normalizedEntries.keys()].filter(
    (name) => !sink.consumed.has(name)
  );
  if (unconsumed.length > 0) {
    warnings.push(
      `导入包内 ${unconsumed.length} 个资源文件暂未迁移，可在 PC 端查看。`
    );
  }

  return {
    agents,
    source,
    warnings,
    ...(importedWorldbooks.length > 0 ? { importedWorldbooks } : {}),
    ...(sink.agentAvatars.length > 0
      ? { agentAvatars: sink.agentAvatars }
      : {}),
    ...(sink.privateAssets.length > 0
      ? { privateAssets: sink.privateAssets }
      : {}),
  };
}

function parseImportPayload(
  payload: unknown,
  bundleEntries?: Set<string>
): AgentImportResult {
  const warnings: string[] = [];
  const importedWorldbooks: ImportedWorldbookSource[] = [];

  if (isSillyTavernCard(payload)) {
    const draft = convertSillyTavernCard(payload);
    postProcessSillyTavernDraft(draft, 0, importedWorldbooks, warnings);
    return {
      agents: [draft],
      source: "silly-tavern",
      warnings,
      ...(importedWorldbooks.length > 0 ? { importedWorldbooks } : {}),
    };
  }
  if (!isRecord(payload)) throw new Error("Unsupported agent file");

  const isAioExport =
    payload.type === "AIO_Agent_Export" && Array.isArray(payload.agents);

  // VCP Chat 的 config.json 顶层恰有 name 时会命中下方单对象兜底被误当
  // AIO Agent 导入；按桌面 isVcpChatConfig 特征识别后跳过并明确提示。
  if (!isAioExport && isVcpChatConfigPayload(payload)) {
    return {
      agents: [],
      source: "aio",
      warnings: [
        "检测到 VCP Chat 配置文件，移动端暂不支持 VCP Chat 配置导入，已跳过该文件。",
      ],
    };
  }

  const candidates =
    payload.type === "AIO_Agent_Export" && Array.isArray(payload.agents)
      ? payload.agents
      : [payload];
  const agents = candidates
    .map(normalizeAioAgent)
    .filter((agent): agent is ImportedAgentDraft => agent !== null);
  if (agents.length === 0) throw new Error("No valid agents found");
  agents.forEach((agent, index) =>
    postProcessAioAgent(
      agent,
      index,
      importedWorldbooks,
      warnings,
      bundleEntries
    )
  );
  collectScriptRegexWarnings(agents, warnings);
  return {
    agents,
    source: "aio",
    warnings,
    ...(importedWorldbooks.length > 0 ? { importedWorldbooks } : {}),
  };
}

export function useAgentImporter() {
  async function parseFile(file: File): Promise<AgentImportResult> {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".zip")) {
      return parseAgentBundle(new Uint8Array(await file.arrayBuffer()));
    }

    if (lowerName.endsWith(".png") || file.type === "image/png") {
      const buffer = await file.arrayBuffer();
      const chunks = await extractPngTextChunks(buffer);
      // ST 卡与 AIO 包并存时保持 ST 卡优先
      const encoded = chunks.ccv3 || chunks.chara;
      let result: AgentImportResult;
      if (encoded) {
        result = parseImportPayload(decodeBase64Json(encoded));
      } else if (chunks.aiob) {
        const bundle = JSON.parse(chunks.aiob) as {
          type?: unknown;
          compressed?: unknown;
          data?: unknown;
        };
        if (
          !isRecord(bundle) ||
          bundle.type !== "AIO_Agent_Bundle" ||
          typeof bundle.data !== "string"
        ) {
          throw new Error("PNG does not contain a character card");
        }
        const bytes = base64ToBytes(bundle.data);
        // compressed 恒为 true（data 是 ZIP）；兼容 compressed=false 的 JSON 直存
        result =
          bundle.compressed === false
            ? parseImportPayload(
                JSON.parse(new TextDecoder().decode(bytes))
              )
            : parseAgentBundle(bytes);
        result.warnings.unshift("已从 AIO PNG 包导入。");
      } else {
        throw new Error("PNG does not contain a character card");
      }
      if (file.size <= 3 * 1024 * 1024) {
        const avatarDataUrl = `data:image/png;base64,${bytesToBase64(new Uint8Array(buffer))}`;
        result.agents = result.agents.map((agent) => ({
          ...agent,
          avatarDataUrl,
        }));
      }
      return result;
    }

    if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
      return parseImportPayload(loadYaml(await file.text()));
    }
    return parseImportPayload(JSON.parse(await file.text()));
  }

  return { parseFile };
}
