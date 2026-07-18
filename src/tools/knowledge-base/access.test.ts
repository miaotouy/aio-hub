import { describe, expect, it } from "vitest";
import {
  KnowledgeAccessError,
  assertKnowledgeLibraryAvailable,
  listAuthorizedKnowledgeLibraries,
  normalizeAgentKnowledgeAccess,
  resolveAuthorizedLibraryIds,
} from "./access";
import type { AgentKnowledgeAccess, KnowledgeLibrary } from "./types";

const access: AgentKnowledgeAccess = {
  enabled: true,
  allowedLibraryIds: ["library-a", "library-b"],
  allowSearchAll: true,
  allowDocumentRead: false,
  allowResearch: false,
};

describe("Knowledge access", () => {
  it("normalizes stable IDs without names or duplicates", () => {
    expect(
      normalizeAgentKnowledgeAccess({
        enabled: true,
        allowedLibraryIds: [" library-a ", "library-a", ""],
      }).allowedLibraryIds
    ).toEqual(["library-a"]);
  });

  it("resolves omitted scope only when search-all is allowed", () => {
    expect(resolveAuthorizedLibraryIds(access)).toEqual([
      "library-a",
      "library-b",
    ]);
    expect(() =>
      resolveAuthorizedLibraryIds({ ...access, allowSearchAll: false })
    ).toThrowError(
      expect.objectContaining<Partial<KnowledgeAccessError>>({
        code: "LIBRARY_ID_REQUIRED",
      })
    );
  });

  it("rejects unauthorized libraries instead of changing the scope", () => {
    expect(() =>
      resolveAuthorizedLibraryIds(access, ["library-other"])
    ).toThrowError(
      expect.objectContaining<Partial<KnowledgeAccessError>>({
        code: "LIBRARY_UNAUTHORIZED",
        libraryId: "library-other",
      })
    );
  });

  it("keeps deleted and temporarily unavailable grants visible", async () => {
    const library = {
      id: "library-a",
      name: "Docs",
      documentCount: 2,
      activeEmbeddingSpaceId: "",
    } as KnowledgeLibrary;
    const resolved = await listAuthorizedKnowledgeLibraries(
      access,
      async () => [library]
    );
    expect(resolved.map((item) => item.availability)).toEqual([
      "available",
      "deleted",
    ]);
    expect(() => assertKnowledgeLibraryAvailable(resolved[1])).toThrowError(
      expect.objectContaining<Partial<KnowledgeAccessError>>({
        code: "LIBRARY_DELETED",
      })
    );

    const unavailable = await listAuthorizedKnowledgeLibraries(
      access,
      async () => {
        throw new Error("offline");
      }
    );
    expect(
      unavailable.every((item) => item.availability === "unavailable")
    ).toBe(true);
  });
});
