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
  index?: ChatSessionIndex;
  detail?: ChatSessionDetail;
};

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `session-${crypto.randomUUID()}`;
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSessionFile(
  raw: RawSessionFile,
  metadataIndex?: ChatSessionIndex
): ExportableChatSession | null {
  const flat = raw.index && raw.detail ? { ...raw.index, ...raw.detail } : raw;
  const id = flat.id || raw.index?.id || raw.detail?.id;
  const nodes = flat.nodes || raw.detail?.nodes;
  const rootNodeId = flat.rootNodeId || raw.detail?.rootNodeId;
  const activeLeafId = flat.activeLeafId || raw.detail?.activeLeafId;

  if (!id || !nodes || !rootNodeId || !activeLeafId) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt =
    flat.createdAt || metadataIndex?.createdAt || flat.updatedAt || now;
  const updatedAt =
    flat.updatedAt || metadataIndex?.updatedAt || createdAt || now;
  const messageCount = getEffectiveMessageCount(nodes, rootNodeId);

  const index: ChatSessionIndex = {
    id,
    name: flat.name || metadataIndex?.name || "导入会话",
    displayAgentId: flat.displayAgentId ?? metadataIndex?.displayAgentId,
    messageCount,
    createdAt,
    updatedAt,
    isFavorite: flat.isFavorite ?? metadataIndex?.isFavorite,
    favoriteFolderId:
      flat.favoriteFolderId ?? metadataIndex?.favoriteFolderId ?? null,
  };

  const detail: ChatSessionDetail = {
    id,
    updatedAt,
    nodes,
    rootNodeId,
    activeLeafId,
    parameterOverrides:
      flat.parameterOverrides || raw.detail?.parameterOverrides,
    history: flat.history || raw.detail?.history || [],
    historyIndex: flat.historyIndex ?? raw.detail?.historyIndex ?? -1,
    agentUsage: flat.agentUsage || raw.detail?.agentUsage,
  };

  return { index, detail };
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
  const zip = await JSZip.loadAsync(fileData);
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
