// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import type { ChatRegexConfig, ChatRegexRule } from "../../../types/chatRegex";
const state = vi.hoisted(() => ({
  global: undefined as ChatRegexConfig | undefined,
}));
vi.mock("@/tools/llm-chat/composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: { value: { regexConfig: state.global } },
  }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info() {}, error() {} }),
}));
import { regexProcessor } from "../regex-processor";
const rule = (
  id: string,
  regex: string,
  replacement: string,
  overrides: Partial<ChatRegexRule> = {}
): ChatRegexRule => ({
  id,
  enabled: true,
  regex,
  replacement,
  targetRoles: ["user", "assistant"],
  applyTo: { render: false, request: true },
  ...overrides,
});
const config = (
  priority: number,
  ...rules: ChatRegexRule[]
): ChatRegexConfig => ({
  presets: [
    { id: String(priority), name: "test", enabled: true, priority, rules },
  ],
});
const context = (
  messages: ProcessableMessage[],
  agent?: ChatRegexConfig,
  user?: ChatRegexConfig
): PipelineContext =>
  ({
    messages,
    agentConfig: { regexConfig: agent },
    userProfile: { regexConfig: user },
    sharedData: new Map(),
    logs: [],
  }) as unknown as PipelineContext;
describe("request regex rules", () => {
  it("按全局/智能体/用户优先级串联替换，并按角色和深度过滤，保留多模态其余部分", async () => {
    state.global = config(
      30,
      rule("global", "A", "B", { flags: "g" }),
      rule("latest", "B", "new", { depthRange: { max: 0 }, order: 1 })
    );
    const ctx = context(
      [
        { role: "system", content: "seed" },
        { role: "user", content: "seed seed" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "seed seed" },
            { type: "text", text: "unchanged" },
          ],
        },
        { role: "user", content: "seed" },
      ],
      config(20, rule("agent", "X", "A", { flags: "g" })),
      config(10, rule("user", "seed", "X", { flags: "g" }))
    );
    await regexProcessor.execute(ctx);
    expect(ctx.messages.map((m) => m.content)).toEqual([
      "seed",
      "B B",
      [
        { type: "text", text: "B B" },
        { type: "text", text: "unchanged" },
      ],
      "new",
    ]);
  });
  it("每条消息重置有状态表达式，错误规则仍允许其余替换，下一次构建使用新配置", async () => {
    state.global = config(
      10,
      rule("bad", "[", "bad"),
      rule("sticky", "/seed/y", "hit")
    );
    const ctx = context([
      { role: "user", content: "seed tail" },
      { role: "user", content: "seed tail" },
    ]);
    await regexProcessor.execute(ctx);
    expect(ctx.messages.map((m) => m.content)).toEqual([
      "hit tail",
      "hit tail",
    ]);
    expect(ctx.logs.filter((l) => l.level === "error")).toHaveLength(1);
    state.global.presets[0].rules[1].replacement = "changed";
    const next = context([{ role: "user", content: "seed tail" }]);
    await regexProcessor.execute(next);
    expect(next.messages[0].content).toBe("changed tail");
  });
});
