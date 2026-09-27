import { describe, expect, it } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type {
  PipelineContext,
  ProcessableMessage,
} from "@/tools/llm-chat/types";
import { macrosRenderer } from "../macros-renderer";

function createContext(
  messages: ProcessableMessage[],
  agentConfig: ChatAgent | null = null,
  timestamp: number = Date.now()
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
    timestamp,
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
          children: [{ key: "score", type: "variable", initialValue: 3 }],
        },
      ],
    },
  };
}

describe("macrosRenderer", () => {
  it("expands the mobile role-chat macro scope without expanding escaped or unknown macros", async () => {
    const context = createContext(
      [
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
      ],
      createAgent()
    );

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
    const context = createContext(
      [
        {
          role: "system",
          content:
            "Score {{getvar::status.score}}{{incvar::status.score}} now {{getvar::status.score}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
        {
          role: "assistant",
          content:
            '<svar name="status.score" op="+" value="4" />Score {{getvar::status.score}}',
          sourceType: "session_history",
          sourceId: "assistant-1",
        },
        {
          role: "user",
          content: "{{setvar::status.score::12}}Final {{getvar::status.score}}",
          sourceType: "session_history",
          sourceId: "user-1",
        },
      ],
      createAgent()
    );

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

  it("appends agent private assets after the global attachment summary", async () => {
    const agent = createAgent();
    agent.assetGroups = [
      { id: "bgm", displayName: "背景音乐" },
      { id: "emoji", displayName: "表情" },
    ];
    agent.assets = [
      {
        id: "bgm_rain",
        filename: "rain.mp3",
        path: "assets/rain.mp3",
        type: "audio",
        group: "bgm",
        description: "雨声循环",
      },
      {
        id: "sticker_ok",
        filename: "ok.png",
        path: "assets/ok.png",
        type: "image",
      },
    ];
    const context = createContext(
      [
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
      ],
      agent
    );

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      [
        "Available files:",
        "- sunset.png (image/png, asset-image)",
        "",
        "Agent private assets:",
        "- [Audio] rain.mp3 (handle: bgm_rain): 雨声循环",
        "- [Image] ok.png (handle: sticker_ok)",
      ].join("\n")
    );
  });

  it("lists only agent private assets when there are no global attachments", async () => {
    const agent = createAgent();
    agent.assets = [
      {
        id: "bgm_rain",
        filename: "rain.mp3",
        path: "assets/rain.mp3",
        type: "audio",
      },
    ];
    const context = createContext(
      [
        {
          role: "system",
          content: "{{assets}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      agent
    );

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      "Agent private assets:\n- [Audio] rain.mp3 (handle: bgm_rain)"
    );
  });

  it("filters agent private assets by group with desktop default-bucket semantics", async () => {
    const agent = createAgent();
    agent.assetGroups = [{ id: "bgm", displayName: "背景音乐" }];
    agent.assets = [
      {
        id: "bgm_rain",
        filename: "rain.mp3",
        path: "assets/rain.mp3",
        type: "audio",
        group: "bgm",
        description: "雨声循环",
      },
      {
        id: "sticker_ok",
        filename: "ok.png",
        path: "assets/ok.png",
        type: "image",
      },
      {
        id: "ghost_ref",
        filename: "ghost.bin",
        path: "assets/ghost.bin",
        type: "file",
        group: "missing-group",
      },
    ];
    const context = createContext(
      [
        {
          role: "system",
          content: "{{assets::bgm}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
        {
          role: "system",
          content: "{{assets::default}}",
          sourceType: "agent_preset",
          sourceId: "preset-2",
        },
        {
          role: "system",
          content: "{{assets::emoji}}",
          sourceType: "agent_preset",
          sourceId: "preset-3",
        },
      ],
      agent
    );

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      'Assets in group "bgm":\n- [Audio] rain.mp3 (handle: bgm_rain): 雨声循环'
    );
    expect(context.messages[1].content).toBe(
      [
        'Assets in group "default":',
        "- [Image] ok.png (handle: sticker_ok)",
        "- [File] ghost.bin (handle: ghost_ref)",
      ].join("\n")
    );
    expect(context.messages[2].content).toBe('No assets in group "emoji".');
  });

  it("tolerates legacy unknown assetGroups payloads without crashing", async () => {
    const agent = createAgent();
    agent.assets = [
      {
        id: "sticker_ok",
        filename: "ok.png",
        path: "assets/ok.png",
        type: "image",
      },
    ];
    // 旧占位 unknown[] 可能混入非对象或缺少 id 的项
    (agent as { assetGroups?: unknown }).assetGroups = [
      "legacy",
      null,
      { displayName: "无 id" },
      { id: "bgm", displayName: "背景音乐" },
    ];
    const context = createContext(
      [
        {
          role: "system",
          content: "{{assets::default}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      agent
    );

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      'Assets in group "default":\n- [Image] ok.png (handle: sticker_ok)'
    );
  });

  it("expands time macros from the pipeline timestamp with desktop format semantics", async () => {
    // 本地时间 2026-07-27 14:30:45，避免时区歧义
    const fixedTimestamp = new Date(2026, 6, 27, 14, 30, 45).getTime();
    const context = createContext(
      [
        {
          role: "system",
          content: "{{time}}|{{date}}|{{isotime}}|{{datetime}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      createAgent(),
      fixedTimestamp
    );

    await macrosRenderer.execute(context);

    const expectedIso = new Date(fixedTimestamp).toISOString();
    expect(context.messages[0].content).toBe(
      `2:30 PM|July 27, 2026|${expectedIso}|2026-07-27 14:30:45`
    );
  });

  it("wraps 12-hour clock boundaries for the time macro", async () => {
    const midnight = new Date(2026, 6, 27, 0, 5).getTime();
    const noon = new Date(2026, 6, 27, 12, 0).getTime();
    const midnightContext = createContext(
      [
        {
          role: "system",
          content: "{{time}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      createAgent(),
      midnight
    );
    const noonContext = createContext(
      [
        {
          role: "system",
          content: "{{time}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      createAgent(),
      noon
    );

    await macrosRenderer.execute(midnightContext);
    await macrosRenderer.execute(noonContext);

    expect(midnightContext.messages[0].content).toBe("12:05 AM");
    expect(noonContext.messages[0].content).toBe("12:00 PM");
  });

  it("derives time macros from virtualTimeConfig with the desktop elapsed-time formula", async () => {
    const realBase = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const virtualBase = new Date(2000, 0, 1, 0, 0, 0).getTime();
    const agent = createAgent();
    agent.virtualTimeConfig = {
      virtualBaseTime: new Date(virtualBase).toISOString(),
      realBaseTime: new Date(realBase).toISOString(),
      timeScale: 2,
    };

    const scaledContext = createContext(
      [
        {
          role: "system",
          content: "{{datetime}}|{{isotime}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      agent,
      realBase + 1000
    );
    await macrosRenderer.execute(scaledContext);

    const expectedScaled = new Date(virtualBase + 2000);
    expect(scaledContext.messages[0].content).toBe(
      `2000-01-01 00:00:02|${expectedScaled.toISOString()}`
    );

    // timeScale 缺省时按 1 倍速推进
    const defaultScaleAgent = createAgent();
    defaultScaleAgent.virtualTimeConfig = {
      virtualBaseTime: new Date(virtualBase).toISOString(),
      realBaseTime: new Date(realBase).toISOString(),
    };
    const defaultScaleContext = createContext(
      [
        {
          role: "system",
          content: "{{datetime}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      defaultScaleAgent,
      realBase + 1000
    );
    await macrosRenderer.execute(defaultScaleContext);

    expect(defaultScaleContext.messages[0].content).toBe(
      "2000-01-01 00:00:01"
    );
  });

  it("falls back to the real time when virtualTimeConfig cannot be parsed", async () => {
    const fixedTimestamp = new Date(2026, 6, 27, 14, 30, 45).getTime();
    const agent = createAgent();
    agent.virtualTimeConfig = {
      virtualBaseTime: "not-a-date",
      realBaseTime: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    };

    const context = createContext(
      [
        {
          role: "system",
          content: "{{isotime}}|{{date}}",
          sourceType: "agent_preset",
          sourceId: "preset-1",
        },
      ],
      agent,
      fixedTimestamp
    );

    await macrosRenderer.execute(context);

    expect(context.messages[0].content).toBe(
      `${new Date(fixedTimestamp).toISOString()}|July 27, 2026`
    );
  });
});
