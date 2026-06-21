import { describe, expect, it, vi } from "vitest";
import { parseActionFlowText } from "../useFlowPersistence";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: vi.fn(),
  }),
}));

vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn(),
}));

describe("parseActionFlowText", () => {
  const validStep = {
    id: "step-1",
    label: "Wait",
    enabled: true,
    stepConfig: {
      type: "delay",
      params: { duration: 100, randomRange: 0 },
    },
  };

  it("normalizes old flow data without subFlows", () => {
    const parsed = parseActionFlowText(
      JSON.stringify({
        id: "flow-1",
        name: "Old Flow",
        steps: [validStep],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.subFlows).toEqual([]);
    expect(parsed?.description).toBe("");
    expect(parsed?.targetWindow).toBeNull();
  });

  it("accepts valid subFlows", () => {
    const parsed = parseActionFlowText(
      JSON.stringify({
        id: "flow-1",
        name: "Flow",
        steps: [validStep],
        subFlows: [{ id: "sub-1", name: "Sub", steps: [validStep] }],
      })
    );

    expect(parsed?.subFlows).toHaveLength(1);
    expect(parsed?.subFlows?.[0]?.steps).toHaveLength(1);
  });

  it("rejects invalid json and missing required fields", () => {
    expect(parseActionFlowText("{")).toBeNull();
    expect(parseActionFlowText(JSON.stringify({ id: "flow-1" }))).toBeNull();
    expect(
      parseActionFlowText(JSON.stringify({ id: "flow-1", name: "Flow" }))
    ).toBeNull();
  });

  it("rejects invalid step structures", () => {
    expect(
      parseActionFlowText(
        JSON.stringify({
          id: "flow-1",
          name: "Flow",
          steps: [{ ...validStep, stepConfig: { type: "unknown", params: {} } }],
        })
      )
    ).toBeNull();

    expect(
      parseActionFlowText(
        JSON.stringify({
          id: "flow-1",
          name: "Flow",
          steps: [{ ...validStep, stepConfig: { type: "delay" } }],
        })
      )
    ).toBeNull();
  });
});
