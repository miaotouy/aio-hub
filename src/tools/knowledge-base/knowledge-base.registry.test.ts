import { describe, expect, it, vi } from "vitest";
import knowledgeRegistry from "./knowledge-base.registry";

const applicationContext = {
  agentId: "agent-1",
  access: {
    enabled: true,
    allowedLibraryIds: ["library-1"],
    allowSearchAll: true,
    allowDocumentRead: true,
    allowResearch: false,
  },
};

const listKnowledgeForAgent = vi.hoisted(() => vi.fn());
const searchKnowledgeForAgent = vi.hoisted(() => vi.fn());
const readKnowledgeForAgent = vi.hoisted(() => vi.fn());

vi.mock("./application", () => ({
  resolveKnowledgeApplicationContext: () => applicationContext,
  listKnowledgeForAgent,
  parseKnowledgeToolSearchRequest: (args: unknown) => args,
  searchKnowledgeForAgent,
  parseKnowledgeToolReadRequest: (args: unknown) => args,
  readKnowledgeForAgent,
}));

describe("Knowledge tool registry", () => {
  it("registers the list/search/read atomic methods and research task", () => {
    const methods = knowledgeRegistry.getMetadata!().methods;
    expect(methods.map((method) => method.name)).toEqual([
      "listLibraries",
      "search",
      "read",
      "research",
    ]);
    expect(methods.every((method) => method.agentCallable)).toBe(true);
    const parameterNames = methods.flatMap((method) =>
      method.parameters.map((parameter) => parameter.name)
    );
    expect(parameterNames).not.toEqual(
      expect.arrayContaining([
        "spaceId",
        "batchSize",
        "actualDimensions",
        "fusionWeight",
      ])
    );
  });

  it("returns source audit metadata from listLibraries", async () => {
    listKnowledgeForAgent.mockResolvedValue([
      {
        id: "library-1",
        name: "Docs",
        documentCount: 2,
        availability: "available",
        supportsKeywordSearch: true,
        supportsSemanticSearch: false,
        indexStatus: { keyword: "ready", semantic: "notBuilt" },
      },
    ]);
    const result = await knowledgeRegistry.listLibraries({}, {} as any);
    expect(result).toMatchObject({
      result: { libraries: [{ id: "library-1" }] },
      executionMetadata: {
        agentId: "agent-1",
        sourceCount: 1,
        sources: [{ libraryId: "library-1", availability: "available" }],
      },
    });
  });
});
