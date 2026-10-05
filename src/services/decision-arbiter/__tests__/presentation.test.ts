import { describe, expect, it } from "vitest";

import { describeArbitration } from "../presentation";
import type { ArbiterAuditInfo } from "../types";

function jevInfo(
  overrides: Partial<NonNullable<ArbiterAuditInfo["arbiter"]>> = {}
): ArbiterAuditInfo {
  return {
    origin: "jev",
    arbiter: {
      action: "approve",
      model: "jev-latest",
      durationMs: 165,
      risk: 0.04,
      intent: 0.92,
      verdict: "approve",
      confidence: 0.95,
      reason: "Jev 自动放行",
      degraded: false,
      ...overrides,
    },
  };
}

describe("describeArbitration 展示判定契约", () => {
  it("无审计记录时返回 null", () => {
    expect(describeArbitration(undefined)).toBeNull();
    expect(describeArbitration(null)).toBeNull();
  });

  it("timeout / cancelled 来源不产生放行徽标", () => {
    expect(describeArbitration({ origin: "timeout" })).toBeNull();
    expect(describeArbitration({ origin: "cancelled" })).toBeNull();
  });

  it("人工确认映射为 manual/approve", () => {
    const p = describeArbitration({ origin: "manual" });
    expect(p).toMatchObject({ kind: "manual", action: "approve" });
  });

  it("JEV approve 映射为 approve，并带百分比与模型信息", () => {
    const p = describeArbitration(jevInfo());
    expect(p).toMatchObject({
      kind: "jev",
      action: "approve",
      riskPercent: 4,
      intentPercent: 92,
      model: "jev-latest",
      durationMs: 165,
      degraded: false,
    });
  });

  it("JEV deny 映射为 deny", () => {
    const p = describeArbitration(
      jevInfo({ action: "deny", reason: "Jev 风险拦截" })
    );
    expect(p?.action).toBe("deny");
  });

  it("JEV escalate 必须保持 escalate，不得被解释成 approve", () => {
    const p = describeArbitration(
      jevInfo({ action: "escalate", reason: "Jev 建议人工确认" })
    );
    expect(p?.kind).toBe("jev");
    expect(p?.action).toBe("escalate");
    expect(p?.degraded).toBe(false);
  });

  it("渠道降级 escalate 标记 degraded", () => {
    const p = describeArbitration(
      jevInfo({ action: "escalate", degraded: true })
    );
    expect(p).toMatchObject({ action: "escalate", degraded: true });
  });

  it("risk / intent 缺失时百分比为 null（不臆造 0）", () => {
    const p = describeArbitration(jevInfo({ risk: null, intent: null }));
    expect(p?.riskPercent).toBeNull();
    expect(p?.intentPercent).toBeNull();
  });
});
