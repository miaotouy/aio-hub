import { describe, expect, it } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type { PipelineContext, ProcessableMessage } from "@/tools/llm-chat/types";
import { macrosRenderer } from "../macros-renderer";

function createContext(
  messages: ProcessableMessage[],
  agentConfig: ChatAgent | null = null
): PipelineContext {
  return {
    messages,
    session: {} as PipelineContext["session"],
    agentConfig,
    userProfile: {
      id: "profile-user",
      name: "Alicia",
      displayName: "Alice",
      content: "A thoughtful explorer.",
      enabled: true,
      createdAt: "2026-07-27T00:00:00.000Z",
    },
    settings: {} as PipelineContext["settings"],
    timestamp: Date.now(),
    sharedData: new Map([
      ["model", { id: "model-1", name: "Model One" }],
      ["profile", { id: "provider-1", name: "Primary API" }],
    ]),
    logs: [],
  };
}

function createAgent(): ChatAgent {
  return {
    id: "agent-1",
    name: "Mira",
    displayName: "Mira the Guide",
    description: "A patient guide.",
    profileId: "provider-1",
    modelId: "model-1",
    createdAt: "2026-07-27T00:00:00.000Z",
    variableConfig: {
      enabled: true,
      definitions: [
        {
          key: "status",
          type: "group",
          children: [
            { key: "score", type: "variable", initialValue: 3 },
          ],
        },
      ],
    },
  };
}

describe("macrosRenderer", () => {
  it("expands the mobile role-chat macro scope without expanding escaped or unknown macros", async () => {
    const context = createContext([
      {
        role: "system",
        content:
          "{{char}} / {{user}} / {{persona}} / {{description}} / {{modelName}} / {{profileName}}",
        sourceType: "agent_preset",
        sourceId: "preset-1",
      },
      {
        role: "user",
        content: "Please help me.",
        sourceType: "session_history",
        sourceId: "user-1",
      },
      {
        role: "assistant",
        content: "The previous request was: {{lastUserMessage}}.",
        sourceType: "session_history",
        sourceId: "assistant-1",
      },
      {
        role: "user",
        content: "\\{{char}} {{unknown_macro}} {{input}}",
        sourceType: "session_history",
        sourceId: "user-2",
      },
    ], createAgent());

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      "Mira the Guide / Alice / A thoughtful explorer. / A patient guide. / Model One / Primary API"
    );
    expect(context.messages[1].content).toBe("Please help me.");
    expect(context.messages[2].content).toBe(
      "The previous request was: Please help me.."
    );
    expect(context.messages[3].content).toBe(
      "{{char}} {{unknown_macro}} \\{{char}} {{unknown_macro}} {{input}}"
    );
    expect(context.messages[0]._originalContent).toContain("{{char}}");
  });

  it("applies imported variable definitions, <svar> operations, and stateful variable macros in message order", async () => {
    const context = createContext([
      {
        role: "system",
        content: "Score {{getvar::status.score}}{{incvar::status.score}} now {{getvar::status.score}}",
        sourceType: "agent_preset",
        sourceId: "preset-1",
      },
      {
        role: "assistant",
        content: '<svar name="status.score" op="+" value="4" />Score {{getvar::status.score}}',
        sourceType: "session_history",
        sourceId: "assistant-1",
      },
      {
        role: "user",
        content: "{{setvar::status.score::12}}Final {{getvar::status.score}}",
        sourceType: "session_history",
        sourceId: "user-1",
      },
    ], createAgent());

    await macrosRenderer.execute(context);

    expect(context.messages.map((message) => message.content)).toEqual([
      "Score 3 now 4",
      "Score 8",
      "Final 12",
    ]);
    expect(context.messages[1]._originalContent).toContain("<svar");
    expect(context.sharedData.get("sessionVariables")).toEqual(
      new Map([["status.score", 12]])
    );
  });

  it("exposes only lightweight attachment summaries through the assets macro", async () => {
    const context = createContext([
      {
        role: "user",
        content: "Available files:\n{{assets}}",
        sourceType: "session_history",
        sourceId: "user-1",
        _attachments: [
          {
            assetId: "asset-image",
            usagePolicy: "advisory",
            snapshot: {
              displayName: "sunset.png",
              kind: "image",
              mimeType: "image/png",
              sizeBytes: 128,
            },
          },
        ],
      },
    ]);

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      "Available files:\n- sunset.png (image/png, asset-image)"
    );
  });
});
