import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAgentStore, mockLogger } = vi.hoisted(() => ({
  mockAgentStore: {
    loadAgentDetails: vi.fn(),
    updateAgent: vi.fn(),
    savePresetMessage: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../stores/agentStore", () => ({
  useAgentStore: () => mockAgentStore,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => mockLogger,
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

import {
  getAgentFieldSecurityPolicy,
  isSecuritySensitiveAgentFieldPath,
  set_agent_field,
  edit_preset_composition,
} from "../agentManagementService";

describe("agentManagementService 安全配置修改", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toolCallConfig 任意子路径都要求独立审批", () => {
    for (const path of [
      "toolCallConfig",
      "toolCallConfig.mode",
      "toolCallConfig.defaultAutoApprove",
      "toolCallConfig.autoApproveTools.llm-chat-agent-mgmt",
      "toolCallConfig.autoApproveMethods.llm-chat-agent-mgmt_set_agent_field",
      "toolCallConfig.overrides.llm-chat-agent-mgmt:set_agent_field.enabled",
    ]) {
      expect(isSecuritySensitiveAgentFieldPath(path)).toBe(true);
      expect(
        getAgentFieldSecurityPolicy("set_agent_field", { path }).status
      ).toBe("approve");
    }
    expect(
      getAgentFieldSecurityPolicy("set_agent_field", {
        path: "parameters.temperature",
      }).status
    ).toBe("allow");
  });

  it("修改安全配置时记录操作者、请求与新旧值审计", async () => {
    mockAgentStore.loadAgentDetails.mockResolvedValue({
      id: "target-agent",
      toolCallConfig: { mode: "manual" },
    });

    const result = await set_agent_field(
      {
        agentId: "target-agent",
        path: "toolCallConfig.mode",
        value: "auto",
      },
      {
        agent: { id: "actor-agent" },
        requestId: "request-1",
      }
    );

    expect(result).toContain("成功更新字段");
    expect(mockAgentStore.updateAgent).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "set_agent_field 成功",
      expect.objectContaining({
        targetAgentId: "target-agent",
        actorAgentId: "actor-agent",
        requestId: "request-1",
        path: "toolCallConfig.mode",
        securitySensitive: true,
        oldValue: '"manual"',
        newValue: '"auto"',
      })
    );
  });
});

// The registered edit tool must persist the named version without replacing host settings.
it("persists a version rename through the composition tool with its original baseline", async () => {
  vi.clearAllMocks();
  const message = {
    id: "message",
    content: "",
    role: "system",
    groupId: "group",
    injectionStrategy: { type: "depth", depth: 2 },
    presetComposition: {
      version: 1,
      separator: "",
      parts: [
        {
          id: "part",
          kind: "choice",
          selectedOptionId: "active",
          options: [
            { id: "active", content: "当前正文" },
            { id: "other", content: "其他正文" },
          ],
        },
      ],
    },
  };
  mockAgentStore.loadAgentDetails.mockResolvedValue({
    id: "agent",
    presetMessages: [message],
  });
  mockAgentStore.savePresetMessage.mockResolvedValue(undefined);
  const result = JSON.parse(
    await edit_preset_composition({
      agentId: "agent",
      messageId: "message",
      operation: JSON.stringify({
        type: "setOptionName",
        partId: "part",
        optionId: "other",
        name: "详细版本",
      }),
    })
  );
  const expected = structuredClone(message);
  const option = {
    ...expected.presetComposition.parts[0].options[1],
    name: "详细版本",
  };
  expected.presetComposition.parts[0].options[1] = option;
  expect(mockAgentStore.savePresetMessage).toHaveBeenCalledWith(
    "agent",
    expected,
    message
  );
  expect(result).toEqual({
    messageId: "message",
    presetComposition: expected.presetComposition,
  });
  expect(message.presetComposition.parts[0].options[1]).toEqual({
    id: "other",
    content: "其他正文",
  });
});
