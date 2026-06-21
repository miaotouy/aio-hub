import { describe, expect, it } from "vitest";
import { createStep } from "../flowFactories";
import {
  clearDeletedStepRefsInFlow,
  cloneFlowWithFreshIds,
  extractSelectedToSubFlow,
} from "../flowTransforms";
import type { ActionFlow, FlowStep, StepType } from "../../types";

function makeFlow(steps: FlowStep[], subFlows: ActionFlow["subFlows"] = []) {
  return {
    id: "flow-old",
    name: "Flow",
    description: "",
    targetWindow: null,
    steps,
    subFlows,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies ActionFlow;
}

function step(id: string, type: StepType = "delay"): FlowStep {
  return { ...createStep(type), id, label: id };
}

function nextIds(ids: string[]) {
  let index = 0;
  return () => {
    const id = ids[index];
    index++;
    if (!id) throw new Error("ID queue exhausted");
    return id;
  };
}

describe("flowTransforms", () => {
  it("cloneFlowWithFreshIds remaps main/subFlow jumps and call references", () => {
    const target = step("main-target");
    const mainGoto: FlowStep = {
      ...step("main-goto", "goto"),
      stepConfig: { type: "goto", params: { targetStepId: target.id } },
    };
    const mainCall: FlowStep = {
      ...step("main-call", "call"),
      stepConfig: { type: "call", params: { targetSubFlowId: "sub-old" } },
    };
    const subTarget = step("sub-target");
    const subOcr: FlowStep = {
      ...step("sub-ocr", "ocr"),
      stepConfig: {
        type: "ocr",
        params: {
          rect: { x: 0, y: 0, width: 10, height: 10, mode: "pixel" },
          engineType: "tesseract",
          engineConfig: {
            type: "tesseract",
            name: "default",
            language: "eng",
          },
          keyword: "ok",
          useRegex: false,
          matchGoto: subTarget.id,
          mismatchGoto: subTarget.id,
        },
      },
    };
    const subCall: FlowStep = {
      ...step("sub-call", "call"),
      stepConfig: { type: "call", params: { targetSubFlowId: "sub-old" } },
    };
    const source = makeFlow([mainGoto, target, mainCall], [
      { id: "sub-old", name: "Sub", steps: [subOcr, subTarget, subCall] },
    ]);

    const cloned = cloneFlowWithFreshIds(source, {
      flowId: "flow-new",
      stepId: nextIds([
        "main-goto-new",
        "main-target-new",
        "main-call-new",
        "sub-ocr-new",
        "sub-target-new",
        "sub-call-new",
      ]),
      subFlowId: nextIds(["sub-new"]),
      now: "2026-06-21T00:00:00.000Z",
      name: "Flow copy",
    });

    expect(cloned.id).toBe("flow-new");
    expect(cloned.name).toBe("Flow copy");
    expect(cloned.subFlows?.[0]?.id).toBe("sub-new");
    expect(
      (cloned.steps[0]!.stepConfig as Extract<FlowStep["stepConfig"], { type: "goto" }>).params
        .targetStepId
    ).toBe("main-target-new");
    expect(
      (cloned.steps[2]!.stepConfig as Extract<FlowStep["stepConfig"], { type: "call" }>).params
        .targetSubFlowId
    ).toBe("sub-new");
    const clonedSub = cloned.subFlows![0]!;
    const clonedOcr = clonedSub.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "ocr" }
    >;
    expect(clonedOcr.params.matchGoto).toBe("sub-target-new");
    expect(clonedOcr.params.mismatchGoto).toBe("sub-target-new");
    expect(
      (clonedSub.steps[2]!.stepConfig as Extract<FlowStep["stepConfig"], { type: "call" }>).params
        .targetSubFlowId
    ).toBe("sub-new");
  });

  it("clearDeletedStepRefsInFlow clears step jumps but leaves call targets alone", () => {
    const removedId = "removed-step";
    const gotoStep: FlowStep = {
      ...step("goto", "goto"),
      stepConfig: { type: "goto", params: { targetStepId: removedId } },
    };
    const callStep: FlowStep = {
      ...step("call", "call"),
      stepConfig: { type: "call", params: { targetSubFlowId: removedId } },
    };
    const flow = makeFlow([gotoStep, callStep]);

    const cleared = clearDeletedStepRefsInFlow(flow, removedId);

    expect(cleared).toBe(1);
    expect(
      (flow.steps[0]!.stepConfig as Extract<FlowStep["stepConfig"], { type: "goto" }>).params
        .targetStepId
    ).toBe("");
    expect(
      (flow.steps[1]!.stepConfig as Extract<FlowStep["stepConfig"], { type: "call" }>).params
        .targetSubFlowId
    ).toBe(removedId);
  });

  it("extractSelectedToSubFlow preserves internal jumps and inserts a call step", () => {
    const target = step("target");
    const jump: FlowStep = {
      ...step("jump", "goto"),
      stepConfig: { type: "goto", params: { targetStepId: target.id } },
    };
    const after = step("after");
    const flow = makeFlow([jump, target, after]);

    const result = extractSelectedToSubFlow(flow, {
      currentSubFlowId: null,
      stepIds: [jump.id, target.id],
      name: "Extracted",
      stepId: nextIds(["jump-new", "target-new", "call-new"]),
      subFlowId: nextIds(["sub-new"]),
    });

    expect(result.clearedRefs).toBe(0);
    expect(result.subFlow?.id).toBe("sub-new");
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps[0]!.stepConfig.type).toBe("call");
    expect(flow.steps[1]!.id).toBe(after.id);
    const extractedGoto = result.subFlow!.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "goto" }
    >;
    expect(extractedGoto.params.targetStepId).toBe("target-new");
  });

  it("extractSelectedToSubFlow clears jumps that leave the extracted selection", () => {
    const outside = step("outside");
    const jump: FlowStep = {
      ...step("jump", "goto"),
      stepConfig: { type: "goto", params: { targetStepId: outside.id } },
    };
    const flow = makeFlow([jump, outside]);

    const result = extractSelectedToSubFlow(flow, {
      currentSubFlowId: null,
      stepIds: [jump.id],
      name: "Extracted",
      stepId: nextIds(["jump-new", "call-new"]),
      subFlowId: nextIds(["sub-new"]),
    });

    expect(result.clearedRefs).toBe(1);
    const extractedGoto = result.subFlow!.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "goto" }
    >;
    expect(extractedGoto.params.targetStepId).toBe("");
  });
});
