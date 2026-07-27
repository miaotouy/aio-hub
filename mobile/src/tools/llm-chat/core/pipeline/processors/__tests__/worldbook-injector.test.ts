import { describe, expect, it } from "vitest";
import type { PipelineContext, ProcessableMessage } from "@/tools/llm-chat/types";
import type { MobileWorldbook } from "@/tools/llm-chat/types/worldbook";
import { injectWorldbooks, worldbookInjector } from "../worldbook-injector";

const history: ProcessableMessage[] = [
  { role: "system", content: "character prompt", sourceType: "agent_preset", sourceId: "char" },
  { role: "user", content: "old harbor report", sourceType: "session_history", sourceId: "old" },
  { role: "assistant", content: "new starport report", sourceType: "session_history", sourceId: "new" },
];

function context(): PipelineContext {
  return {
    messages: structuredClone(history),
    session: {} as PipelineContext["session"],
    agentConfig: null,
    settings: {} as PipelineContext["settings"],
    timestamp: Date.now(),
    sharedData: new Map(),
    logs: [],
  };
}

const worldbooks: MobileWorldbook[] = [
  {
    id: "book-a",
    name: "Starport",
    enabled: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    entries: [
      {
        id: "constant",
        content: "constant rule",
        keys: [],
        enabled: true,
        constant: true,
        order: 300,
        position: "before_history",
      },
      {
        id: "old-only",
        content: "old lore",
        keys: ["harbor"],
        enabled: true,
        constant: false,
        order: 200,
        position: "before_history",
        scanDepth: 1,
      },
      {
        id: "after-character",
        content: "{{char}} knows the starport",
        keys: ["starport"],
        enabled: true,
        constant: false,
        order: 100,
        position: "after_character",
        scanDepth: 2,
      },
      {
        id: "depth",
        content: "recent starport fact",
        keys: ["starport"],
        enabled: true,
        constant: false,
        order: 90,
        position: "depth",
        depth: 1,
        scanDepth: 2,
      },
    ],
  },
];

describe("worldbookInjector", () => {
  it("uses only the configured tail of session history and keeps constants", () => {
    const pipelineContext = context();

    const matched = injectWorldbooks(pipelineContext, worldbooks);

    expect(matched.map((item) => item.entry.id)).toEqual([
      "constant",
      "after-character",
      "depth",
    ]);
    expect(pipelineContext.messages.map((message) => message.sourceId)).toEqual([
      "char",
      "book-a:after-character",
      "book-a:constant",
      "old",
      "book-a:depth",
      "new",
    ]);
    expect(pipelineContext.messages[1].content).toBe("{{char}} knows the starport");
    expect(pipelineContext.messages[1].sourceType).toBe("worldbook_injection");
  });

  it("uses selected Worldbook order and entry order as a deterministic tie-breaker", () => {
    const pipelineContext = context();
    const selected: MobileWorldbook[] = [
      {
        ...worldbooks[0],
        id: "book-b",
        entries: [{ ...worldbooks[0].entries[0], id: "same-order", order: 100 }],
      },
      {
        ...worldbooks[0],
        id: "book-a",
        entries: [{ ...worldbooks[0].entries[0], id: "later-id", order: 100 }],
      },
    ];

    const matched = injectWorldbooks(pipelineContext, selected);

    expect(matched.map((item) => `${item.worldbookId}:${item.entry.id}`)).toEqual([
      "book-b:same-order",
      "book-a:later-id",
    ]);
  });

  it("reads preloaded worldbooks from the pipeline blackboard and records activation", async () => {
    const pipelineContext = context();
    pipelineContext.sharedData.set("worldbooks", worldbooks);

    const result = await worldbookInjector.execute(pipelineContext);

    expect(pipelineContext.sharedData.get("activatedWorldbookEntries")).toHaveLength(3);
    expect(result).toEqual(
      expect.objectContaining({ status: "applied", message: expect.stringContaining("3") })
    );
  });

  it("reports skipped when configured worldbooks do not match", async () => {
    const pipelineContext = context();
    pipelineContext.sharedData.set("worldbooks", [
      {
        ...worldbooks[0],
        entries: [
          {
            ...worldbooks[0].entries[1],
            keys: ["not-present"],
            scanDepth: 2,
          },
        ],
      },
    ]);

    const result = await worldbookInjector.execute(pipelineContext);

    expect(result.status).toBe("skipped");
    expect(pipelineContext.sharedData.get("activatedWorldbookEntries")).toEqual([]);
  });

});
