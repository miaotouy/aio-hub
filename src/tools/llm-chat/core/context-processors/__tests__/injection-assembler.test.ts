import { describe, expect, it, vi } from "vitest";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/tools/llm-chat/macro-engine", () => ({ MacroProcessor: class {} }));
vi.mock("../../context-utils/macro", () => ({
  buildMacroContext: () => ({}),
  processMacros: async (_: unknown, text: string) =>
    text.replace("{{user}}", "Alice"),
}));
import { injectionAssembler } from "../injection-assembler";
import { sessionLoader } from "../session-loader";
import { SYSTEM_ANCHORS } from "../../../composables/ui/useAnchorRegistry";
import type { PipelineContext } from "../../../types/pipeline";
import type {
  ChatMessageNode,
  InjectionStrategy,
} from "../../../types/message";

function preset(id: string, strategy?: InjectionStrategy): ChatMessageNode {
  return {
    id,
    parentId: null,
    childrenIds: [],
    status: "complete",
    role: "system",
    content: id,
    injectionStrategy: strategy,
  };
}
function context(
  messages: PipelineContext["messages"],
  presets: ChatMessageNode[],
  detail: unknown = {}
) {
  return {
    messages,
    agentConfig: { id: "agent", presetMessages: presets },
    sharedData: new Map([["anchorDefinitions", SYSTEM_ANCHORS]]),
    logs: [],
    timestamp: 0,
    index: {},
    detail,
    settings: {},
  } as unknown as PipelineContext;
}
const dynamic = (
  target: string,
  position: "before" | "after" = "before"
): InjectionStrategy => ({
  type: "anchor",
  anchorTarget: target,
  anchorPosition: position,
});

describe("desktop dynamic message injections", () => {
  it("retains expanded macros, attachment references and original preset source positions", async () => {
    const message = {
      ...preset("reminder", dynamic("last_user")),
      content: "Hi {{user}}",
      presetAttachments: [{ assetId: "asset" }],
    } as ChatMessageNode;
    const ctx = context(
      [
        {
          role: "user",
          content: "input",
          sourceType: "session_history",
          sourceId: "u",
        },
      ],
      [preset("base"), message]
    );
    ctx.agentConfig.assets = [
      { id: "asset", type: "image", filename: "test.png", path: "test.png" },
    ] as any;
    await injectionAssembler.execute(ctx);
    expect(ctx.messages.map((m) => m.sourceId)).toEqual([
      "base",
      "reminder",
      "u",
    ]);
    expect(ctx.messages[1]).toMatchObject({
      content: "Hi Alice",
      _originalContent: "Hi {{user}}",
      sourceType: "anchor_injection",
      sourceIndex: 1,
    });
    expect(ctx.messages[1]._attachments).toHaveLength(1);
  });

  it("skips missing assistant targets and makes the cause available to context analysis", async () => {
    const ctx = context(
      [{ role: "user", content: "first", sourceType: "session_history" }],
      [preset("missing", dynamic("last_assistant"))]
    );
    await injectionAssembler.execute(ctx);
    expect(ctx.messages.map((m) => m.content)).toEqual(["first"]);
    expect(ctx.sharedData.get("historyInjectionDiagnostics")).toEqual([
      {
        sourceId: "missing",
        target: "last_assistant",
        reason: "target_missing",
      },
    ]);
    expect(
      ctx.logs.some(
        (log) =>
          log.message.includes("missing") && log.message.includes("已跳过")
      )
    ).toBe(true);
  });

  it("matches pending preview input exactly where the persisted send input would match", async () => {
    const root = { ...preset("root"), parentId: null, childrenIds: ["a"] };
    const assistant = {
      ...preset("a"),
      parentId: "root",
      role: "assistant",
      childrenIds: [],
    };
    const presets = [preset("reminder", dynamic("last_user"))];
    const preview = context([], presets, {
      rootId: "root",
      activeLeafId: "a",
      nodes: { root, a: assistant },
    });
    preview.sharedData.set("pendingInput", { text: "new input" });
    await sessionLoader.execute(preview);
    await injectionAssembler.execute(preview);
    const send = context([], presets, {
      rootId: "root",
      activeLeafId: "u",
      nodes: {
        root,
        a: assistant,
        u: {
          ...preset("u"),
          parentId: "a",
          role: "user",
          content: "new input",
        },
      },
    });
    await sessionLoader.execute(send);
    await injectionAssembler.execute(send);
    expect(
      preview.messages.map(({ role, content }) => ({ role, content }))
    ).toEqual(send.messages.map(({ role, content }) => ({ role, content })));
    expect(send.messages.map((m) => m.sourceId)).toEqual([
      "a",
      "reminder",
      "u",
    ]);
  });
});
