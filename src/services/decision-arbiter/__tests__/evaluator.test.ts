import { describe, expect, it } from "vitest";
import type { SystemOneResponse } from "@aiohub/llm-core";
import { evaluateArbitration, type EvaluatorInput } from "../evaluator";
import { DEFAULT_DECISION_ARBITRATION_CONFIG } from "../types";

function jevResponse(overrides: {
  risk?: number | "invalid";
  intent?: number | "invalid";
  verdict?: string;
  confidence?: number | "invalid";
  omitAnswers?: boolean;
}): SystemOneResponse {
  if (overrides.omitAnswers) {
    return {
      model: "jev-latest",
      answers: {},
      usage: { inputTokens: 1, outputTokens: 0 },
    };
  }
  const answers: Record<string, SystemOneResponse["answers"][string] | undefined> =
    {};
  const risk = overrides.risk ?? 0.1;
  answers.risk =
    risk === "invalid"
      ? ({ type: "noul", noul: Number.NaN } as never)
      : { type: "noul", noul: risk };
  const intent = overrides.intent ?? 0.9;
  answers.intent =
    intent === "invalid"
      ? ({ type: "noul", noul: Number.NaN } as never)
      : { type: "noul", noul: intent };
  const verdict = overrides.verdict ?? "approve";
  const confidence = overrides.confidence ?? 0.95;
  answers.verdict =
    verdict === "missing"
      ? undefined
      : confidence === "invalid"
        ? ({
            type: "choice",
            choice: verdict,
            probabilities: {},
            confidence: Number.NaN,
          } as never)
        : {
            type: "choice",
            choice: verdict,
            probabilities: {},
            confidence,
          };
  const fullAnswers = Object.fromEntries(
    Object.entries(answers).filter((pair): pair is [string, NonNullable<typeof pair[1]>] =>
      pair[1] !== undefined
    )
  );
  return {
    model: "jev-latest",
    answers: fullAnswers,
    usage: { inputTokens: 1, outputTokens: 0 },
  };
}

function buildInput(
  overrides: Partial<EvaluatorInput> & {
    responseOverrides?: Parameters<typeof jevResponse>[0];
  } = {}
): EvaluatorInput {
  const { responseOverrides, ...rest } = overrides;
  return {
    response: jevResponse(responseOverrides ?? {}),
    config: { ...DEFAULT_DECISION_ARBITRATION_CONFIG },
    source: "orchestrator",
    forceApproval: false,
    model: "jev-latest",
    durationMs: 100,
    ...rest,
  };
}

describe("evaluateArbitration 阈值裁决", () => {
  it("低风险 + 高意图 + verdict=approve → 自动放行", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.04, intent: 0.9 } })
    );
    expect(result.action).toBe("approve");
  });

  it("risk 恰好等于 autoRiskThreshold（边界内）→ 放行", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.15, intent: 0.6 } })
    );
    expect(result.action).toBe("approve");
  });

  it("risk 超出 autoRiskThreshold（模糊区间）→ escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.150001, intent: 0.9 } })
    );
    expect(result.action).toBe("escalate");
  });

  it("intent 低于门槛 → escalate 转人工", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.05, intent: 0.59 } })
    );
    expect(result.action).toBe("escalate");
  });

  it("risk 越过高危线且 verdict=deny → 直接拒绝", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.9, verdict: "deny" } })
    );
    expect(result.action).toBe("deny");
  });

  it("risk 处于模糊区间且 verdict=deny → 拒绝（模型主动否决）", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.4, verdict: "deny" } })
    );
    expect(result.action).toBe("deny");
  });

  it("verdict=escalate → escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.3, verdict: "escalate" } })
    );
    expect(result.action).toBe("escalate");
  });
});

