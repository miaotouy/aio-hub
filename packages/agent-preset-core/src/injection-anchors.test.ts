import { describe, expect, it } from "vitest";
import {
  assembleHistoryInjections,
  type HistoryInjectionDiagnostic,
  type HistoryInjectionStrategy,
} from "./injection-anchors";

type Message = {
  id: string;
  role: string;
  sourceType: string;
  _historyRole?: string;
  metadata?: {
    toolCallsRequested?: { requestId?: string }[];
    toolCall?: { requestId: string };
  };
};
const history: Message[] = [
  { id: "u1", role: "user", sourceType: "session_history" },
  { id: "a1", role: "assistant", sourceType: "session_history" },
  { id: "u2", role: "user", sourceType: "session_history" },
];
const inj = (id: string, strategy: HistoryInjectionStrategy) => ({
  message: { id },
  strategy,
});
const materialize = (i: ReturnType<typeof inj>): Message => ({
  id: i.message.id,
  role: "assistant",
  sourceType: "anchor_injection",
});
const ids = (messages: Message[]) => messages.map((m) => m.id);

describe("history injection contract", () => {
  it.each([
    ["last_user", "before", ["u1", "a1", "injected", "u2"]],
    ["last_user", "after", ["u1", "a1", "u2", "injected"]],
    ["last_assistant", "before", ["u1", "injected", "a1", "u2"]],
    ["last_assistant", "after", ["u1", "a1", "injected", "u2"]],
    ["last_message", "before", ["u1", "a1", "injected", "u2"]],
    ["last_message", "after", ["u1", "a1", "u2", "injected"]],
  ] as const)(
    "locates %s %s in immutable effective history",
    (target, position, expected) => {
      expect(
        ids(
          assembleHistoryInjections(
            history,
            [
              inj("injected", {
                type: "anchor",
                anchorTarget: target,
                anchorPosition: position,
              }),
            ],
            materialize
          )
        )
      ).toEqual(expected);
    }
  );

  it("shares boundaries across depth and dynamic targets, with stable ties and no retargeting", () => {
    const injections = [
      inj("tie1", {
        type: "anchor",
        anchorTarget: "last_assistant",
        order: 100,
      }),
      inj("depth", { type: "depth", depth: 1, order: 10 }),
      inj("tie2", {
        type: "anchor",
        anchorTarget: "last_user",
        anchorPosition: "before",
        order: 100,
      }),
      inj("tail", {
        type: "anchor",
        anchorTarget: "last_assistant",
        anchorPosition: "after",
        order: 200,
      }),
      inj("repeat", { type: "advanced_depth", depthConfig: "0, 2" }),
    ];
    expect(
      ids(assembleHistoryInjections(history, injections, materialize))
    ).toEqual([
      "u1",
      "repeat",
      "a1",
      "depth",
      "tie1",
      "tie2",
      "tail",
      "u2",
      "repeat",
    ]);
    expect(ids(history)).toEqual(["u1", "a1", "u2"]);
  });

  it("reports a missing target even if other inputs use that role", () => {
    const diagnostics: HistoryInjectionDiagnostic[] = [];
    const input = [
      history[0],
      { id: "foreign", role: "assistant", sourceType: "agent_preset" },
    ];
    const output = assembleHistoryInjections(
      input,
      [inj("missing", { type: "anchor", anchorTarget: "last_assistant" })],
      materialize,
      (d) => diagnostics.push(d)
    );
    expect(ids(output)).toEqual(["u1", "foreign"]);
    expect(diagnostics).toEqual([
      {
        sourceId: "missing",
        target: "last_assistant",
        reason: "target_missing",
      },
    ]);
  });

  it("counts all depths from original history and orders clamped depths at the shared boundary", () => {
    expect(
      ids(
        assembleHistoryInjections(
          history,
          [
            inj("deep", { type: "depth", depth: 9, order: 100 }),
            inj("front", { type: "depth", depth: 3, order: 0 }),
            inj("middle", { type: "depth", depth: 1 }),
            inj("end", { type: "depth", depth: 0 }),
          ],
          materialize
        )
      )
    ).toEqual(["front", "deep", "u1", "a1", "middle", "u2", "end"]);
  });

  it("treats normalized tool results as tools and preserves the entire multi-result block", () => {
    const tools = [
      history[0],
      history[1],
      {
        id: "t1",
        role: "user",
        _historyRole: "tool",
        sourceType: "session_history",
      },
      { id: "t2", role: "tool", sourceType: "session_history" },
    ];
    const diagnostics: HistoryInjectionDiagnostic[] = [];
    const output = assembleHistoryInjections(
      tools,
      [
        inj("user", { type: "anchor", anchorTarget: "last_user" }),
        inj("before", {
          type: "anchor",
          anchorTarget: "last_message",
          anchorPosition: "before",
        }),
        inj("after", { type: "anchor", anchorTarget: "last_assistant" }),
        inj("depth", { type: "depth", depth: 1 }),
      ],
      materialize,
      (d) => diagnostics.push(d)
    );
    expect(ids(output)).toEqual([
      "u1",
      "user",
      "before",
      "a1",
      "t1",
      "t2",
      "after",
      "depth",
    ]);
    expect(diagnostics.map((d) => d.reason)).toEqual([
      "tool_chain_relocated",
      "tool_chain_relocated",
      "tool_chain_relocated",
    ]);
  });

  it("skips unsafe tails while a call still awaits results", () => {
    const pending = [
      history[0],
      { ...history[1], metadata: { toolCallsRequested: [{}] } },
    ];
    const diagnostics: HistoryInjectionDiagnostic[] = [];
    expect(
      ids(
        assembleHistoryInjections(
          pending,
          [inj("after", { type: "anchor", anchorTarget: "last_assistant" })],
          materialize,
          (d) => diagnostics.push(d)
        )
      )
    ).toEqual(["u1", "a1"]);
    expect(diagnostics[0].reason).toBe("tool_results_pending");
  });
});

it("waits for every result in a partially completed parallel tool call", () => {
  const partial: Message[] = [
    history[0],
    {
      ...history[1],
      metadata: {
        toolCallsRequested: [{ requestId: "one" }, { requestId: "two" }],
      },
    },
    {
      id: "tool-one",
      role: "tool",
      sourceType: "session_history",
      metadata: { toolCall: { requestId: "one" } },
    },
  ];
  const diagnostics: HistoryInjectionDiagnostic[] = [];
  expect(
    ids(
      assembleHistoryInjections(
        partial,
        [inj("after", { type: "anchor", anchorTarget: "last_message" })],
        materialize,
        (d) => diagnostics.push(d)
      )
    )
  ).toEqual(["u1", "a1", "tool-one"]);
  expect(diagnostics[0].reason).toBe("tool_results_pending");
});
