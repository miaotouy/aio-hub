import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWindowAutomatorStore } from "../windowAutomator.store";
import { executeStep } from "../../composables/stepExecutors";
import { createStep } from "../flowFactories";
import type { ActionFlow, FlowStep, SubFlow } from "../../types";

vi.mock("@utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: () => Promise.resolve(null),
    handle: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeStep(label: string, type: "delay" = "delay"): FlowStep {
  return { ...createStep(type), label };
}

function makeFlow(overrides: Partial<ActionFlow> = {}): ActionFlow {
  const now = new Date().toISOString();
  return {
    id: "flow-1",
    name: "test",
    description: "",
    targetWindow: null,
    steps: [],
    subFlows: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("window-automator subflow store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("creates and lists subFlows on the current flow", () => {
    const store = useWindowAutomatorStore();
    store.addFlow(makeFlow());
    store.enterFlow("flow-1");
    expect(store.currentFlow?.subFlows).toEqual([]);

    const sub = store.addSubFlow("打坐回血");
    expect(sub).not.toBeNull();
    expect(sub?.name).toBe("打坐回血");
    expect(store.currentFlow?.subFlows).toHaveLength(1);
  });

  it("renames a subFlow and updates flow timestamp", () => {
    const store = useWindowAutomatorStore();
    store.addFlow(makeFlow());
    store.enterFlow("flow-1");
    const sub = store.addSubFlow("old name")!;
    const flow = store.currentFlow;
    expect(flow).not.toBeNull();
    const before = flow!.updatedAt;
    // 等待 5ms 让 ISO 时间戳变化
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 5));
    store.renameSubFlow(sub.id, "新名称");
    vi.useRealTimers();
    const updated = store.currentFlow;
    expect(updated).not.toBeNull();
    const after = updated!.updatedAt;
    expect(updated!.subFlows![0]!.name).toBe("新名称");
    expect(after >= before).toBe(true);
  });

  it("clears all call references when a subFlow is deleted", () => {
    const store = useWindowAutomatorStore();
    store.addFlow(makeFlow());
    store.enterFlow("flow-1");
    const subA = store.addSubFlow("A")!;
    const subB = store.addSubFlow("B")!;
    // 在主流程和 subB 内部都加一个 call 步骤引用 A
    const callA1 = store.addStep("flow-1", "call")!;
    store.updateStep("flow-1", callA1.id, {
      stepConfig: { type: "call", params: { targetSubFlowId: subA.id } },
    });
    const callA2 = store.addSubFlowStep(subB.id, "call")!;
    store.updateSubFlowStep(subB.id, callA2.id, {
      stepConfig: { type: "call", params: { targetSubFlowId: subA.id } },
    });
    expect(
      (
        store.currentFlow!.steps[0]!.stepConfig as Extract<
          FlowStep["stepConfig"],
          { type: "call" }
        >
      ).params.targetSubFlowId
    ).toBe(subA.id);
    const cleared = store.deleteSubFlow(subA.id);
    expect(cleared).toBe(2);
    expect(store.currentFlow?.subFlows).toHaveLength(1);
    expect(store.currentFlow?.subFlows?.[0]?.id).toBe(subB.id);
    expect(
      (
        store.currentFlow!.steps[0]!.stepConfig as Extract<
          FlowStep["stepConfig"],
          { type: "call" }
        >
      ).params.targetSubFlowId
    ).toBe("");
    expect(
      (
        store.currentFlow!.subFlows![0]!.steps[0]!.stepConfig as Extract<
          FlowStep["stepConfig"],
          { type: "call" }
        >
      ).params.targetSubFlowId
    ).toBe("");
  });

  it("editing context switching: enterSubFlow / exitSubFlow", () => {
    const store = useWindowAutomatorStore();
    store.addFlow(makeFlow());
    store.enterFlow("flow-1");
    const sub = store.addSubFlow("function-1")!;
    expect(store.currentEditingSubFlowId).toBeNull();
    expect(store.editingSteps).toEqual(store.currentFlow!.steps);
    store.enterSubFlow(sub.id);
    expect(store.currentEditingSubFlowId).toBe(sub.id);
    expect(store.editingSteps).toEqual(sub.steps);
    store.exitSubFlow();
    expect(store.currentEditingSubFlowId).toBeNull();
    expect(store.editingSteps).toEqual(store.currentFlow!.steps);
  });

  it("subFlow step CRUD operates on the subFlow's own step list", () => {
    const store = useWindowAutomatorStore();
    store.addFlow(makeFlow());
    store.enterFlow("flow-1");
    const sub = store.addSubFlow("A")!;
    const s1 = store.addSubFlowStep(sub.id, "delay")!;
    const s2 = store.addSubFlowStep(sub.id, "log")!;
    expect(sub.steps).toHaveLength(2);
    expect(sub.steps[0]!.id).toBe(s1.id);
    expect(sub.steps[1]!.id).toBe(s2.id);
    store.updateSubFlowStep(sub.id, s1.id, { label: "等 1s" });
    expect(sub.steps[0]!.label).toBe("等 1s");
    store.deleteSubFlowStep(sub.id, s2.id);
    expect(sub.steps).toHaveLength(1);
  });

  it("duplicateFlow remaps subFlow IDs and call step references", () => {
    const store = useWindowAutomatorStore();
    const sub: SubFlow = {
      id: "sub-A",
      name: "A",
      steps: [
        makeStep("delay-100"),
        {
          ...createStep("call"),
          label: "call A again",
          stepConfig: { type: "call", params: { targetSubFlowId: "sub-A" } },
        },
      ],
    };
    const mainCall: FlowStep = {
      ...createStep("call"),
      label: "main call A",
      stepConfig: { type: "call", params: { targetSubFlowId: "sub-A" } },
    };
    store.addFlow(
      makeFlow({
        id: "flow-A",
        steps: [makeStep("main delay"), mainCall],
        subFlows: [sub],
      })
    );
    const cloned = store.duplicateFlow("flow-A")!;
    expect(cloned.id).not.toBe("flow-A");
    expect(cloned.subFlows).toHaveLength(1);
    const newSub = cloned.subFlows![0]!;
    expect(newSub.id).not.toBe("sub-A");
    // 内部 call 步骤的 targetSubFlowId 也要跟着重映射
    const innerCall = newSub.steps[1]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "call" }
    >;
    expect(innerCall.params.targetSubFlowId).toBe(newSub.id);
    // 主流程 call 步骤也要重映射
    const mainCallCloned = cloned.steps[1]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "call" }
    >;
    expect(mainCallCloned.params.targetSubFlowId).toBe(newSub.id);
  });

  it("duplicateFlow remaps jump targets inside main flow and subFlows", () => {
    const store = useWindowAutomatorStore();
    const mainTarget = makeStep("main target");
    const mainGoto: FlowStep = {
      ...createStep("goto"),
      label: "jump main",
      stepConfig: { type: "goto", params: { targetStepId: mainTarget.id } },
    };
    const subTarget = makeStep("sub target");
    const subGoto: FlowStep = {
      ...createStep("goto"),
      label: "jump sub",
      stepConfig: { type: "goto", params: { targetStepId: subTarget.id } },
    };
    store.addFlow(
      makeFlow({
        id: "flow-jump",
        steps: [mainGoto, mainTarget],
        subFlows: [{ id: "sub-jump", name: "S", steps: [subGoto, subTarget] }],
      })
    );

    const cloned = store.duplicateFlow("flow-jump")!;
    const clonedMainGoto = cloned.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "goto" }
    >;
    expect(clonedMainGoto.params.targetStepId).toBe(cloned.steps[1]!.id);
    expect(clonedMainGoto.params.targetStepId).not.toBe(mainTarget.id);

    const clonedSub = cloned.subFlows![0]!;
    const clonedSubGoto = clonedSub.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "goto" }
    >;
    expect(clonedSubGoto.params.targetStepId).toBe(clonedSub.steps[1]!.id);
    expect(clonedSubGoto.params.targetStepId).not.toBe(subTarget.id);
  });

  it("extractSelectedToSubFlow clears jumps that leave the extracted selection", () => {
    const store = useWindowAutomatorStore();
    const outside = makeStep("outside");
    const selectedGoto: FlowStep = {
      ...createStep("goto"),
      label: "selected jump",
      stepConfig: { type: "goto", params: { targetStepId: outside.id } },
    };
    store.addFlow(
      makeFlow({
        steps: [selectedGoto, outside],
      })
    );
    store.enterFlow("flow-1");

    const result = store.extractSelectedToSubFlow([selectedGoto.id], "提取");
    expect(result.subFlow).not.toBeNull();
    expect(result.clearedRefs).toBe(1);
    const extractedGoto = result.subFlow!.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "goto" }
    >;
    expect(extractedGoto.params.targetStepId).toBe("");
  });

  it("importSubFlow always creates a new subFlow id and remaps internal jump ids", () => {
    const store = useWindowAutomatorStore();
    store.addFlow(makeFlow());
    store.enterFlow("flow-1");
    const target = makeStep("target");
    const jump: FlowStep = {
      ...createStep("goto"),
      label: "jump",
      stepConfig: { type: "goto", params: { targetStepId: target.id } },
    };

    const newId = store.importSubFlow({
      id: "imported-sub",
      name: "Imported",
      steps: [jump, target],
    })!;

    expect(newId).not.toBe("imported-sub");
    const imported = store.currentFlow!.subFlows![0]!;
    expect(imported.id).toBe(newId);
    const importedJump = imported.steps[0]!.stepConfig as Extract<
      FlowStep["stepConfig"],
      { type: "goto" }
    >;
    expect(importedJump.params.targetStepId).toBe(imported.steps[1]!.id);
    expect(importedJump.params.targetStepId).not.toBe(target.id);
  });
});

