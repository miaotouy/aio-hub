import { describe, expect, it } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type {
  PipelineContext,
  ProcessableMessage,
} from "@/tools/llm-chat/types";
import { injectionAssembler } from "../injection-assembler";

const history: ProcessableMessage[] = [
  {
    role: "user",
    content: "history user",
    sourceId: "history-user",
    sourceType: "session_history",
  },
  {
    role: "assistant",
    content: "history assistant",
    sourceId: "history-assistant",
    sourceType: "session_history",
  },
];

function createAgent(): ChatAgent {
  return {
    id: "agent-1",
    name: "Agent",
    profileId: "profile-1",
    modelId: "model-1",
    createdAt: "2026-07-26T00:00:00.000Z",
    presetGroups: [
      {
        id: "disabled",
        name: "disabled",
        selectionMode: "checkbox",
        enabled: false,
      },
    ],
    presetMessages: [
      {
        id: "base",
        parentId: null,
        childrenIds: [],
        content: "base",
        role: "system",
        status: "complete",
      },
      {
        id: "history-anchor",
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        type: "chat_history",
      },
      {
        id: "after",
        parentId: null,
        childrenIds: [],
        content: "after",
        role: "system",
        status: "complete",
      },
      {
        id: "depth",
        parentId: null,
        childrenIds: [],
        content: "depth",
        role: "system",
        status: "complete",
        injectionStrategy: { type: "depth", depth: 1 },
      },
      {
        id: "anchor-before",
        parentId: null,
        childrenIds: [],
        content: "anchor before",
        role: "system",
        status: "complete",
        injectionStrategy: {
          type: "anchor",
          anchorTarget: "chat_history",
          anchorPosition: "before",
          order: 20,
        },
      },
      {
        id: "anchor-before-first",
        parentId: null,
        childrenIds: [],
        content: "anchor before first",
        role: "system",
        status: "complete",
        injectionStrategy: {
          type: "anchor",
          anchorTarget: "chat_history",
          anchorPosition: "before",
          order: 10,
        },
      },
      {
        id: "anchor-after",
        parentId: null,
        childrenIds: [],
        content: "anchor after",
        role: "system",
        status: "complete",
        injectionStrategy: {
          type: "anchor",
          anchorTarget: "chat_history",
          anchorPosition: "after",
        },
      },
      {
        id: "disabled",
        parentId: null,
        childrenIds: [],
        content: "disabled",
        role: "system",
        status: "complete",
        groupId: "disabled",
      },
    ],
  };
}

function createContext(agentConfig: ChatAgent | null): PipelineContext {
  return {
    messages: structuredClone(history),
    session: {} as PipelineContext["session"],
    agentConfig,
    settings: {} as PipelineContext["settings"],
    timestamp: Date.now(),
    sharedData: new Map(),
    logs: [],
  };
}