describe("evaluateArbitration 矛盾即升级", () => {
  it("verdict=approve 但 risk ≥ denyThreshold → escalate（矛盾即升级，施工提示 §10.3）", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.8, verdict: "approve" } })
    );
    expect(result.action).toBe("escalate");
    expect(result.reason).toContain("矛盾");
  });

  it("verdict=deny 但 risk/intent 均处安全区 → escalate", () => {
    const result = evaluateArbitration(
      buildInput({
        responseOverrides: { risk: 0.05, intent: 0.9, verdict: "deny" },
      })
    );
    expect(result.action).toBe("escalate");
    expect(result.reason).toContain("矛盾");
  });

  it("verdict=approve 但 risk 处于模糊区间 → escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0.5, verdict: "approve" } })
    );
    expect(result.action).toBe("escalate");
  });
});

describe("evaluateArbitration confidence 双向门槛", () => {
  it("approve 但 confidence 低于门槛 → escalate", () => {    const result = evaluateArbitration(
      buildInput({
        responseOverrides: { risk: 0.05, confidence: 0.69 },
      })
    );
    expect(result.action).toBe("escalate");
    expect(result.reason).toContain("置信度");
  });

  it("verdict=deny 且 confidence 低于门槛 → escalate（deny 同样受保护）", () => {
    const result = evaluateArbitration(
      buildInput({
        responseOverrides: { risk: 0.9, verdict: "deny", confidence: 0.5 },
      })
    );
    expect(result.action).toBe("escalate");
  });
});

describe("evaluateArbitration fail-closed", () => {
  it("response 为 null → escalate", () => {
    const result = evaluateArbitration(buildInput({ response: null }));
    expect(result.action).toBe("escalate");
  });

  it("answers 缺失 → escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { omitAnswers: true } })
    );
    expect(result.action).toBe("escalate");
  });

  it("risk noul 值非法 → escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: "invalid" } })
    );
    expect(result.action).toBe("escalate");
  });

  it("confidence 非法 → escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { confidence: "invalid" } })
    );
    expect(result.action).toBe("escalate");
  });

  it("verdict 缺失 → escalate", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { verdict: "missing" } })
    );
    expect(result.action).toBe("escalate");
  });

  it.each([
    ["risk 负值", { risk: -1 }],
    ["risk 大于 1", { risk: 1.5 }],
    ["confidence 负值", { confidence: -0.5 }],
    ["confidence 大于 1", { confidence: 1.2 }],
  ])("越界分数不截断修正：%s → escalate", (_name, responseOverrides) => {
    const result = evaluateArbitration(buildInput({ responseOverrides }));
    expect(result.action).toBe("escalate");
  });

  it("risk=0 / confidence=1 等合法边界值仍被接受", () => {
    const result = evaluateArbitration(
      buildInput({ responseOverrides: { risk: 0, confidence: 1 } })
    );
    expect(result.action).toBe("approve");
    expect(result.answers.risk).toBe(0);
    expect(result.answers.confidence).toBe(1);
  });
});

describe("evaluateArbitration 外部来源与强制审批", () => {
  it("外部来源 verdict=approve 默认不放行 → escalate（红线 5）", () => {
    const result = evaluateArbitration(
      buildInput({
        source: "vcp-node",
        responseOverrides: { risk: 0.01, intent: 0.99 },
      })
    );
    expect(result.action).toBe("escalate");
  });

  it("外部来源开启 autoApproveExternalSources 后可放行", () => {
    const result = evaluateArbitration(
      buildInput({
        source: "vcp-node",
        config: {
          ...DEFAULT_DECISION_ARBITRATION_CONFIG,
          autoApproveExternalSources: true,
        },
        responseOverrides: { risk: 0.01, intent: 0.99 },
      })
    );
    expect(result.action).toBe("approve");
  });

  it("aggressive 强制审批：risk ≤ forceApprovalRiskThreshold 才放行", () => {
    const aggressive = {
      ...DEFAULT_DECISION_ARBITRATION_CONFIG,
      mode: "aggressive" as const,
    };
    const pass = evaluateArbitration(
      buildInput({
        config: aggressive,
        forceApproval: true,
        responseOverrides: { risk: 0.04, intent: 0.9 },
      })
    );
    expect(pass.action).toBe("approve");

    const blocked = evaluateArbitration(
      buildInput({
        config: aggressive,
        forceApproval: true,
        responseOverrides: { risk: 0.06, intent: 0.9 },
      })
    );
    expect(blocked.action).toBe("escalate");
  });
});
