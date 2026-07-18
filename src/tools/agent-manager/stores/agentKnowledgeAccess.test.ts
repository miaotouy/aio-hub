import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAgentStore } from "./agentStore";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ enabledProfiles: { value: [] } }),
}));
vi.mock("../config/defaultAgentTemplate", () => ({
  createDefaultAgentTemplate: () => ({}),
}));
vi.mock("../composables/storage/useAgentStorage", () => ({
  useAgentStorage: () => ({
    getAgentDirPath: async (agentId: string) => `agents/${agentId}`,
  }),
}));
vi.mock("../services/agentExportService", () => ({ exportAgents: vi.fn() }));
vi.mock("../services/agentImportService", () => ({
  preflightImportAgents: vi.fn(),
  preflightParsedAgentImportBundle: vi.fn(),
  commitImportAgents: vi.fn(),
}));
vi.mock("../services/agentAssetService", () => ({
  ensurePresetAssetsImported: vi.fn(),
}));

describe("Agent Knowledge access lifecycle", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invoke.mockReset();
    invoke.mockResolvedValue(false);
  });

  it("creates agents with the final access schema only", () => {
    const store = useAgentStore();
    store.persistAgent = vi.fn();

    const id = store.createAgent("agent", "profile", "model");
    const agent = store.getAgentById(id)!;

    expect(agent.knowledgeAccess).toEqual({
      enabled: false,
      allowedLibraryIds: [],
      allowSearchAll: false,
      allowDocumentRead: false,
      allowResearch: false,
    });
    expect(agent).not.toHaveProperty("knowledgeConfig");
    expect(agent).not.toHaveProperty("knowledgeSettings");
  });

  it("copies stable access IDs without introducing retrieval settings", async () => {
    const store = useAgentStore();
    store.persistAgent = vi.fn();
    const id = store.createAgent("agent", "profile", "model", {
      knowledgeAccess: {
        enabled: true,
        allowedLibraryIds: ["library-a"],
        allowSearchAll: true,
        allowDocumentRead: true,
        allowResearch: false,
      },
    });

    const copyId = await store.duplicateAgent(id);
    const copy = store.getAgentById(copyId!)!;
    expect(copy.knowledgeAccess).toEqual(
      store.getAgentById(id)!.knowledgeAccess
    );
    expect(copy.knowledgeAccess).not.toBe(
      store.getAgentById(id)!.knowledgeAccess
    );
    expect(copy).not.toHaveProperty("knowledgeConfig");
    expect(copy).not.toHaveProperty("knowledgeSettings");
  });
});
