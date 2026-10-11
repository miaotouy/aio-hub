// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentAgentId: { value: "agent-a" },
  knowledgeReference: { value: null as any },
  setKnowledgeReference: vi.fn(),
  listKnowledgeForAgent: vi.fn(),
}));
vi.mock("../../composables/ui/useLlmChatUiState", async () => {
  const { ref } = await import("vue");
  mocks.currentAgentId = ref("agent-a");
  return {
    useLlmChatUiState: () => ({ currentAgentId: mocks.currentAgentId }),
  };
});
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    getAgentById: (id: string) => ({
      id,
      knowledgeAccess: {
        enabled: true,
        allowedLibraryIds: ["library-a", "library-b", "library-c"],
        allowSearchAll: false,
        allowDocumentRead: true,
        allowResearch: false,
      },
    }),
  }),
}));
vi.mock("../../composables/input/useChatInputManager", async () => {
  const { ref } = await import("vue");
  mocks.knowledgeReference = ref(null);
  return {
    useChatInputManager: () => ({
      knowledgeReference: mocks.knowledgeReference,
      setKnowledgeReference: mocks.setKnowledgeReference,
    }),
  };
});
vi.mock("@/tools/knowledge-base/services/application", () => ({
  listKnowledgeForAgent: mocks.listKnowledgeForAgent,
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
const KnowledgeReferencePanel = (await import("./KnowledgeReferencePanel.vue"))
  .default;
const readyLibrary = (id: string) => ({
  id,
  name: id,
  documentCount: 3,
  availability: "available",
  supportsKeywordSearch: true,
  supportsSemanticSearch: false,
  indexStatus: { keyword: "ready", semantic: "notBuilt" },
});
let wrapper: VueWrapper;
function mountPanel() {
  wrapper = mount(KnowledgeReferencePanel, {
    global: {
      stubs: { "el-switch": true, "el-button": true, "el-empty": true },
    },
  });
  return wrapper;
}

// Protects authorized reference writes and stale-request isolation; the assertions
// remain valid if the panel's presentation or loading implementation changes.
describe("Knowledge reference panel", () => {
  beforeEach(() => {
    mocks.currentAgentId.value = "agent-a";
    mocks.knowledgeReference.value = null;
    mocks.setKnowledgeReference.mockReset().mockImplementation((value) => {
      mocks.knowledgeReference.value = value;
    });
    mocks.listKnowledgeForAgent
      .mockReset()
      .mockResolvedValue([
        readyLibrary("library-a"),
        {
          ...readyLibrary("library-b"),
          indexStatus: { keyword: "unavailable", semantic: "notBuilt" },
        },
      ]);
  });
  afterEach(() => {
    wrapper?.unmount();
  });

  it("loads the current Agent's authorized libraries and inserts a keyboard-selected reference", async () => {
    mountPanel();
    await flushPromises();
    expect(mocks.listKnowledgeForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-a" })
    );
    await wrapper
      .get('[data-library-id="library-a"]')
      .trigger("keydown", { key: "Enter" });
    expect(mocks.setKnowledgeReference).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        type: "knowledge",
        mode: "search",
        libraryIds: ["library-a"],
      })
    );
  });

  it("keeps unavailable libraries and research permission disabled while allowing selection to be cleared", async () => {
    mountPanel();
    await flushPromises();
    expect(
      wrapper.get('[data-library-id="library-b"]').attributes("disabled")
    ).toBeDefined();
    expect(
      wrapper
        .get('[data-testid="chat-knowledge-mode-research"]')
        .attributes("disabled")
    ).toBeDefined();
    await wrapper.get('[data-library-id="library-a"]').trigger("click");
    await wrapper.get('[data-library-id="library-a"]').trigger("click");
    expect(mocks.setKnowledgeReference).toHaveBeenLastCalledWith(null);
  });

  it("ignores an old Agent's late response after the active Agent changes", async () => {
    let resolveOld!: (libraries: any[]) => void;
    mocks.listKnowledgeForAgent
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce([readyLibrary("library-c")]);
    mountPanel();
    mocks.currentAgentId.value = "agent-b";
    await flushPromises();
    resolveOld([readyLibrary("library-a")]);
    await flushPromises();
    expect(
      wrapper
        .findAll("button.library-option")
        .map((option) => option.attributes("data-library-id"))
    ).toEqual(["library-c"]);
    await wrapper.get('[data-library-id="library-c"]').trigger("click");
    expect(mocks.setKnowledgeReference).toHaveBeenLastCalledWith(
      expect.objectContaining({ libraryIds: ["library-c"] })
    );
  });
});
