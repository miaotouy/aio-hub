import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const callSystemOne = vi.hoisted(() => vi.fn());

vi.mock("@/llm-apis/system-one-core", () => ({
  callTypeSafeSystemOneApi: callSystemOne,
}));

import { createDecisionArbiter } from "../index";
import {
  DEFAULT_DECISION_ARBITRATION_CONFIG,
  DEFAULT_DECISION_CHANNEL_SETTINGS,
  type ArbitrationContext,
  type DecisionArbitrationConfig,
  type DecisionChannelSettings,
} from "../types";
import type { LlmProfile } from "@/types/llm-profiles";

function ctx(
  overrides: Partial<ArbitrationContext> = {}
): ArbitrationContext {
  return {
    request: {
      requestId: "req-1",
      toolId: "aio-file-operator",
      methodName: "write_file",
      toolName: "文件写入",
      rawBlock: "",
      args: { path: "E:/tmp/a.txt" },
    },
    source: "orchestrator",
    forceApproval: false,
    ...overrides,
  };
}

function jevOk(answers: {
  risk: number;
  intent: number;
  verdict: string;
  confidence?: number;
}) {
  return {
    model: "jev-latest",
    answers: {
      risk: { type: "noul", noul: answers.risk },
      intent: { type: "noul", noul: answers.intent },
      verdict: {
        type: "choice",
        choice: answers.verdict,
        probabilities: {},
        confidence: answers.confidence ?? 0.95,
      },
    },
    usage: { inputTokens: 1, outputTokens: 0 },
  };
}

function buildDeps(
  config: Partial<DecisionArbitrationConfig> = {},
  channel: Partial<DecisionChannelSettings> = {}
) {
  const profile = {
    id: "profile-1",
    enabled: true,
    baseUrl: "https://api.typesafe.ai",
    apiKeys: ["k"],
    models: [
      {
        id: DEFAULT_DECISION_CHANNEL_SETTINGS.model,
        name: "JEV",
        capabilities: { decision: true },
      },
    ],
  } as unknown as LlmProfile;
  return {
    getChannelSettings: () => ({
      ...DEFAULT_DECISION_CHANNEL_SETTINGS,
      profileId: "profile-1",
      ...channel,
    }),
    getArbitrationConfig: () => ({
      ...DEFAULT_DECISION_ARBITRATION_CONFIG,
      ...config,
    }),
    getProfileById: (id: string) => (id === "profile-1" ? profile : undefined),
    callSystemOne,
    now: () => Date.now(),
  };
}