describe("injectionAssembler", () => {
  it("places default messages around history and honours anchor order and depth", async () => {
    const context = createContext(createAgent());

    await injectionAssembler.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "base",
      "anchor-before-first",
      "anchor-before",
      "history-user",
      "depth",
      "history-assistant",
      "anchor-after",
      "after",
    ]);
    expect(context.messages[4].sourceType).toBe("depth_injection");
    expect(context.messages[1].sourceType).toBe("anchor_injection");
    expect(
      context.messages.some((message) => message.sourceId === "disabled")
    ).toBe(false);
  });

  it("uses the legacy strategy fields and advanced depth rules", async () => {
    const agent = createAgent();
    agent.presetMessages = [
      {
        id: "advanced",
        parentId: null,
        childrenIds: [],
        content: "advanced",
        role: "system",
        status: "complete",
        injectionStrategy: { depthConfig: "1, 3~2" },
      },
      {
        id: "legacy-anchor",
        parentId: null,
        childrenIds: [],
        content: "legacy anchor",
        role: "system",
        status: "complete",
        injectionStrategy: {
          anchorTarget: "chat_history",
          anchorPosition: "after",
        },
      },
    ];
    const context = createContext(agent);

    await injectionAssembler.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "history-user",
      "advanced",
      "history-assistant",
      "legacy-anchor",
    ]);
  });

  it("filters preset messages with model and profile matching rules", async () => {
    const agent = createAgent();
    agent.presetMessages = [
      {
        id: "model-match",
        parentId: null,
        childrenIds: [],
        content: "model match",
        role: "system",
        status: "complete",
        modelMatch: { enabled: true, patterns: ["model-1"] },
      },
      {
        id: "profile-match",
        parentId: null,
        childrenIds: [],
        content: "profile match",
        role: "system",
        status: "complete",
        modelMatch: {
          enabled: true,
          patterns: [],
          profilePatterns: ["production"],
          mode: "all",
        },
      },
      {
        id: "model-miss",
        parentId: null,
        childrenIds: [],
        content: "model miss",
        role: "system",
        status: "complete",
        modelMatch: { enabled: true, patterns: ["does-not-match"] },
      },
    ];
    const context = createContext(agent);
    context.sharedData.set("profile", { name: "Production API" });

    await injectionAssembler.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "model-match",
      "profile-match",
      "history-user",
      "history-assistant",
    ]);
  });
  it("keeps attachment-only presets and carries their private refs", async () => {
    const agent = createAgent();
    agent.presetMessages = [
      {
        id: "attachment-only",
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        presetAttachments: [{ assetId: "sticker_ok", description: "贴纸" }],
      },
    ];
    const context = createContext(agent);

    await injectionAssembler.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "attachment-only",
      "history-user",
      "history-assistant",
    ]);
    expect(context.messages[0]._privateAttachments).toEqual([
      { assetId: "sticker_ok", description: "贴纸" },
    ]);
  });

  it("keeps history unchanged when no agent is bound", async () => {
    const context = createContext(null);

    await injectionAssembler.execute(context);

    expect(context.messages).toEqual(history);
  });

  it("keeps only the last N enabled presets before the history anchor when displayPresetCount is set", async () => {
    const agent = createAgent();
    agent.displayPresetCount = 2;
    // p4 被 isEnabled 禁用、p6 被禁用分组过滤，均不占截断名额；深度注入与锚点后消息不参与截断
    agent.presetMessages = [
      {
        id: "p1",
        parentId: null,
        childrenIds: [],
        content: "p1",
        role: "system",
        status: "complete",
      },
      {
        id: "p2",
        parentId: null,
        childrenIds: [],
        content: "p2",
        role: "system",
        status: "complete",
        modelMatch: { enabled: true, patterns: ["does-not-match"] },
      },
      {
        id: "p3",
        parentId: null,
        childrenIds: [],
        content: "p3",
        role: "system",
        status: "complete",
      },
      {
        id: "p4-disabled",
        parentId: null,
        childrenIds: [],
        content: "p4",
        role: "system",
        status: "complete",
        isEnabled: false,
      },
      {
        id: "p5",
        parentId: null,
        childrenIds: [],
        content: "p5",
        role: "system",
        status: "complete",
      },
      {
        id: "p6-group-disabled",
        parentId: null,
        childrenIds: [],
        content: "p6",
        role: "system",
        status: "complete",
        groupId: "disabled",
      },
      {
        id: "history-anchor",
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        type: "chat_history",
      },
      {
        id: "after",
        parentId: null,
        childrenIds: [],
        content: "after",
        role: "system",
        status: "complete",
      },
      {
        id: "depth",
        parentId: null,
        childrenIds: [],
        content: "depth",
        role: "system",
        status: "complete",
        injectionStrategy: { type: "depth", depth: 1 },
      },
    ];
    const context = createContext(agent);

    await injectionAssembler.execute(context);

    // 先启用/分组/模型匹配过滤再截断：仅剩 p1/p3/p5，取最后 2 条
    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "p3",
      "p5",
      "history-user",
      "depth",
      "history-assistant",
      "after",
    ]);
  });

  it("keeps all presets when displayPresetCount exceeds the enabled presets", async () => {
    const agent = createAgent();
    agent.displayPresetCount = 10;
    agent.presetMessages = [
      {
        id: "p1",
        parentId: null,
        childrenIds: [],
        content: "p1",
        role: "system",
        status: "complete",
      },
      {
        id: "p2",
        parentId: null,
        childrenIds: [],
        content: "p2",
        role: "system",
        status: "complete",
      },
      {
        id: "history-anchor",
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        type: "chat_history",
      },
    ];
    const context = createContext(agent);

    await injectionAssembler.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "p1",
      "p2",
      "history-user",
      "history-assistant",
    ]);
  });

  it("keeps all presets when no history anchor exists", async () => {
    const agent = createAgent();
    agent.displayPresetCount = 1;
    // 对齐桌面语义：无 chat_history 占位符时 displayPresetCount 不生效，预设全量保留
    agent.presetMessages = [
      {
        id: "p1",
        parentId: null,
        childrenIds: [],
        content: "p1",
        role: "system",
        status: "complete",
      },
      {
        id: "p2",
        parentId: null,
        childrenIds: [],
        content: "p2",
        role: "system",
        status: "complete",
      },
    ];
    const context = createContext(agent);

    await injectionAssembler.execute(context);

    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "p1",
      "p2",
      "history-user",
      "history-assistant",
    ]);
  });

  it("keeps all presets when displayPresetCount is missing or invalid", async () => {
    const buildPresetMessages = (): ChatAgent["presetMessages"] => [
      {
        id: "p1",
        parentId: null,
        childrenIds: [],
        content: "p1",
        role: "system",
        status: "complete",
      },
      {
        id: "history-anchor",
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        type: "chat_history",
      },
    ];
    const expected = [
      "p1",
      "history-user",
      "history-assistant",
    ];

    for (const displayPresetCount of [undefined, 0, -2, Number.NaN]) {
      const agent = createAgent();
      agent.presetMessages = buildPresetMessages();
      if (displayPresetCount === undefined) {
        delete agent.displayPresetCount;
      } else {
        agent.displayPresetCount = displayPresetCount;
      }
      const context = createContext(agent);

      await injectionAssembler.execute(context);

      expect(context.messages.map((message) => message.sourceId)).toEqual(
        expected
      );
    }
  });
});

