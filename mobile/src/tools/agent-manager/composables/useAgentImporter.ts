import type { ChatAgent, PresetMessage } from "../types/agent";

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

function normalizePresetMessages(value: unknown): PresetMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((message) => ({
      ...message,
      id: readString(message, "id") || crypto.randomUUID(),
      parentId: typeof message.parentId === "string" ? message.parentId : null,
      childrenIds: Array.isArray(message.childrenIds) ? message.childrenIds : [],
      role: ["system", "user", "assistant"].includes(readString(message, "role"))
        ? (readString(message, "role") as PresetMessage["role"])
        : "system",
      status: ["generating", "complete", "error"].includes(readString(message, "status"))
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
  if (value.spec === "chara_card_v2" || value.spec === "chara_card_v3") return true;
  const data = isRecord(value.data) ? value.data : value;
  return Boolean(readString(data, "name") && "first_mes" in data);
}

function convertSillyTavernCard(card: UnknownRecord): ImportedAgentDraft {
  const data = isRecord(card.data) ? { ...card, ...card.data } : card;
  const name = readString(data, "name") || "Imported character";
  const messages: PresetMessage[] = [];
  const append = (key: string, label: string, prefix?: string) => {
    const content = readString(data, key).trim();
    if (!content) return;
    messages.push(createMessage(prefix ? `${prefix}\n${content}` : content, label));
  };

  append("system_prompt", "System Prompt");
  append("description", "Description", "[Character Description]");
  append("personality", "Personality", "[Character Personality]");
  append("scenario", "Scenario", "[Scenario]");
  append("mes_example", "Example Messages", "[Example Dialogue]");

  const postHistory = readString(data, "post_history_instructions").trim();
  if (postHistory) {
    messages.push(createMessage(postHistory, "Post History Instructions", {
      type: "depth",
      depth: 0,
      order: 100,
    }));
  }

  const alternateGreetings = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.filter((item): item is string => typeof item === "string")
    : [];
  const firstMessage = readString(data, "first_mes");

  return {
    version: 2,
    name,
    displayName: name,
    description: readString(data, "description") || readString(data, "creator_notes"),
    category: "character",
    icon: "Bot",
    presetMessages: messages,
    presetGroups: [],
    greetings: [firstMessage, ...alternateGreetings].filter(Boolean),
  };
}

function decodeBase64Json(value: string): unknown {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function extractPngTextChunks(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const chunks: Record<string, string> = {};
  if (bytes.length < 8 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
    return chunks;
  }

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const type = new TextDecoder("latin1").decode(bytes.subarray(typeStart, dataStart));
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const separator = data.indexOf(0);
      if (separator >= 0) {
        const key = new TextDecoder("latin1").decode(data.subarray(0, separator));
        chunks[key] = new TextDecoder("latin1").decode(data.subarray(separator + 1));
      }
    } else if (type === "iTXt") {
      const separator = data.indexOf(0);
      if (separator >= 0 && data[separator + 1] === 0) {
        let cursor = separator + 3;
        const languageEnd = data.indexOf(0, cursor);
        if (languageEnd >= 0) {
          cursor = languageEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0) {
            const key = new TextDecoder("latin1").decode(data.subarray(0, separator));
            chunks[key] = new TextDecoder().decode(data.subarray(translatedEnd + 1));
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
    return { agents: [convertSillyTavernCard(payload)], source: "silly-tavern" };
  }
  if (!isRecord(payload)) throw new Error("Unsupported agent file");

  const candidates = payload.type === "AIO_Agent_Export" && Array.isArray(payload.agents)
    ? payload.agents
    : [payload];
  const agents = candidates.map(normalizeAioAgent).filter((agent): agent is ImportedAgentDraft => agent !== null);
  if (agents.length === 0) throw new Error("No valid agents found");
  return { agents, source: "aio" };
}

export function useAgentImporter() {
  async function parseFile(file: File): Promise<AgentImportResult> {
    if (file.name.toLowerCase().endsWith(".png") || file.type === "image/png") {
      const chunks = extractPngTextChunks(await file.arrayBuffer());
      const encoded = chunks.ccv3 || chunks.chara;
      if (!encoded) throw new Error("PNG does not contain a character card");
      return parseImportPayload(decodeBase64Json(encoded));
    }
    return parseImportPayload(JSON.parse(await file.text()));
  }

  return { parseFile };
}
