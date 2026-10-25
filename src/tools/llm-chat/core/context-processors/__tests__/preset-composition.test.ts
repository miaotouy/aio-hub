import { expect, it, vi } from "vitest";
import { suggestPresetComposition } from "@aiohub/agent-preset-core";
const mocks = vi.hoisted(() => ({
  macros: vi.fn(async (_processor: unknown, content: string) =>
    content.replace("{{active}}", "expanded")
  ),
}));
vi.mock("@/tools/llm-chat/macro-engine", () => ({ MacroProcessor: class {} }));
vi.mock("../../context-utils/macro", () => ({
  buildMacroContext: () => ({}),
  processMacros: mocks.macros,
}));
vi.mock("../../context-utils/preset-attachment-resolver", () => ({
  resolvePresetAttachments: () => [],
}));
import { injectionAssembler } from "../injection-assembler";
import type { PipelineContext } from "../../../types/pipeline";

it("compiles the selected template before macro detection and retains host source positions", async () => {
  const composition = suggestPresetComposition([
    "before {{active}} after",
    "before {{tools}} after",
  ]);
  const context = {
    messages: [{ role: "user", content: "history" }],
    agentConfig: {
      id: "agent",
      modelId: "model",
      presetMessages: [
        { id: "disabled", isEnabled: false, content: "off", role: "system" },
        {
          id: "host",
          content: "",
          role: "system",
          presetComposition: composition,
        },
        { id: "anchor", type: "chat_history", content: "", role: "system" },
      ],
      toolCallConfig: { enabled: true, autoInjectIfMacroMissing: true },
    },
    sharedData: new Map([["anchorDefinitions", []]]),
    logs: [],
    timestamp: Date.now(),
  } as unknown as PipelineContext;
  await injectionAssembler.execute(context);
  const host = context.messages.find((message) => message.sourceId === "host");
  expect(host).toMatchObject({
    content: "before expanded after",
    sourceIndex: 1,
    sourceType: "agent_preset",
  });
  expect(host?.presetContributingParts?.length).toBe(3);
  expect(
    context.messages.filter((message) => message.sourceId === "auto-tool-macro")
  ).toHaveLength(1);
  expect(
    mocks.macros.mock.calls.some(
      ([, content]) => content === "before {{tools}} after"
    )
  ).toBe(false);
  expect(context.agentConfig.presetMessages?.[1].content).toBe("");
});

it("assembles multiple choices inside one host while retaining adjacent same-role messages", async () => {
  const presets = [
    { id: "before", role: "system", content: "before" },
    {
      id: "host",
      role: "system",
      content: "",
      presetComposition: {
        version: 1,
        separator: "|",
        parts: [
          {
            id: "a",
            kind: "choice",
            selectedOptionId: "a1",
            options: [
              { id: "a1", content: "identity" },
              { id: "a2", content: "unused" },
            ],
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
            id: "c",
            kind: "choice",
            selectedOptionId: "c1",
            options: [{ id: "c1", content: "format" }],
          },
        ],
      },
    },
    { id: "after", role: "system", content: "after" },
    { id: "history", role: "system", content: "", type: "chat_history" },
  ];
  const before = JSON.stringify(presets);
  const context = {
    messages: [{ role: "user", content: "history" }],
    agentConfig: { id: "agent", modelId: "model", presetMessages: presets },
    sharedData: new Map([["anchorDefinitions", []]]),
    logs: [],
    timestamp: Date.now(),
  } as unknown as PipelineContext;
  await injectionAssembler.execute(context);
  expect(
    context.messages
      .filter((item) => item.role === "system")
      .map((item) => [item.sourceId, item.content])
  ).toEqual([
    ["before", "before"],
    ["host", "identity|brief|examples|format"],
    ["after", "after"],
  ]);
  expect(
    context.messages.find((item) => item.sourceId === "host")
      ?.presetContributingParts
  ).toHaveLength(4);
  expect(JSON.stringify(presets)).toBe(before);
});