// Structured templates must be compiled before the empty-content filter.
it("injects a structured host with original source index and only its current alternative", async () => {
  const agent = createAgent();
  agent.presetMessages![0].isEnabled = false;
  const host = agent.presetMessages![2];
  host.content = "";
  host.presetComposition = {
    version: 1,
    separator: "",
    parts: [
      {
        id: "prefix",
        kind: "choice",
        selectedOptionId: "prefix-version",
        options: [{ id: "prefix-version", content: "common " }],
      },
      {
        id: "choice",
        kind: "choice",
        selectedOptionId: "b",
        options: [
          { id: "a", content: "{{first}}" },
          { id: "b", content: "{{second}}" },
        ],
      },
    ],
  };
  const context = createContext(agent);
  await injectionAssembler.execute(context);
  expect(
    context.messages.find((message) => message.sourceId === host.id)
  ).toMatchObject({ content: "common {{second}}", sourceIndex: 2 });
  expect(host.content).toBe("");
  host.isEnabled = false;
  const disabled = createContext(agent);
  await injectionAssembler.execute(disabled);
  expect(
    disabled.messages.some((message) => message.sourceId === host.id)
  ).toBe(false);
});

// Protects the message-local boundary: selection changes only the host body.
it("combines independent selection dimensions without merging adjacent role messages", async () => {
  const agent = createAgent();
  const host = agent.presetMessages![0];
  host.content = "";
  host.presetComposition = {
    version: 1,
    separator: "|",
    parts: [
      {
        id: "identity",
        kind: "choice",
        selectedOptionId: "a",
        options: [{ id: "a", content: "identity" }],
      },
      {
        id: "brief",
        kind: "choice",
        selectedOptionId: "brief-version",
        options: [{ id: "brief-version", content: "brief" }],
      },
      {
        id: "examples",
        kind: "choice",
        selectedOptionId: "examples-version",
        options: [{ id: "examples-version", content: "examples" }],
      },
      {
        id: "off",
        enabled: false,
        kind: "choice",
        selectedOptionId: "off-version",
        options: [{ id: "off-version", content: "unused" }],
      },
      {
        id: "format",
        kind: "choice",
        selectedOptionId: "a",
        options: [{ id: "a", content: "format" }],
      },
    ],
  };
  const original = JSON.stringify(agent.presetMessages);
  const context = createContext(agent);
  await injectionAssembler.execute(context);
  expect(
    context.messages.filter((item) => item.sourceId === host.id)
  ).toHaveLength(1);
  expect(
    context.messages.find((item) => item.sourceId === host.id)
  ).toMatchObject({
    content: "identity|brief|examples|format",
    sourceIndex: 0,
  });
  expect(
    context.messages.find((item) => item.sourceId === "after")?.content
  ).toBe("after");
  expect(
    context.messages.find((item) => item.sourceId === "history-user")?.content
  ).toBe("history user");
  expect(JSON.stringify(agent.presetMessages)).toBe(original);
});

it("places dynamic and depth injections against the same effective history and reports missing targets", async () => {
  const agent = createAgent();
  agent.presetMessages = [
    {
      ...agent.presetMessages![0],
      id: "after-ai",
      content: "after-ai",
      injectionStrategy: {
        type: "anchor",
        anchorTarget: "last_assistant",
        anchorPosition: "after",
        order: 200,
      },
    },
    {
      ...agent.presetMessages![0],
      id: "depth",
      content: "depth",
      injectionStrategy: { type: "depth", depth: 0, order: 10 },
    },
    {
      ...agent.presetMessages![0],
      id: "before-user",
      content: "before-user",
      injectionStrategy: {
        type: "anchor",
        anchorTarget: "last_user",
        anchorPosition: "before",
      },
    },
  ];
  const context = createContext(agent);
  await injectionAssembler.execute(context);
  expect(context.messages.map((m) => m.sourceId)).toEqual([
    "before-user",
    "history-user",
    "history-assistant",
    "depth",
    "after-ai",
  ]);
  const first = createContext(agent);
  first.messages = [history[0]];
  await injectionAssembler.execute(first);
  expect(first.sharedData.get("historyInjectionDiagnostics")).toEqual([
    {
      sourceId: "after-ai",
      target: "last_assistant",
      reason: "target_missing",
    },
  ]);
  expect(first.messages.map((m) => m.sourceId)).toEqual([
    "before-user",
    "history-user",
    "depth",
  ]);
});
