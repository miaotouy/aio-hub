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

/**
 * LLM Chat 会话批量导入导出服务
 */

import JSZip from "jszip";
import type { ChatSessionDetail, ChatSessionIndex } from "../types";
import { getEffectiveMessageCount } from "../utils/sessionMessageCount";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/sessionImportExportService");

export type SessionImportConflictStrategy = "keep" | "overwrite" | "skip";

export interface SessionExportOptions {
  exportedBy?: string;
}

export interface ExportableChatSession {
  index: ChatSessionIndex;
  detail: ChatSessionDetail;
}

export interface SessionBackupMetadata {
  format: "aiohub-chat-session-backup";
  version: string;
  exportedAt: string;
  sessions: ChatSessionIndex[];
  sessionCount: number;
}

export const SINGLE_SESSION_BACKUP_FORMAT = "aiohub-chat-session" as const;
export const SINGLE_SESSION_BACKUP_VERSION = "1.0.0" as const;

export interface SingleSessionBackup {
  format: typeof SINGLE_SESSION_BACKUP_FORMAT;
  version: typeof SINGLE_SESSION_BACKUP_VERSION;
  exportedAt: string;
  exportedBy?: string;
  session: ExportableChatSession;
}

export interface ParsedSessionImport {
  metadata: SessionBackupMetadata | null;
  sessions: ExportableChatSession[];
}

export interface ResolvedSessionImport {
  sessions: ExportableChatSession[];
  importedCount: number;
  skippedCount: number;
  renamedCount: number;
  overwrittenCount: number;
}

type RawSessionFile = Partial<ChatSessionIndex & ChatSessionDetail> & {
  index?: Partial<ChatSessionIndex>;
  detail?: Partial<ChatSessionDetail>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `session-${crypto.randomUUID()}`;
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSessionFile(
  raw: unknown,
  metadataIndex?: ChatSessionIndex
): ExportableChatSession | null {
  if (!isRecord(raw)) return null;

  const rawSession = raw as RawSessionFile;
  const rawIndex = isRecord(rawSession.index) ? rawSession.index : undefined;
  const rawDetail = isRecord(rawSession.detail) ? rawSession.detail : undefined;
  const flat = rawIndex && rawDetail ? { ...rawIndex, ...rawDetail } : raw;
  const typedFlat = flat as Partial<ChatSessionIndex & ChatSessionDetail>;
  const id = typedFlat.id;
  const nodes = typedFlat.nodes;
  const rootNodeId = typedFlat.rootNodeId;
  const activeLeafId = typedFlat.activeLeafId;

  if (
    typeof id !== "string" ||
    !id.trim() ||
    !isRecord(nodes) ||
    typeof rootNodeId !== "string" ||
    !rootNodeId.trim() ||
    typeof activeLeafId !== "string" ||
    !activeLeafId.trim() ||
    !Object.prototype.hasOwnProperty.call(nodes, rootNodeId) ||
    !Object.prototype.hasOwnProperty.call(nodes, activeLeafId)
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt =
    typedFlat.createdAt ||
    metadataIndex?.createdAt ||
    typedFlat.updatedAt ||
    now;
  const updatedAt =
    typedFlat.updatedAt || metadataIndex?.updatedAt || createdAt || now;
  const normalizedNodes = nodes as ChatSessionDetail["nodes"];
  const messageCount = getEffectiveMessageCount(normalizedNodes, rootNodeId);

  const index: ChatSessionIndex = {
    id,
    name:
      (typeof typedFlat.name === "string" && typedFlat.name.trim()
        ? typedFlat.name
        : metadataIndex?.name) || "导入会话",
    displayAgentId: typedFlat.displayAgentId ?? metadataIndex?.displayAgentId,
    messageCount,
    createdAt,
    updatedAt,
    isFavorite: typedFlat.isFavorite ?? metadataIndex?.isFavorite,
    favoriteFolderId:
      typedFlat.favoriteFolderId ?? metadataIndex?.favoriteFolderId ?? null,
  };

  const detail: ChatSessionDetail = {
    id,
    updatedAt,
    nodes: normalizedNodes,
    rootNodeId,
    activeLeafId,
    parameterOverrides:
      typedFlat.parameterOverrides || rawDetail?.parameterOverrides,
    history: typedFlat.history || rawDetail?.history || [],
    historyIndex: typedFlat.historyIndex ?? rawDetail?.historyIndex ?? -1,
    agentUsage: typedFlat.agentUsage || rawDetail?.agentUsage,
  };

  return { index, detail };
}

export function exportSessionAsBackupJson(
  session: ExportableChatSession,
  options: SessionExportOptions = {}
): string {
  const backup: SingleSessionBackup = {
    format: SINGLE_SESSION_BACKUP_FORMAT,
    version: SINGLE_SESSION_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...(options.exportedBy ? { exportedBy: options.exportedBy } : {}),
    session: {
      index: { ...session.index },
      detail: { ...session.detail },
    },
  };
  return JSON.stringify(backup, null, 2);
}

function parseSingleSessionJson(text: string): ParsedSessionImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("单会话导入文件不是有效的 JSON");
  }

  if (!isRecord(raw)) {
    throw new Error("单会话导入文件必须是 JSON 对象");
  }

  if (raw.format === SINGLE_SESSION_BACKUP_FORMAT) {
    if (raw.version !== SINGLE_SESSION_BACKUP_VERSION) {
      throw new Error(
        `不支持的单会话备份版本：${String(raw.version ?? "未知")}`
      );
    }
    const normalized = normalizeSessionFile(raw.session);
    if (!normalized) {
      throw new Error("单会话备份中的会话结构无效");
    }
    return { metadata: null, sessions: [normalized] };
  }

  const normalized = normalizeSessionFile(raw);
  if (!normalized) {
    throw new Error(
      "JSON 中未找到完整会话。请使用 Raw JSON 或 AIO Hub 备份 JSON，而不是阅读型 JSON。"
    );
  }
  return { metadata: null, sessions: [normalized] };
}

