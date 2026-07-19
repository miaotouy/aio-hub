import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import { createMacroContext } from "../../MacroContext";
import { getMacroRegistry } from "../../MacroRegistry";
import { registerKnowledgeMacros } from "../knowledge";

const listKnowledgeLibraries = vi.hoisted(() => vi.fn());

vi.mock("@/tools/knowledge-base/services/service", () => ({
  listKnowledgeLibraries,
}));

function context() {
  const agent = {
    knowledgeAccess: {
      enabled: true,
      allowedLibraryIds: ["library/1", "deleted-library"],
      allowSearchAll: true,
      allowDocumentRead: true,
      allowResearch: false,
    },
  } as ChatAgent;
  return createMacroContext({ agent });
}

describe("Knowledge macros", () => {
  const registry = getMacroRegistry();

  beforeEach(() => {
    listKnowledgeLibraries.mockReset();
    listKnowledgeLibraries.mockResolvedValue([
      {
        id: "library/1",
        name: "Renamed Docs",
        description: "Current documentation",
        documentCount: 3,
        activeEmbeddingSpaceId: "space-1",
      },
    ]);
  });
  afterEach(() => registry.clear());

  it("only registers the read-only directory macro", () => {
    registerKnowledgeMacros(registry);
    expect(registry.hasMacro("knowledge")).toBe(false);
    expect(registry.hasMacro("knowledge_list")).toBe(true);
    expect(registry.hasMacro("mixed")).toBe(false);
  });

  it("expands authorized libraries in place with live names and status", async () => {
    registerKnowledgeMacros(registry);
    const macro = registry.getMacro("knowledge_list");
    const output = await macro?.execute(context());

    expect(output).toContain(
      "- Renamed Docs (id=library/1): Current documentation；3 个来源"
    );
    expect(output).toContain(
      "- 已删除的资料库 (id=deleted-library): 0 个来源；状态=已删除"
    );
    expect(output).not.toContain("strategy=");
  });

  it("does not load or inject a directory when access is disabled", async () => {
    registerKnowledgeMacros(registry);
    const macro = registry.getMacro("knowledge_list");
    const disabled = context();
    disabled.agent!.knowledgeAccess!.enabled = false;

    await expect(macro?.execute(disabled)).resolves.toBe(
      "未授权任何 Knowledge 资料库。"
    );
    expect(listKnowledgeLibraries).not.toHaveBeenCalled();
  });
});
