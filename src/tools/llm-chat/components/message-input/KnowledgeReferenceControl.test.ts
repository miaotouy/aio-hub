import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentAgentId: { value: "agent-a" },
  knowledgeReference: { value: null as any },
  setKnowledgeReference: vi.fn(),
  listKnowledgeForAgent: vi.fn(),
}));

vi.mock("../../composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: mocks.currentAgentId }),
}));

vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    getAgentById: () => ({
      id: "agent-a",
      knowledgeAccess: {
        enabled: true,
        allowedLibraryIds: ["library-a", "library-b"],
        allowSearchAll: false,
        allowDocumentRead: true,
        allowResearch: false,
      },
    }),
  }),
}));

vi.mock("../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => ({
    knowledgeReference: mocks.knowledgeReference,
    setKnowledgeReference: mocks.setKnowledgeReference,
  }),
}));

vi.mock("@/tools/knowledge-base/application", () => ({
  listKnowledgeForAgent: mocks.listKnowledgeForAgent,
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

const KnowledgeReferenceControl = (
  await import("./KnowledgeReferenceControl.vue")
).default;

function mountControl() {
  return mount(KnowledgeReferenceControl, {
    global: {
      stubs: {
        "el-tooltip": {
          template: "<div><slot /></div>",
        },
        "el-popover": {
          emits: ["update:visible"],
          template:
            '<div class="popover-stub" @click="$emit(\'update:visible\', true)"><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
}

describe("KnowledgeReferenceControl", () => {
  beforeEach(() => {
    mocks.knowledgeReference.value = null;
    mocks.setKnowledgeReference.mockReset();
    mocks.listKnowledgeForAgent.mockReset();
    mocks.listKnowledgeForAgent.mockResolvedValue([
      {
        id: "library-a",
        name: "一个非常长但仍应保持单行并可检查的资料库名称",
        documentCount: 3,
        availability: "available",
        supportsKeywordSearch: true,
        supportsSemanticSearch: false,
        indexStatus: { keyword: "ready", semantic: "notBuilt" },
      },
      {
        id: "library-b",
        name: "索引未就绪",
        documentCount: 1,
        availability: "available",
        supportsKeywordSearch: false,
        supportsSemanticSearch: false,
        indexStatus: { keyword: "unavailable", semantic: "notBuilt" },
      },
    ]);
  });

  it("exposes an independent accessible button and authorized multi-select", async () => {
    const wrapper = mountControl();
    const trigger = wrapper.get("button.knowledge-button");
    expect(trigger.attributes("aria-label")).toBe("选择 Knowledge 资料库");

    await trigger.trigger("click");
    await flushPromises();

    const options = wrapper.findAll("button.library-option");
    expect(options).toHaveLength(2);
    expect(options[0].get(".option-name").attributes("title")).toContain(
      "非常长"
    );
    expect(options[1].attributes("disabled")).toBeDefined();

    await options[0].trigger("keydown", { key: "Enter" });
    expect(mocks.setKnowledgeReference).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        type: "knowledge",
        mode: "search",
        libraryIds: ["library-a"],
      })
    );
  });
});