describe("createDecisionArbiter", () => {
  beforeEach(() => {
    callSystemOne.mockReset();
  });

  it("未启用配置时直接 escalate，不调用渠道", async () => {
    const arbiter = createDecisionArbiter(buildDeps());
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("静态危险特征命中时跳过仲裁转人工（红线 6）", async () => {
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true })
    );
    const decision = await arbiter.arbitrate(
      ctx({
        request: {
          requestId: "req-2",
          toolId: "shell",
          methodName: "exec",
          toolName: "shell",
          rawBlock: "",
          args: { command: "sudo rm -rf /" } as Record<string, string>,
        },
      })
    );
    expect(decision.action).toBe("escalate");
    expect(decision.reason).toContain("危险特征");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("gray-zone 模式下强制审批直接转人工，不消耗 JEV", async () => {
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true, mode: "gray-zone" })
    );
    const decision = await arbiter.arbitrate(ctx({ forceApproval: true }));
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("渠道未配置时 fail-closed escalate", async () => {
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true }, { profileId: null })
    );
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("渠道 profile 不存在时 fail-closed escalate", async () => {
    const deps = buildDeps({ enabled: true });
    const arbiter = createDecisionArbiter({
      ...deps,
      getProfileById: () => undefined,
    });
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
  });

  it("渠道 profile 被停用后 fail-closed escalate，不沿用持久化配置", async () => {
    const deps = buildDeps({ enabled: true });
    const disabledProfile = {
      ...(deps.getProfileById("profile-1") as LlmProfile),
      enabled: false,
    };
    const arbiter = createDecisionArbiter({
      ...deps,
      getProfileById: () => disabledProfile,
    });
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("channel.model 不在 profile 模型列表时 fail-closed escalate", async () => {
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true }, { model: "removed-model" })
    );
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("模型失去 decision 能力后 fail-closed escalate", async () => {
    const deps = buildDeps({ enabled: true });
    const noDecisionProfile = {
      ...(deps.getProfileById("profile-1") as LlmProfile),
      models: [
        { id: "jev-latest", name: "JEV", capabilities: { decision: false } },
      ],
    };
    const arbiter = createDecisionArbiter({
      ...deps,
      getProfileById: () => noDecisionProfile,
    });
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("低风险高意图请求自动放行并返回审计快照", async () => {
    callSystemOne.mockResolvedValue(
      jevOk({ risk: 0.04, intent: 0.92, verdict: "approve" })
    );
    const arbiter = createDecisionArbiter(buildDeps({ enabled: true }));
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("approve");
    expect(decision.audit?.risk).toBeCloseTo(0.04);
    expect(decision.audit?.degraded).toBe(false);
    expect(callSystemOne).toHaveBeenCalledTimes(1);
  });

  it("高风险请求直接拒绝（Jev 风险拦截）", async () => {
    callSystemOne.mockResolvedValue(
      jevOk({ risk: 0.9, intent: 0.3, verdict: "deny" })
    );
    const arbiter = createDecisionArbiter(buildDeps({ enabled: true }));
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("deny");
  });

  it("aggressive 模式下强制审批以更严门槛放行", async () => {
    callSystemOne.mockResolvedValue(
      jevOk({ risk: 0.04, intent: 0.9, verdict: "approve" })
    );
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true, mode: "aggressive" })
    );
    const decision = await arbiter.arbitrate(ctx({ forceApproval: true }));
    expect(decision.action).toBe("approve");
  });

  it("aggressive 模式下强制审批超过 forceApprovalRiskThreshold 不放行", async () => {
    callSystemOne.mockResolvedValue(
      jevOk({ risk: 0.08, intent: 0.9, verdict: "approve" })
    );
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true, mode: "aggressive" })
    );
    const decision = await arbiter.arbitrate(ctx({ forceApproval: true }));
    expect(decision.action).toBe("escalate");
  });

  it("渠道 429 后有限重试成功", async () => {
    callSystemOne
      .mockRejectedValueOnce(new Error("HTTP 429 Too Many Requests"))
      .mockResolvedValueOnce(
        jevOk({ risk: 0.03, intent: 0.95, verdict: "approve" })
      );
    const arbiter = createDecisionArbiter(buildDeps({ enabled: true }));
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("approve");
    expect(callSystemOne).toHaveBeenCalledTimes(2);
    expect(decision.telemetry?.retried).toBe(true);
  });

  it("渠道永久失败时 fail-closed escalate（绝不自动放行）", async () => {
    callSystemOne.mockRejectedValue(new Error("HTTP 401 Unauthorized"));
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true }, { maxRetries: 0 })
    );
    const decision = await arbiter.arbitrate(ctx());
    expect(decision.action).toBe("escalate");
    expect(decision.audit?.degraded).toBe(true);
  });

  it("同一请求指纹 60s 内重复 escalate 时跳过仲裁（红线 8）", async () => {
    callSystemOne.mockResolvedValue(
      jevOk({ risk: 0.4, intent: 0.4, verdict: "escalate" })
    );
    const arbiter = createDecisionArbiter(buildDeps({ enabled: true }));

    const first = await arbiter.arbitrate(ctx());
    expect(first.action).toBe("escalate");
    expect(callSystemOne).toHaveBeenCalledTimes(1);

    const second = await arbiter.arbitrate(ctx());
    expect(second.action).toBe("escalate");
    expect(second.reason).toContain("短时间内");
    expect(callSystemOne).toHaveBeenCalledTimes(1);
  });

  it("不同请求指纹互不影响防循环记录", async () => {
    callSystemOne.mockResolvedValue(
      jevOk({ risk: 0.4, intent: 0.4, verdict: "escalate" })
    );
    const arbiter = createDecisionArbiter(buildDeps({ enabled: true }));

    await arbiter.arbitrate(ctx());
    await arbiter.arbitrate(
      ctx({
        request: {
          requestId: "req-3",
          toolId: "aio-file-operator",
          methodName: "write_file",
          toolName: "文件写入",
          rawBlock: "",
          args: { path: "E:/tmp/other.txt" },
        },
      })
    );
    expect(callSystemOne).toHaveBeenCalledTimes(2);
  });

  it("signal 已中止时直接 escalate，不调用渠道", async () => {
    const arbiter = createDecisionArbiter(buildDeps({ enabled: true }));
    const controller = new AbortController();
    controller.abort();
    const decision = await arbiter.arbitrate(ctx(), controller.signal);
    expect(decision.action).toBe("escalate");
    expect(callSystemOne).not.toHaveBeenCalled();
  });

  it("仲裁进行中 signal 中止 → 返回 escalate 且渠道调用被中止", async () => {
    const controller = new AbortController();
    callSystemOne.mockImplementation(
      (_profile, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(new Error("The operation was aborted"));
          });
        })
    );
    const arbiter = createDecisionArbiter(
      buildDeps({ enabled: true }, { maxRetries: 0 })
    );
    const decisionPromise = arbiter.arbitrate(ctx(), controller.signal);
    controller.abort();
    const decision = await decisionPromise;
    expect(decision.action).toBe("escalate");
    expect(decision.audit?.degraded).toBe(true);
  });

  it("isArbitrationEnabled 反映 Agent 配置开关", () => {
    const disabled = createDecisionArbiter(buildDeps());
    expect(disabled.isArbitrationEnabled(ctx())).toBe(false);

    const enabled = createDecisionArbiter(buildDeps({ enabled: true }));
    expect(enabled.isArbitrationEnabled(ctx())).toBe(true);
  });

  it("isArbitrationEnabled 按 agentId 解析配置（无 Agent 时回落默认禁用）", () => {
    const deps = buildDeps();
    const arbiter = createDecisionArbiter({
      ...deps,
      getArbitrationConfig: (agentId?: string) => ({
        ...DEFAULT_DECISION_ARBITRATION_CONFIG,
        enabled: agentId === "agent-1",
      }),
    });
    expect(arbiter.isArbitrationEnabled(ctx({ agentId: "agent-1" }))).toBe(true);
    expect(arbiter.isArbitrationEnabled(ctx())).toBe(false);
  });
});
