import { afterEach, describe, expect, it } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import { createMacroContext } from "../../MacroContext";
import { getMacroRegistry } from "../../MacroRegistry";
import { registerKnowledgeMacros } from "../knowledge";

function context() {
  const agent = {
    knowledgeConfig: {
      enabled: true,
      bindings: [
        {
          libraryId: "library/1",
          libraryName: "Docs",
          enabled: true,
          strategy: "keyword",
          limit: 4,
        },
      ],
    },
  } as ChatAgent;
  return createMacroContext({ agent });
}

describe("Knowledge macros", () => {
  const registry = getMacroRegistry();

  afterEach(() => registry.clear());

  it("uses named arguments and emits canonical placeholders", () => {
    registerKnowledgeMacros(registry);
    const macro = registry.getMacro("knowledge");
    expect(
      macro?.execute(context(), [
        "limit=8",
        "library=library%2F1",
        "strategy=hybrid",
        "citation=false",
      ])
    ).toBe(
      "【knowledge::library=library%2F1::strategy=hybrid::limit=8::when=always::citation=false】"
    );
  });

  it("rejects positional arguments and does not register mixed", () => {
    registerKnowledgeMacros(registry);
    const macro = registry.getMacro("knowledge");
    expect(() => macro?.execute(context(), ["library/1", "8"])).toThrow();
    expect(registry.hasMacro("mixed")).toBe(false);
  });
});
