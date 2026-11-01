import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/tools/llm-chat/macro-engine", () => ({ MacroProcessor: class {} }));
const macroState = vi.hoisted(() => ({ toolContext: "environment" }));
vi.mock("../../context-utils/macro", () => ({
  buildMacroContext: (data: unknown) => ({ ...(data as object) }),
  processMacros: async (_: unknown, text: string) =>
    text
      .replace("{{user}}", "Alice")
      .replace("{{tools}}", "definitions")
      .replace("{{tool_usage}}", "usage")
      .replace("{{tool_context}}", macroState.toolContext),
}));
vi.mock("../../context-utils/token-calculator", () => ({
  getContextTokenCalculator: vi.fn(),
}));
import {
  buildOpenAiCompatibleRequest,
  buildAnthropicMessagesRequest,
  buildGoogleGenerateContentRequest,
} from "@aiohub/llm-core";
import {
  handleMergeSystemToHead,
  handleMergeConsecutiveRoles,
  DEFAULT_SEPARATOR,
} from "../message-format-processors";
import { projectSnapshot } from "../../../services/requestSnapshotProjection";
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

// Protect request output and tool-chain boundaries, independent of preset internals.
describe("automatic cache-friendly context", () => {
  beforeEach(() => {
    macroState.toolContext = "environment";
  });
  function automatic(messages: PipelineContext["messages"], enabled = true) {
    const ctx = context(messages, [preset("base")]);
    ctx.agentConfig.parameters = { contextCacheOptimization: { enabled } };
    ctx.agentConfig.toolCallConfig = {
      enabled: true,
      autoInjectIfMacroMissing: true,
    } as any;
    return ctx;
  }
  const user = () => ({
    role: "user" as const,
    content: "query",
    sourceType: "session_history" as const,
    sourceId: "u",
  });
  it("keeps legacy automatic macro output when disabled", async () => {
    const ctx = automatic([user()], false);
    await injectionAssembler.execute(ctx);
    expect(
      ctx.messages.map(({ role, content }) => ({ role, content }))
    ).toEqual([
      { role: "system", content: "base" },
      { role: "system", content: "definitions\nusage\nenvironment" },
      { role: "user", content: "query" },
    ]);
  });
  it("separates static System tools from dynamic User data before the current input", async () => {
    const original = user();
    const ctx = automatic([original]);
    await injectionAssembler.execute(ctx);
    expect(
      ctx.messages.find((m) => m.sourceId === "auto-tool-static")
    ).toMatchObject({ role: "system", content: "definitions\nusage" });
    const runtimeIndex = ctx.messages.findIndex(
      (m) => m.sourceId === "auto-tool-context"
    );
    expect(ctx.messages[runtimeIndex]).toMatchObject({
      role: "user",
      content: "<runtime-context>\nenvironment\n</runtime-context>",
    });
    expect(ctx.messages[runtimeIndex + 1]).toBe(original);
    expect(original.content).toBe("query");
  });
  it("places data after the entire result group, including results presented as User", async () => {
    const ctx = automatic([
      user(),
      {
        role: "assistant",
        content: "call",
        sourceType: "session_history",
        metadata: {
          toolCallsRequested: [{ requestId: "one" }, { requestId: "two" }],
        } as any,
      },
      {
        role: "user",
        _historyRole: "tool",
        content: "result 1",
        sourceType: "session_history",
        metadata: { toolCall: { requestId: "one" } } as any,
      },
      {
        role: "user",
        _historyRole: "tool",
        content: "result 2",
        sourceType: "session_history",
        metadata: { toolCall: { requestId: "two" } } as any,
      },
    ]);
    await injectionAssembler.execute(ctx);
    expect(ctx.messages.slice(-4).map((m) => m.content)).toEqual([
      "call",
      "result 1",
      "result 2",
      "<runtime-context>\nenvironment\n</runtime-context>",
    ]);
  });
  it("falls back to legacy output while tool results are incomplete", async () => {
    const ctx = automatic([
      user(),
      {
        role: "assistant",
        content: "call",
        sourceType: "session_history",
        metadata: {
          toolCallsRequested: [{ requestId: "one" }, { requestId: "two" }],
        } as any,
      },
      {
        role: "tool",
        content: "result",
        sourceType: "session_history",
        metadata: { toolCall: { requestId: "one" } } as any,
      },
    ]);
    await injectionAssembler.execute(ctx);
    expect(ctx.messages[1]).toMatchObject({
      sourceId: "auto-tool-macro",
      content: "definitions\nusage\nenvironment",
    });
    expect(ctx.messages[ctx.messages.length - 1]?.content).toBe("result");
    expect(
      ctx.logs.some((log) => log.details?.reason === "tool_results_pending")
    ).toBe(true);
  });
  it("falls back while the trailing assistant still awaits tool results", async () => {
    const ctx = automatic([
      user(),
      {
        role: "assistant",
        content: "call",
        sourceType: "session_history",
        metadata: { toolCallsRequested: [{ requestId: "one" }] } as any,
      },
    ]);
    await injectionAssembler.execute(ctx);
    expect(
      ctx.messages.find((m) => m.sourceId === "auto-tool-macro")?.content
    ).toBe("definitions\nusage\nenvironment");
    expect(
      ctx.logs.some((log) => log.details?.reason === "tool_results_pending")
    ).toBe(true);
  });
  it("preserves a trailing assistant continuation prefix", async () => {
    const ctx = automatic([
      user(),
      { role: "assistant", content: "prefix", sourceType: "session_history" },
    ]);
    await injectionAssembler.execute(ctx);
    expect(ctx.messages[ctx.messages.length - 1]?.content).toBe("prefix");
    expect(ctx.messages[ctx.messages.length - 2]?.sourceId).toBe(
      "auto-tool-context"
    );
  });
  it("keeps dynamic changes in message bodies after role merges and all three provider projections", async () => {
    const make = async (value: string) => {
      macroState.toolContext = value;
      const ctx = automatic([
        user(),
        { role: "assistant", content: "answer", sourceType: "session_history" },
        { ...user(), sourceId: "u2", content: "next" },
      ]);
      await injectionAssembler.execute(ctx);
      return handleMergeConsecutiveRoles(
        handleMergeSystemToHead(ctx.messages, DEFAULT_SEPARATOR),
        DEFAULT_SEPARATOR
      );
    };
    const before = await make("environment old");
    const after = await make("environment new");
    for (const build of [
      buildOpenAiCompatibleRequest,
      buildAnthropicMessagesRequest,
      buildGoogleGenerateContentRequest,
    ]) {
      const profile = { provider: "test", baseUrl: "https://example.test" };
      const project = (messages: typeof before) =>
        projectSnapshot(
          build(profile, {
            model: "test",
            messages: messages.map(({ role, content }) => {
              if (typeof content !== "string")
                throw new Error("Expected text-only fixture");
              return { role, content };
            }),
          }),
          true
        );
      const left = await project(before);
      const right = await project(after);
      expect(right.topLevelSystem).toEqual(left.topLevelSystem);
      expect(right.messages.slice(0, -1)).toEqual(left.messages.slice(0, -1));
      expect(right.messages[right.messages.length - 1].role).toBe("user");
      expect(right.messages[right.messages.length - 1].wireHash).not.toBe(
        left.messages[left.messages.length - 1].wireHash
      );
    }
  });
  it("omits empty runtime data and respects explicit preset tool macros", async () => {
    macroState.toolContext = " ";
    const ctx = automatic([user()]);
    await injectionAssembler.execute(ctx);
    expect(
      ctx.messages.filter((m) => m.role === "user").map((m) => m.content)
    ).toEqual(["query"]);
    macroState.toolContext = "environment";
    const explicit = automatic([user()]);
    explicit.agentConfig.presetMessages = [
      {
        ...preset("explicit", dynamic("last_user")),
        content: "{{tools}}\n{{tool_context}}",
      },
    ];
    await injectionAssembler.execute(explicit);
    expect(
      explicit.messages.find((m) => m.sourceId === "explicit")
    ).toMatchObject({ role: "system", content: "definitions\nenvironment" });
    expect(explicit.messages[explicit.messages.length - 2]?.sourceId).toBe(
      "explicit"
    );
    expect(explicit.messages[explicit.messages.length - 1]?.content).toBe(
      "query"
    );
  });
});
