import { v4 as uuidv4 } from "uuid";
import {
  AgentCategory,
  type ChatAgent,
  type GreetingMessage,
  type PresetMessage,
} from "../types/agent";

export type ImportedAgentDraft = Partial<ChatAgent> & Pick<ChatAgent, "name">;

export interface AgentImportResult {
  agents: ImportedAgentDraft[];
  source: "aio" | "silly-tavern";
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

function parseImportPayload(payload: unknown): AgentImportResult {
  if (isSillyTavernCard(payload)) {
    return {
      agents: [convertSillyTavernCard(payload)],
      source: "silly-tavern",
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
  return { agents, source: "aio" };
}

export function useAgentImporter() {
  async function parseFile(file: File): Promise<AgentImportResult> {
    if (file.name.toLowerCase().endsWith(".png") || file.type === "image/png") {
      const buffer = await file.arrayBuffer();
      const chunks = await extractPngTextChunks(buffer);
      const encoded = chunks.ccv3 || chunks.chara;
      if (!encoded) throw new Error("PNG does not contain a character card");
      const result = parseImportPayload(decodeBase64Json(encoded));
      if (file.size <= 3 * 1024 * 1024) {
        const avatarDataUrl = `data:image/png;base64,${bytesToBase64(new Uint8Array(buffer))}`;
        result.agents = result.agents.map((agent) => ({
          ...agent,
          avatarDataUrl,
        }));
      }
      return result;
    }
    return parseImportPayload(JSON.parse(await file.text()));
  }

  return { parseFile };
}