function toStoredSession(session: ExportableChatSession) {
  const { history, historyIndex, ...detailToSave } = session.detail;
  return {
    ...session.index,
    ...detailToSave,
  };
}

export async function exportSessionsAsZip(
  sessions: ExportableChatSession[],
  options: SessionExportOptions = {}
): Promise<Uint8Array> {
  const zip = new JSZip();
  const metadata: SessionBackupMetadata = {
    format: "aiohub-chat-session-backup",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    sessions: sessions.map((session) => ({
      ...session.index,
      messageCount: getEffectiveMessageCount(
        session.detail.nodes,
        session.detail.rootNodeId
      ),
    })),
    sessionCount: sessions.length,
  };

  zip.file(
    "metadata.json",
    JSON.stringify({ ...metadata, exportedBy: options.exportedBy }, null, 2)
  );

  const sessionsDir = zip.folder("sessions");
  for (const session of sessions) {
    sessionsDir?.file(
      `${session.index.id}.json`,
      JSON.stringify(toStoredSession(session), null, 2)
    );
  }

  logger.info("会话 ZIP 导出包已生成", { count: sessions.length });
  return zip.generateAsync({ type: "uint8array" });
}

export async function parseImportFile(
  fileData: ArrayBuffer | Uint8Array
): Promise<ParsedSessionImport> {
  const bytes =
    fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
  if (text.trimStart()[0] === "{") {
    const parsed = parseSingleSessionJson(text);
    logger.info("单会话 JSON 导入文件解析完成", {
      count: parsed.sessions.length,
    });
    return parsed;
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(fileData);
  } catch {
    throw new Error("导入文件不是受支持的 ZIP 备份或 JSON 会话");
  }

  const metadataFile = zip.file("metadata.json");
  const metadata = metadataFile
    ? (JSON.parse(await metadataFile.async("string")) as SessionBackupMetadata)
    : null;
  const metadataMap = new Map(
    (metadata?.sessions || []).map((session) => [session.id, session])
  );

  const sessionFiles = Object.values(zip.files).filter(
    (file) => !file.dir && /^sessions\/.+\.json$/i.test(file.name)
  );
  const sessions: ExportableChatSession[] = [];

  for (const file of sessionFiles) {
    const raw = JSON.parse(await file.async("string")) as RawSessionFile;
    const idFromFile = file.name
      .split("/")
      .pop()
      ?.replace(/\.json$/i, "");
    const normalized = normalizeSessionFile(
      raw,
      idFromFile ? metadataMap.get(idFromFile) : undefined
    );
    if (normalized) {
      sessions.push(normalized);
    }
  }

  if (sessions.length === 0) {
    throw new Error("导入包中未找到有效会话");
  }

  logger.info("会话 ZIP 导入包解析完成", { count: sessions.length });
  return { metadata, sessions };
}

export function resolveConflicts(
  imported: ExportableChatSession[],
  strategy: SessionImportConflictStrategy,
  existingIds: Set<string>
): ResolvedSessionImport {
  const usedIds = new Set(existingIds);
  const sessions: ExportableChatSession[] = [];
  let skippedCount = 0;
  let renamedCount = 0;
  let overwrittenCount = 0;

  for (const session of imported) {
    const hasConflict = existingIds.has(session.index.id);

    if (hasConflict && strategy === "skip") {
      skippedCount++;
      continue;
    }

    if (hasConflict && strategy === "keep") {
      let newId = createSessionId();
      while (usedIds.has(newId)) {
        newId = createSessionId();
      }
      usedIds.add(newId);
      sessions.push({
        index: {
          ...session.index,
          id: newId,
          name: `${session.index.name} (导入副本)`,
        },
        detail: {
          ...session.detail,
          id: newId,
        },
      });
      renamedCount++;
      continue;
    }

    if (hasConflict && strategy === "overwrite") {
      overwrittenCount++;
    }

    usedIds.add(session.index.id);
    sessions.push(session);
  }

  return {
    sessions,
    importedCount: sessions.length,
    skippedCount,
    renamedCount,
    overwrittenCount,
  };
}
