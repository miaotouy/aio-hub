// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Tool Calling 核心逻辑单元测试
 *
 * 覆盖：协议解析、工具发现、方法执行（参数合并、类型适配、超时、安全策略、异步任务）
 *
 * 运行方式：
 *   bun run test src/tools/tool-calling
 *   bun run test:run
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { toolRegistryManager } from "@/services/registry";
import { VcpToolCallingProtocol } from "../core/protocols/vcp-protocol";
import { parseToolRequests } from "../core/parser";
import { executeToolRequests } from "../core/executor";
import { createToolDiscoveryService } from "../core/discovery";
import { processToolCallCycle, formatResultsForContext } from "../core/engine";
import type { ToolCallConfig } from "../types";
import {
  MockSyncTool,
  MockTimeoutTool,
  MockSecurityTool,
  MockAsyncTool,
  MockSchemaTool,
} from "./mock-tools";

// ============================================================
// 测试配置
// ============================================================

const defaultConfig: ToolCallConfig = {
  enabled: true,
  mode: "auto",
  toolToggles: {},
  autoApproveTools: {},
  autoApproveMethods: {},
  methodToggles: {},
  defaultToolEnabled: true,
  defaultAutoApprove: true,
  maxIterations: 5,
  timeout: 30000,
  parallelExecution: false,
  protocol: "vcp",
};

const protocol = new VcpToolCallingProtocol();
const discovery = createToolDiscoveryService();

// ============================================================
// 注册 / 注销 Mock 工具
// ============================================================

beforeAll(async () => {
  await toolRegistryManager.register(
    new MockSyncTool(),
    new MockTimeoutTool(),
    new MockSecurityTool(),
    new MockAsyncTool(),
    new MockSchemaTool()
  );
});

afterAll(async () => {
  await toolRegistryManager.dispose();
});

// ============================================================
// 1. 协议解析测试
// ============================================================

