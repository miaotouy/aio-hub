import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  export_agent_as_text,
  import_agent_from_text,
} from "../agentManagementService";
import type { ChatAgent } from "../../types/agent";

const agent = {
  id: "agent-1",
  name: "docs-agent",
  profileId: "profile-1",
  modelId: "model-1",
  createdAt: "2026-07-18T00:00:00.000Z",
  knowledgeAccess: {
    enabled: true,
    allowedLibraryIds: ["library-1"],
    allowSearchAll: true,
    allowDocumentRead: true,
    allowResearch: false,
  },
  presetMessages: [
    {
      id: "knowledge-directory",
      parentId: null,
      childrenIds: [],
      content: "Available sources:\n{{knowledge_list}}",
      role: "system",
      status: "complete",
    },
  ],
} as ChatAgent;

const store = vi.hoisted(() => ({
  agents: [] as ChatAgent[],
  loadAgentDetails: vi.fn(),
  createAgent: vi.fn(),
}));

vi.mock("../../stores/agentStore", () => ({ useAgentStore: () => store }));

describe("Agent Knowledge import/export", () => {
  beforeEach(() => {
    store.agents = [agent];
    store.loadAgentDetails.mockReset();
    store.loadAgentDetails.mockResolvedValue(agent);
    store.createAgent.mockReset();
    store.createAgent.mockReturnValue("agent-imported");
  });

  it("exports only access permissions and preserves the directory macro", async () => {
    const text = await export_agent_as_text({
      agentId: agent.id,
      format: "json",
    });
    const exported = JSON.parse(text);

    expect(exported.knowledgeAccess).toEqual(agent.knowledgeAccess);
    expect(exported).not.toHaveProperty("knowledgeConfig");
    expect(exported).not.toHaveProperty("knowledgeSettings");
    expect(exported.presetMessages[0].content).toContain("{{knowledge_list}}");
  });

  it("imports staged bindings as access IDs without old retrieval fields", async () => {
    const result = await import_agent_from_text({
      format: "json",
      text: JSON.stringify({
        name: "imported-agent",
        profileId: "profile-1",
        modelId: "model-1",
        knowledgeConfig: {
          enabled: true,
          autoInjectIfMacroMissing: true,
          bindings: [
            {
              libraryId: "library-1",
              libraryName: "Old snapshot",
              enabled: true,
              strategy: "hybrid",
            },
          ],
        },
        knowledgeSettings: { defaultLimit: 8 },
        presetMessages: agent.presetMessages,
      }),
    });

    expect(result).toContain("成功创建智能体");
    const options = store.createAgent.mock.calls[0][3] as Record<
      string,
      unknown
    >;
    expect(options.knowledgeAccess).toEqual({
      enabled: true,
      allowedLibraryIds: ["library-1"],
      allowSearchAll: false,
      allowDocumentRead: false,
      allowResearch: false,
    });
    expect(options).not.toHaveProperty("knowledgeConfig");
    expect(options).not.toHaveProperty("knowledgeSettings");
    expect(JSON.stringify(options)).toContain("{{knowledge_list}}");
  });
});
