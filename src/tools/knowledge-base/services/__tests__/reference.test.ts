import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createKnowledgeReference,
  normalizeKnowledgeReference,
  validateKnowledgeReferenceForAgent,
} from "../reference";
import type {
  AgentKnowledgeAccess,
  KnowledgeLibrarySummary,
} from "../../types";

const { listAuthorizedKnowledgeLibraries } = vi.hoisted(() => ({
  listAuthorizedKnowledgeLibraries: vi.fn(),
}));

vi.mock("../access", async (importOriginal) => {
  const original = await importOriginal<typeof import("../access")>();
  return {
    ...original,
    listAuthorizedKnowledgeLibraries,
  };
});

const access: AgentKnowledgeAccess = {
  enabled: true,
  allowedLibraryIds: ["library-a", "library-b"],
  allowSearchAll: false,
  allowDocumentRead: true,
  allowResearch: false,
};

function library(
  id: string,
  overrides: Partial<KnowledgeLibrarySummary> = {}
): KnowledgeLibrarySummary {
  return {
    id,
    name: `Library ${id}`,
    documentCount: 1,
    availability: "available",
    supportsKeywordSearch: true,
    supportsSemanticSearch: false,
    indexStatus: { keyword: "ready", semantic: "notBuilt" },
    ...overrides,
  };
}

describe("KnowledgeReference", () => {
  beforeEach(() => {
    listAuthorizedKnowledgeLibraries.mockReset();
  });

  it("normalizes IDs while retaining versioned display snapshots", () => {
    const reference = normalizeKnowledgeReference({
      schemaVersion: 1,
      type: "knowledge",
      libraryIds: ["library-a", "library-a", "library-b"],
      mode: "search",
      libraries: [
        { id: "library-a", name: "旧名称", availability: "available" },
      ],
    });

    expect(reference?.libraryIds).toEqual(["library-a", "library-b"]);
    expect(reference?.libraries).toEqual([
      { id: "library-a", name: "旧名称", availability: "available" },
      { id: "library-b", name: "library-b", availability: "unavailable" },
    ]);
  });

  it("refreshes renamed libraries during preflight without changing IDs", async () => {
    listAuthorizedKnowledgeLibraries.mockResolvedValue([
      library("library-a", { name: "新名称" }),
    ]);
    const reference = createKnowledgeReference([
      library("library-a", { name: "旧名称" }),
    ]);

    const result = await validateKnowledgeReferenceForAgent(
      { agentId: "agent-a", access },
      reference
    );

    expect(result.libraryIds).toEqual(["library-a"]);
    expect(result.libraries[0].name).toBe("新名称");
  });

  it.each([
    ["deleted", "LIBRARY_DELETED"],
    ["unavailable", "LIBRARY_UNAVAILABLE"],
  ] as const)("blocks %s libraries", async (availability, code) => {
    listAuthorizedKnowledgeLibraries.mockResolvedValue([
      library("library-a", { availability }),
    ]);

    await expect(
      validateKnowledgeReferenceForAgent(
        { agentId: "agent-a", access },
        createKnowledgeReference([library("library-a")])
      )
    ).rejects.toMatchObject({ code });
  });

  it("blocks a library whose indexes are not ready", async () => {
    listAuthorizedKnowledgeLibraries.mockResolvedValue([
      library("library-a", {
        supportsKeywordSearch: false,
        indexStatus: { keyword: "unavailable", semantic: "notBuilt" },
      }),
    ]);

    await expect(
      validateKnowledgeReferenceForAgent(
        { agentId: "agent-a", access },
        createKnowledgeReference([library("library-a")])
      )
    ).rejects.toMatchObject({ code: "LIBRARY_INDEX_NOT_READY" });
  });

  it("blocks a library outside the current Agent authorization", async () => {
    await expect(
      validateKnowledgeReferenceForAgent(
        { agentId: "agent-a", access },
        createKnowledgeReference([library("library-c")])
      )
    ).rejects.toMatchObject({ code: "LIBRARY_UNAUTHORIZED" });
  });

  it("requires explicit research permission", async () => {
    await expect(
      validateKnowledgeReferenceForAgent(
        { agentId: "agent-a", access },
        createKnowledgeReference([library("library-a")], "research")
      )
    ).rejects.toMatchObject({ code: "RESEARCH_FORBIDDEN" });
  });

  it("opens research mode when the Agent has permission", async () => {
    listAuthorizedKnowledgeLibraries.mockResolvedValue([library("library-a")]);
    const result = await validateKnowledgeReferenceForAgent(
      { agentId: "agent-a", access: { ...access, allowResearch: true } },
      createKnowledgeReference([library("library-a")], "research")
    );
    expect(result.mode).toBe("research");
  });
});