describe("stepExecutors: call step", () => {
  it("returns __CALL__ for a call step with valid target", async () => {
    const logs: string[] = [];
    const ctx = {
      boundHwnd: null,
      appendLog: (_l: string, _i: number | null, m: string) => {
        logs.push(m);
      },
      getClientSize: () => Promise.resolve(null),
      variables: {},
      localVariables: {},
      scope: { local: {}, global: {} },
      setVariable: vi.fn(),
      counters: {},
    };
    const step: FlowStep = {
      ...createStep("call"),
      stepConfig: { type: "call", params: { targetSubFlowId: "sub-A" } },
    };
    const result = await executeStep(ctx, step, 0);
    expect(result).toBe("__CALL__");
  });

  it("returns null and logs a warning for a call step without target", async () => {
    const logs: string[] = [];
    const ctx = {
      boundHwnd: null,
      appendLog: (l: string, _i: number | null, m: string) => {
        if (l === "warn") logs.push(m);
      },
      getClientSize: () => Promise.resolve(null),
      variables: {},
      localVariables: {},
      scope: { local: {}, global: {} },
      setVariable: vi.fn(),
      counters: {},
    };
    const step: FlowStep = {
      ...createStep("call"),
      stepConfig: { type: "call", params: { targetSubFlowId: "" } },
    };
    const result = await executeStep(ctx, step, 0);
    expect(result).toBeNull();
    expect(logs.some((m) => m.includes("未指定目标函数"))).toBe(true);
  });
});
