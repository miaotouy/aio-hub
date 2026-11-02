import { describe, expect, it } from "vitest";
import {
  buildLlmApprovalRequest,
  evaluateLlmApproval,
  parseLlmApproval,
} from "../llmApproval";
import {
  DEFAULT_DECISION_ARBITRATION_CONFIG,
  type ArbitrationContext,
  type LlmApprovalAssessment,
} from "../types";

const context: ArbitrationContext = {
  request: {
    requestId: "r",
    toolId: "reader",
    methodName: "read",
    toolName: "读取",
    rawBlock: "",
    args: { path: "input.txt" },
  },
  source: "orchestrator",
  forceApproval: false,
  toolDescription: "读取指定路径的文本文件",
  recentUserMessage: "读取工作目录中的 input.txt",
};
const approved: LlmApprovalAssessment = {
  action: "approve",
  riskLevel: "low",
  matchesUserIntent: true,
  explicitlyAuthorized: true,
  reason: "读取范围符合用户要求",
};
const config = { ...DEFAULT_DECISION_ARBITRATION_CONFIG, enabled: true };

describe("普通 LLM 审批契约", () => {
  it("解析完整 JSON 与单个 JSON 代码块", () => {
    expect(parseLlmApproval(JSON.stringify(approved))).toEqual(approved);
    expect(
      parseLlmApproval("```json\n" + JSON.stringify(approved) + "\n```")
    ).toEqual(approved);
  });

  it.each([
    JSON.stringify({ ...approved, matchesUserIntent: "true" }),
    JSON.stringify({ ...approved, action: ["approve"] }),
    "同意执行 " + JSON.stringify(approved),
  ])("格式异常的结果转人工，不做宽松类型转换", (content) => {
    expect(
      evaluateLlmApproval(parseLlmApproval(content), context, config).action
    ).toBe("escalate");
  });

  it("自动批准需要低风险与用户意图一致", () => {
    expect(evaluateLlmApproval(approved, context, config).action).toBe(
      "approve"
    );
    expect(
      evaluateLlmApproval({ ...approved, riskLevel: "high" }, context, config)
        .action
    ).toBe("escalate");
    expect(
      evaluateLlmApproval(
        { ...approved, matchesUserIntent: false },
        context,
        config
      ).action
    ).toBe("escalate");
  });

  it("强制审批在激进模式下仍要求明确授权", () => {
    const forced = { ...context, forceApproval: true };
    expect(evaluateLlmApproval(approved, forced, config).action).toBe(
      "escalate"
    );
    const aggressive = { ...config, mode: "aggressive" as const };
    expect(
      evaluateLlmApproval(
        { ...approved, explicitlyAuthorized: false },
        forced,
        aggressive
      ).action
    ).toBe("escalate");
    expect(evaluateLlmApproval(approved, forced, aggressive).action).toBe(
      "approve"
    );
  });

  it("外部来源沿用明确配置的自动批准限制", () => {
    const external = { ...context, source: "vcp-node" as const };
    expect(evaluateLlmApproval(approved, external, config).action).toBe(
      "escalate"
    );
    expect(
      evaluateLlmApproval(approved, external, {
        ...config,
        autoApproveExternalSources: true,
      }).action
    ).toBe("approve");
  });

  it("审核实际执行参数并隐藏结构化凭证，待审文本保持在数据消息内", () => {
    const request = buildLlmApprovalRequest(
      {
        ...context,
        effectiveArgs: {
          path: "resolved.txt",
          apiKey: "private-secret",
          nested: { password: "private-password" },
        },
      },
      "profile",
      { id: "reviewer", name: "审核模型" },
      "写入已有文件时转人工"
    );
    const data = JSON.parse(request.messages![1].content as string);
    expect(data.arguments).toEqual({
      path: "resolved.txt",
      apiKey: "[凭证已隐藏]",
      nested: { password: "[凭证已隐藏]" },
    });
    expect(data.userIntent).toBe(context.recentUserMessage);
    expect(request.messages![0].role).toBe("system");
  });

  it("信息缺失或上下文超预算时先转人工，保持作用范围完整", () => {
    const model = { id: "reviewer", name: "审核模型" };
    expect(() =>
      buildLlmApprovalRequest(
        { ...context, recentUserMessage: undefined },
        "profile",
        model
      )
    ).toThrow();
    expect(() =>
      buildLlmApprovalRequest(
        { ...context, effectiveArgs: { content: "文档内容".repeat(5000) } },
        "profile",
        model
      )
    ).toThrow();
  });
});