describe("VCP 协议解析", () => {
  it("解析单次工具调用请求", () => {
    const text = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」hello world「末」
<<<[END_TOOL_REQUEST]>>>`;

    const requests = parseToolRequests(text, protocol);
    expect(requests).toHaveLength(1);
    expect(requests[0].toolId).toBe("mock-sync");
    expect(requests[0].methodName).toBe("echo");
    expect(requests[0].args.message).toBe("hello world");
  });

  it("解析批量工具调用请求（索引参数）", () => {
    const text = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command1:「始」echo「末」,
message1:「始」first「末」,
command2:「始」echo「末」,
message2:「始」second「末」
<<<[END_TOOL_REQUEST]>>>`;

    const requests = parseToolRequests(text, protocol);
    expect(requests).toHaveLength(2);
    expect(requests[0].methodName).toBe("echo");
    expect(requests[0].args.message).toBe("first");
    expect(requests[1].methodName).toBe("echo");
    expect(requests[1].args.message).toBe("second");
  });

  it("跳过 Markdown 代码块中的伪请求", () => {
    const text = `这是一段说明
\`\`\`
<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」should be ignored「末」
<<<[END_TOOL_REQUEST]>>>
\`\`\`
下面是真正的请求：
<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」real message「末」
<<<[END_TOOL_REQUEST]>>>`;

    const requests = parseToolRequests(text, protocol);
    expect(requests).toHaveLength(1);
    expect(requests[0].args.message).toBe("real message");
  });

  it("处理未闭合标签的容错", () => {
    const text = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」incomplete
<<<[END_TOOL_REQUEST]>>>`;

    const requests = parseToolRequests(text, protocol);
    expect(requests).toHaveLength(1);
    // 未闭合的 message 值应被容错提取
    expect(requests[0].args.message).toBe("incomplete");
  });

  it("空文本返回空数组", () => {
    expect(parseToolRequests("", protocol)).toHaveLength(0);
    expect(parseToolRequests("   ", protocol)).toHaveLength(0);
  });
});

// ============================================================
// 2. 工具发现测试
// ============================================================

describe("工具发现", () => {
  it("发现所有 agentCallable 方法", () => {
    const methods = discovery.getDiscoveredMethods();
    const syncTool = methods.find((t) => t.toolId === "mock-sync");
    expect(syncTool).toBeDefined();
    // echo, add, toggleFlag 是 agentCallable，notCallable 不是
    expect(syncTool!.methods.map((m) => m.name).sort()).toEqual([
      "add",
      "echo",
      "toggleFlag",
    ]);
  });

  it("识别异步方法", () => {
    const methods = discovery.getDiscoveredMethods();
    const asyncTool = methods.find((t) => t.toolId === "mock-async");
    expect(asyncTool).toBeDefined();
    const longTask = asyncTool!.methods.find((m) => m.name === "longTask");
    expect(longTask).toBeDefined();
    expect(longTask!.executionMode).toBe("async");
  });

  it("生成工具定义 Prompt", () => {
    const prompt = discovery.generatePrompt({
      protocol: "vcp",
      config: defaultConfig,
      includeToolIds: ["mock-sync"],
    });
    expect(prompt).toContain("mock-sync");
    expect(prompt).toContain("<<<[TOOL_DEFINITION]>>>");
    expect(prompt).toContain("echo");
  });

  it("工具禁用时不生成 Prompt", () => {
    const disabledConfig: ToolCallConfig = {
      ...defaultConfig,
      enabled: false,
    };
    const prompt = discovery.generatePrompt({
      protocol: "vcp",
      config: disabledConfig,
    });
    expect(prompt).toBe("");
  });
});

// ============================================================
// 3. 方法执行测试
// ============================================================

describe("方法执行", () => {
  it("执行同步方法并返回正确结果", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」hello「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("success");
    expect(results[0].result).toBe("hello");
  });

  it("参数类型自动适配：字符串转数字", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」add「末」,
a:「始」3「末」,
b:「始」5「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results[0].status).toBe("success");
    expect(results[0].result).toBe("8");
  });

  it("参数类型自动适配：字符串转布尔", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」toggleFlag「末」,
flag:「始」true「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results[0].status).toBe("success");
    expect(results[0].result).toBe("true");
  });

  it("拒绝调用未标记 agentCallable 的方法", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」notCallable「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results[0].status).toBe("error");
    expect(results[0].result).toContain("agentCallable");
  });

  it("工具不存在时返回错误", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」non-existent-tool「末」,
command:「始」someMethod「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results[0].status).toBe("error");
    expect(results[0].result).toContain("不存在");
  });
});

// ============================================================
// 4. 超时保护测试
// ============================================================

describe("超时保护", () => {
  it("超时后返回错误", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-timeout「末」,
command:「始」longRunning「末」,
delayMs:「始」5000「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const timeoutConfig: ToolCallConfig = {
      ...defaultConfig,
      timeout: 100, // 100ms 超时，远小于 5000ms
    };

    const results = await executeToolRequests(requests, {
      config: timeoutConfig,
    });

    expect(results[0].status).toBe("error");
    expect(results[0].result).toContain("超时");
  }, 5000);
});

// ============================================================
// 5. 安全策略测试
// ============================================================

describe("安全策略", () => {
  it("安全方法直接通过", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-security「末」,
command:「始」safeRead「末」,
path:「始」/tmp/test「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results[0].status).toBe("success");
    expect(results[0].result).toBe("read:/tmp/test");
  });

  it("需要审批的方法在 auto 模式下自动通过", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-security「末」,
command:「始」dangerousWrite「末」,
path:「始」/tmp/test「末」,
content:「始」data「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    // auto 模式 + 工具级自动批准 = 自动通过
    const autoConfig: ToolCallConfig = {
      ...defaultConfig,
      mode: "auto",
      autoApproveTools: { "mock-security": true },
    };

    const results = await executeToolRequests(requests, {
      config: autoConfig,
    });

    expect(results[0].status).toBe("success");
    expect(results[0].result).toContain("wrote to /tmp/test");
  });

  it("需要审批的方法在 manual 模式下被拒绝", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-security「末」,
command:「始」dangerousWrite「末」,
path:「始」/tmp/test「末」,
content:「始」data「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    // manual 模式 + 无自动批准 = 需要审批
    const manualConfig: ToolCallConfig = {
      ...defaultConfig,
      mode: "manual",
      autoApproveTools: {},
    };

    const results = await executeToolRequests(requests, {
      config: manualConfig,
      // 模拟用户拒绝
      onBeforeExecute: async () => "rejected" as const,
    });

    expect(results[0].status).toBe("denied");
  });
});

// ============================================================
// 6. 参数合并优先级测试
// ============================================================

describe("参数合并优先级", () => {
  it("Schema 默认值 < LLM 实时参数", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-schema「末」,
command:「始」getConfig「末」,
theme:「始」dark「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const results = await executeToolRequests(requests, {
      config: defaultConfig,
    });

    expect(results[0].status).toBe("success");
    const parsed = JSON.parse(results[0].result);
    // LLM 传入的 theme=dark 覆盖 Schema 默认的 light
    expect(parsed.theme).toBe("dark");
    // fontSize 未传入，使用 Schema 默认值 14
    expect(parsed.fontSize).toBe(14);
  });

  it("Agent 预设覆盖 Schema 默认值", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-schema「末」,
command:「始」getConfig「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const presetConfig: ToolCallConfig = {
      ...defaultConfig,
      toolSettings: {
        "mock-schema": { theme: "blue", fontSize: 18 },
      },
    };

    const results = await executeToolRequests(requests, {
      config: presetConfig,
    });

    expect(results[0].status).toBe("success");
    const parsed = JSON.parse(results[0].result);
    // Agent 预设覆盖 Schema 默认值
    expect(parsed.theme).toBe("blue");
    expect(parsed.fontSize).toBe(18);
  });

  it("LLM 实时参数 > Agent 预设 > Schema 默认值", async () => {
    const requests = parseToolRequests(
      `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-schema「末」,
command:「始」getConfig「末」,
theme:「始」red「末」
<<<[END_TOOL_REQUEST]>>>`,
      protocol
    );

    const presetConfig: ToolCallConfig = {
      ...defaultConfig,
      toolSettings: {
        "mock-schema": { theme: "blue", fontSize: 18 },
      },
    };

    const results = await executeToolRequests(requests, {
      config: presetConfig,
    });

    expect(results[0].status).toBe("success");
    const parsed = JSON.parse(results[0].result);
    // LLM 实时参数 red 覆盖 Agent 预设 blue
    expect(parsed.theme).toBe("red");
    // fontSize 未由 LLM 传入，使用 Agent 预设 18
    expect(parsed.fontSize).toBe(18);
  });
});

// ============================================================
// 7. 完整周期测试
// ============================================================

describe("完整工具调用周期", () => {
  it("解析 → 执行 → 格式化结果", async () => {
    const text = `<<<[TOOL_REQUEST]>>>
tool_name:「始」mock-sync「末」,
command:「始」echo「末」,
message:「始」cycle test「末」
<<<[END_TOOL_REQUEST]>>>`;

    const cycleResult = await processToolCallCycle(text, {
      protocol,
      config: defaultConfig,
    });

    expect(cycleResult.hasToolRequests).toBe(true);
    expect(cycleResult.parsedRequests).toHaveLength(1);
    expect(cycleResult.executionResults).toHaveLength(1);
    expect(cycleResult.executionResults[0].status).toBe("success");

    const formatted = formatResultsForContext(
      cycleResult.executionResults,
      protocol
    );
    expect(formatted).toContain("cycle test");
    expect(formatted).toContain("SUCCESS");
  });

  it("无工具请求时返回空周期", async () => {
    const cycleResult = await processToolCallCycle("普通文本，无工具请求", {
      protocol,
      config: defaultConfig,
    });

    expect(cycleResult.hasToolRequests).toBe(false);
    expect(cycleResult.parsedRequests).toHaveLength(0);
    expect(cycleResult.executionResults).toHaveLength(0);
  });
});
