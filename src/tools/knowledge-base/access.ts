import { listKnowledgeLibraries } from "./service";
import type {
  AgentKnowledgeAccess,
  KnowledgeLibrary,
  KnowledgeLibrarySummary,
} from "./types";

export const DEFAULT_AGENT_KNOWLEDGE_ACCESS: AgentKnowledgeAccess = {
  enabled: false,
  allowedLibraryIds: [],
  allowSearchAll: false,
  allowDocumentRead: false,
  allowResearch: false,
};

export type KnowledgeAccessErrorCode =
  | "KNOWLEDGE_DISABLED"
  | "LIBRARY_ID_REQUIRED"
  | "LIBRARY_UNAUTHORIZED"
  | "LIBRARY_UNAVAILABLE"
  | "LIBRARY_DELETED";

export class KnowledgeAccessError extends Error {
  constructor(
    readonly code: KnowledgeAccessErrorCode,
    message: string,
    readonly libraryId?: string
  ) {
    super(message);
    this.name = "KnowledgeAccessError";
  }
}

export function normalizeAgentKnowledgeAccess(
  access?: Partial<AgentKnowledgeAccess>
): AgentKnowledgeAccess {
  return {
    ...DEFAULT_AGENT_KNOWLEDGE_ACCESS,
    ...access,
    allowedLibraryIds: Array.from(
      new Set(
        (access?.allowedLibraryIds ?? []).map((id) => id.trim()).filter(Boolean)
      )
    ),
  };
}

export function resolveAuthorizedLibraryIds(
  access: AgentKnowledgeAccess | undefined,
  requestedLibraryIds?: string[]
): string[] {
  const normalized = normalizeAgentKnowledgeAccess(access);
  if (!normalized.enabled) {
    throw new KnowledgeAccessError(
      "KNOWLEDGE_DISABLED",
      "当前 Agent 未启用 Knowledge 资料访问"
    );
  }

  const requested = Array.from(
    new Set((requestedLibraryIds ?? []).map((id) => id.trim()).filter(Boolean))
  );
  if (!requested.length) {
    if (!normalized.allowSearchAll) {
      throw new KnowledgeAccessError(
        "LIBRARY_ID_REQUIRED",
        "当前 Agent 必须明确指定要查询的资料库"
      );
    }
    return [...normalized.allowedLibraryIds];
  }

  const allowed = new Set(normalized.allowedLibraryIds);
  const unauthorized = requested.find((id) => !allowed.has(id));
  if (unauthorized) {
    throw new KnowledgeAccessError(
      "LIBRARY_UNAUTHORIZED",
      `当前 Agent 未获授权访问资料库: ${unauthorized}`,
      unauthorized
    );
  }
  return requested;
}

function toAvailableSummary(
  library: KnowledgeLibrary
): KnowledgeLibrarySummary {
  return {
    id: library.id,
    name: library.name,
    description: library.description,
    documentCount: library.documentCount,
    availability: "available",
    supportsKeywordSearch: true,
    supportsSemanticSearch: Boolean(library.activeEmbeddingSpaceId),
  };
}

export async function listAuthorizedKnowledgeLibraries(
  access: AgentKnowledgeAccess | undefined,
  loadLibraries: () => Promise<KnowledgeLibrary[]> = listKnowledgeLibraries
): Promise<KnowledgeLibrarySummary[]> {
  const normalized = normalizeAgentKnowledgeAccess(access);
  if (!normalized.enabled) return [];

  let libraries: KnowledgeLibrary[];
  try {
    libraries = await loadLibraries();
  } catch {
    return normalized.allowedLibraryIds.map((id) => ({
      id,
      name: "资料库暂时不可用",
      documentCount: 0,
      availability: "unavailable",
      supportsKeywordSearch: false,
      supportsSemanticSearch: false,
    }));
  }

  const byId = new Map(libraries.map((library) => [library.id, library]));
  return normalized.allowedLibraryIds.map((id) => {
    const library = byId.get(id);
    if (library) return toAvailableSummary(library);
    return {
      id,
      name: "已删除的资料库",
      documentCount: 0,
      availability: "deleted" as const,
      supportsKeywordSearch: false,
      supportsSemanticSearch: false,
    };
  });
}

export function assertKnowledgeLibraryAvailable(
  summary: KnowledgeLibrarySummary
): void {
  if (summary.availability === "available") return;
  const code =
    summary.availability === "deleted"
      ? "LIBRARY_DELETED"
      : "LIBRARY_UNAVAILABLE";
  throw new KnowledgeAccessError(
    code,
    summary.availability === "deleted"
      ? `资料库已删除: ${summary.id}`
      : `资料库暂时不可用: ${summary.id}`,
    summary.id
  );
}

export function formatKnowledgeLibraryDirectory(
  summaries: KnowledgeLibrarySummary[]
): string {
  if (!summaries.length) return "未授权任何 Knowledge 资料库。";
  return summaries
    .map((library) => {
      const description = library.description?.trim();
      const details = [
        description,
        `${library.documentCount} 个来源`,
        library.availability === "available"
          ? undefined
          : library.availability === "deleted"
            ? "状态=已删除"
            : "状态=暂时不可用",
      ].filter(Boolean);
      return `- ${library.name} (id=${library.id}): ${details.join("；")}`;
    })
    .join("\n");
}
