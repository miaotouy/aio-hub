import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAgentStore, mockLogger } = vi.hoisted(() => ({
  mockAgentStore: {
    loadAgentDetails: vi.fn(),
    updateAgent: vi.fn(),
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
