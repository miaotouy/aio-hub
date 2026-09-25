import { unzipSync, type Unzipped } from "fflate";
import { load as loadYaml } from "js-yaml";
import { v4 as uuidv4 } from "uuid";
import {
  AgentCategory,
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

export interface AgentImportResult {
  agents: ImportedAgentDraft[];
  source: "aio" | "silly-tavern";
  /** 不可表达语义 / 未消费资源的汇总提示，由调用方透出给用户 */
  warnings: string[];
  /** ST 卡内嵌世界书（含 V2 data.character_book 与 V3 extensions.character_book） */
  importedWorldbooks?: ImportedWorldbookSource[];
}

type UnknownRecord = Record<string, unknown>;

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
  return value.filter(isRecord).map((message) => ({
    ...message,
    id: readString(message, "id") || crypto.randomUUID(),
    parentId: typeof message.parentId === "string" ? message.parentId : null,
    childrenIds: Array.isArray(message.childrenIds) ? message.childrenIds : [],
    role: ["system", "user", "assistant"].includes(readString(message, "role"))
      ? (readString(message, "role") as PresetMessage["role"])
      : "system",
    status: ["generating", "complete", "error"].includes(
      readString(message, "status")
    )
      ? (readString(message, "status") as PresetMessage["status"])
      : "complete",
    content: readString(message, "content"),
    timestamp: readString(message, "timestamp") || new Date().toISOString(),
  })) as PresetMessage[];
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
  delete normalized.id;
  delete normalized.createdAt;
  delete normalized.lastUsedAt;
  return normalized;
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
 * 把 ST regex_scripts 数组转换为移动端 request 阶段可执行的预设。
 * 只保留 regex-processor 能表达的语义；其余进 warnings（不静默）。
 */
function convertRegexScripts(
  scripts: unknown,
  presetName: string,
  warnings: string[]
): MobileRegexConfig | undefined {
  if (!Array.isArray(scripts)) return undefined;
  const rules: MobileRegexConfig["presets"][number]["rules"] = [];
  let skippedRenderOnly = 0;
  let skippedEmpty = 0;
  let warnedAdvancedFields = false;

  scripts.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const script = raw as STRegexScript;
    const findRegex = typeof script.findRegex === "string" ? script.findRegex : "";
    if (!findRegex) {
      skippedEmpty++;
      return;
    }
    // markdownOnly = 仅渲染阶段；移动端暂无渲染层正则，无法表达
    if (script.markdownOnly) {
      skippedRenderOnly++;
      return;
    }
    if (
      !warnedAdvancedFields &&
      (Array.isArray(script.trimStrings) ||
        (script.substituteRegex ?? 0) !== 0)
    ) {
      warnings.push("正则脚本的 trimStrings / substituteRegex 高级选项未迁移。");
      warnedAdvancedFields = true;
    }
    const { pattern, flags } = parseRegexString(findRegex);
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
      // promptOnly / 默认均落到 request；render 阶段留给批次 4
      applyTo: { render: false, request: true },
      targetRoles: convertPlacementToTargetRoles(script),
      depthRange,
      order: index,
    });
  });

  if (skippedRenderOnly > 0) {
    warnings.push(
      `跳过 ${skippedRenderOnly} 条仅渲染（markdownOnly）正则规则：移动端暂不支持渲染层正则。`
    );
  }
  if (skippedEmpty > 0) {
    warnings.push(`跳过 ${skippedEmpty} 条缺少匹配表达式的正则规则。`);
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
      warnings.push(
        `已转换 ${regexConfig.presets[0].rules.length} 条请求阶段正则规则。`
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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

function findConfigEntry(entries: Unzipped): {
  name: string;
  data: Uint8Array;
} | null {
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/") || data.length === 0) continue;
    if (AGENT_CONFIG_JSON.test(name)) return { name, data };
  }
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/") || data.length === 0) continue;
    if (AGENT_CONFIG_YAML.test(name)) return { name, data };
  }
  return null;
}

/** 统计包内未被消费的资源文件（assets、世界书等） */
function countUnconsumedEntries(entries: Unzipped): number {
  return Object.keys(entries).filter(
    (name) =>
      !name.endsWith("/") &&
      !AGENT_CONFIG_JSON.test(name) &&
      !AGENT_CONFIG_YAML.test(name)
  ).length;
}

function parseConfigBytes(name: string, data: Uint8Array): unknown {
  const text = new TextDecoder().decode(data);
  if (AGENT_CONFIG_YAML.test(name)) return loadYaml(text);
  return JSON.parse(text);
}

/**
 * 解析 AIO Agent Bundle（.agent.zip 或 PNG aiob chunk 内的 ZIP）。
 * 本阶段只消费包内 *.agent.json / *.agent.yaml 配置；
 * assets/、worldbooks/ 等资源不解包消费，统一通过 warnings 告知。
 */
function parseAgentBundle(zipBytes: Uint8Array): AgentImportResult {
  let entries: Unzipped;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new Error("Unsupported agent file");
  }
  const config = findConfigEntry(entries);
  if (!config) {
    throw new Error("Unsupported agent file");
  }
  const payload = parseConfigBytes(config.name, config.data);
  const result = parseImportPayload(payload);

  const unconsumed = countUnconsumedEntries(entries);
  if (unconsumed > 0) {
    result.warnings.push(
      `导入包内 ${unconsumed} 个资源文件（头像、资产、世界书等）暂未迁移，可在 PC 端查看。`
    );
  }
  return result;
}

function parseImportPayload(payload: unknown): AgentImportResult {
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

  const candidates =
    payload.type === "AIO_Agent_Export" && Array.isArray(payload.agents)
      ? payload.agents
      : [payload];
  const agents = candidates
    .map(normalizeAioAgent)
    .filter((agent): agent is ImportedAgentDraft => agent !== null);
  if (agents.length === 0) throw new Error("No valid agents found");
  return { agents, source: "aio", warnings };
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
