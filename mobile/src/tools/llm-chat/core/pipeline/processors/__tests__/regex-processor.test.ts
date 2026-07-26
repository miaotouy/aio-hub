import { describe, expect, it } from "vitest";
import type { PipelineContext } from "@/tools/llm-chat/types";
import { regexProcessor } from "../regex-processor";

function context(
  messages: PipelineContext["messages"],
  regexConfig: unknown
): PipelineContext {
  return {
    messages,
    session: {} as PipelineContext["session"],
    agentConfig: {
      id: "agent-1",
      regexConfig,
    } as PipelineContext["agentConfig"],
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    sharedData: new Map(),
    logs: [],
  };
}

const config = {
  presets: [
    {
      enabled: true,
      priority: 50,
      rules: [
        {
          enabled: true,
          name: "Assistant only",
          regex: "/foo/gi",
          replacement: "bar",
          applyTo: { request: true, render: false },
          targetRoles: ["assistant"],
        },
        {
          enabled: true,
          name: "Newest user only",
          regex: "secret",
          replacement: "[redacted]",
          applyTo: { request: true, render: false },
          targetRoles: ["user"],
          depthRange: { max: 0 },
        },
      ],
    },
  ],
};

describe("regexProcessor", () => {
  it("applies imported request rules by role, depth, and multimodal text", async () => {
    const pipeline = context(
      [
        { role: "user", content: "secret from history" },
        { role: "assistant", content: "FOO response" },
        {
          role: "user",
          content: [
            { type: "text", text: "secret with image" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AA==" },
            },
          ] as any,
        },
      ],
      config
    );

    await regexProcessor.execute(pipeline);

    expect(pipeline.messages[0].content).toBe("secret from history");
    expect(pipeline.messages[1].content).toBe("bar response");
    expect(pipeline.messages[2].content).toEqual([
      { type: "text", text: "[redacted] with image" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
    ]);
  });

  it("executes rules by preset priority and rule order", async () => {
    const pipeline = context([{ role: "user", content: "start" }], {
      presets: [
        {
          enabled: true,
          priority: 100,
          rules: [
            {
              enabled: true,
              regex: "start",
              replacement: "late",
              applyTo: { request: true },
              targetRoles: ["user"],
              order: 0,
            },
          ],
        },
        {
          enabled: true,
          priority: 10,
          rules: [
            {
              enabled: true,
              regex: "start",
              replacement: "middle",
              applyTo: { request: true },
              targetRoles: ["user"],
              order: 10,
            },
            {
              enabled: true,
              regex: "middle",
              replacement: "early",
              applyTo: { request: true },
              targetRoles: ["user"],
              order: 20,
            },
          ],
        },
      ],
    });

    await regexProcessor.execute(pipeline);

    expect(pipeline.messages[0].content).toBe("early");
  });

  it("skips malformed configurations and script rules without blocking requests", async () => {
    const pipeline = context([{ role: "user", content: "keep me" }], {
      presets: [
        {
          enabled: true,
          rules: [
            {
              enabled: true,
              regex: "[",
              replacement: "x",
              applyTo: { request: true },
              targetRoles: ["user"],
            },
          ],
        },
        {
          enabled: true,
          rules: [
            {
              enabled: true,
              regex: "keep",
              replacement: "change",
              applyTo: { request: true },
              targetRoles: ["user"],
              replacementType: "script",
            },
          ],
        },
      ],
    });

    await regexProcessor.execute(pipeline);

    expect(pipeline.messages[0].content).toBe("keep me");
    expect(pipeline.logs.some((entry) => entry.level === "error")).toBe(true);
    expect(pipeline.logs[pipeline.logs.length - 1]?.message).toContain(
      "跳过 1 条脚本规则"
    );
  });
});
