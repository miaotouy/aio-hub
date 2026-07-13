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

import type { ActionFlow, FlowStep, SubFlow } from "../types";
import { createSubFlow as createSubFlowFactory } from "./flowFactories";

export type IdFactory = () => string;

export interface CloneFlowOptions {
  flowId: string;
  stepId: IdFactory;
  subFlowId: IdFactory;
  now: string;
  name?: string;
}

export interface ExtractToSubFlowOptions {
  currentSubFlowId: string | null;
  stepIds: string[];
  name: string;
  stepId: IdFactory;
  subFlowId: IdFactory;
}

export function cloneStep(step: FlowStep): FlowStep {
  return JSON.parse(JSON.stringify(step)) as FlowStep;
}

export function clearDeletedStepRefs(
  step: FlowStep,
  removedId: string
): number {
  const c = step.stepConfig;
  let cleared = 0;
  const clearField = (params: object, field: string) => {
    const record = params as Record<string, string>;
    if (record[field] === removedId) {
      record[field] = "";
      cleared++;
    }
  };

  if (c.type === "colorCheck") {
    clearField(c.params, "matchGoto");
    clearField(c.params, "mismatchGoto");
  } else if (c.type === "goto") {
    clearField(c.params, "targetStepId");
  } else if (c.type === "counter") {
    clearField(c.params, "notReachedGotoId");
    clearField(c.params, "reachedGotoId");
  } else if (c.type === "ocr") {
    clearField(c.params, "matchGoto");
    clearField(c.params, "mismatchGoto");
  }
  return cleared;
}

export function clearDeletedStepRefsInFlow(
  flow: ActionFlow,
  removedId: string
): number {
  let cleared = 0;
  flow.steps.forEach((step) => {
    cleared += clearDeletedStepRefs(step, removedId);
  });
  flow.subFlows?.forEach((sub) => {
    sub.steps.forEach((step) => {
      cleared += clearDeletedStepRefs(step, removedId);
    });
  });
  return cleared;
}

export function remapStepJumpRefs(
  steps: FlowStep[],
  remapId: (id: string) => string
) {
  steps.forEach((step) => {
    const c = step.stepConfig;
    if (c.type === "goto") {
      c.params.targetStepId = remapId(c.params.targetStepId);
    } else if (c.type === "colorCheck") {
      c.params.matchGoto = remapId(c.params.matchGoto);
      c.params.mismatchGoto = remapId(c.params.mismatchGoto);
    } else if (c.type === "counter") {
      c.params.notReachedGotoId = remapId(c.params.notReachedGotoId);
      c.params.reachedGotoId = remapId(c.params.reachedGotoId);
    } else if (c.type === "ocr") {
      c.params.matchGoto = remapId(c.params.matchGoto);
      c.params.mismatchGoto = remapId(c.params.mismatchGoto);
    }
  });
}

export function remapCallRefs(
  steps: FlowStep[],
  subFlowIdMap: Map<string, string>
) {
  steps.forEach((step) => {
    if (step.stepConfig.type !== "call") return;
    const oldId = step.stepConfig.params.targetSubFlowId;
    if (oldId && subFlowIdMap.has(oldId)) {
      step.stepConfig.params.targetSubFlowId = subFlowIdMap.get(oldId) || "";
    }
  });
}

export function cloneFlowWithFreshIds(
  source: ActionFlow,
  options: CloneFlowOptions
): ActionFlow {
  const cloned: ActionFlow = JSON.parse(JSON.stringify(source));
  cloned.id = options.flowId;
  cloned.name = options.name ?? source.name;
  cloned.createdAt = options.now;
  cloned.updatedAt = options.now;

  const mainStepIdMap = new Map<string, string>();
  cloned.steps = (cloned.steps ?? []).map((step) => {
    const newId = options.stepId();
    mainStepIdMap.set(step.id, newId);
    return { ...step, id: newId };
  });

  const subFlowIdMap = new Map<string, string>();
  const subStepIdMaps = new Map<string, Map<string, string>>();
  cloned.subFlows = (cloned.subFlows ?? []).map((sub) => {
    const oldSubId = sub.id;
    const newSubId = options.subFlowId();
    subFlowIdMap.set(oldSubId, newSubId);
    const innerStepMap = new Map<string, string>();
    const newSteps = (sub.steps ?? []).map((step) => {
      const newStepId = options.stepId();
      innerStepMap.set(step.id, newStepId);
      return { ...step, id: newStepId };
    });
    subStepIdMaps.set(newSubId, innerStepMap);
    return { ...sub, id: newSubId, steps: newSteps };
  });

  remapStepJumpRefs(cloned.steps, (id) => mainStepIdMap.get(id) || "");
  cloned.subFlows.forEach((sub) => {
    const innerStepMap = subStepIdMaps.get(sub.id);
    remapStepJumpRefs(sub.steps, (id) => innerStepMap?.get(id) || "");
  });

  remapCallRefs(cloned.steps, subFlowIdMap);
  cloned.subFlows.forEach((sub) => remapCallRefs(sub.steps, subFlowIdMap));
  return cloned;
}

export function importSubFlowWithFreshIds(
  imported: SubFlow,
  subFlowId: string,
  stepId: IdFactory
): SubFlow {
  const stepIdMap = new Map<string, string>();
  const newSteps: FlowStep[] = (imported.steps || []).map((step) => {
    const newStepId = stepId();
    stepIdMap.set(step.id, newStepId);
    return { ...cloneStep(step), id: newStepId };
  });
  remapStepJumpRefs(newSteps, (id) => stepIdMap.get(id) || "");
  return {
    ...JSON.parse(JSON.stringify(imported)),
    id: subFlowId,
    steps: newSteps,
  } as SubFlow;
}

export function clearSubFlowCallRefs(
  flow: ActionFlow,
  subFlowId: string
): number {
  let cleared = 0;
  const clearIn = (steps: FlowStep[]) => {
    steps.forEach((step) => {
      if (
        step.stepConfig.type === "call" &&
        step.stepConfig.params.targetSubFlowId === subFlowId
      ) {
        step.stepConfig.params.targetSubFlowId = "";
        cleared++;
      }
    });
  };
  clearIn(flow.steps);
  flow.subFlows?.forEach((sub) => clearIn(sub.steps));
  return cleared;
}

export function extractSelectedToSubFlow(
  flow: ActionFlow,
  options: ExtractToSubFlowOptions
): { subFlow: SubFlow | null; clearedRefs: number } {
  if (options.stepIds.length === 0) return { subFlow: null, clearedRefs: 0 };

  const sourceSubFlow = options.currentSubFlowId
    ? (flow.subFlows?.find((sub) => sub.id === options.currentSubFlowId) ??
      null)
    : null;
  const sourceSteps = sourceSubFlow ? sourceSubFlow.steps : flow.steps;
  const selectedIds = Array.from(new Set(options.stepIds));
  const indices = selectedIds
    .map((id) => sourceSteps.findIndex((step) => step.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (indices.length === 0) return { subFlow: null, clearedRefs: 0 };

  const stepMap = new Map<string, string>();
  const extractedSteps: FlowStep[] = indices.map((index) => {
    const original = sourceSteps[index]!;
    const cloned = cloneStep(original);
    const newId = options.stepId();
    stepMap.set(original.id, newId);
    cloned.id = newId;
    return cloned;
  });

  let clearedInternalRefs = 0;
  remapStepJumpRefs(extractedSteps, (id) => {
    if (!id) return "";
    const mapped = stepMap.get(id);
    if (mapped) return mapped;
    clearedInternalRefs++;
    return "";
  });

  const sub = createSubFlowFactory(options.name);
  sub.id = options.subFlowId();
  sub.steps = extractedSteps;
  if (!Array.isArray(flow.subFlows)) flow.subFlows = [];
  flow.subFlows.push(sub);

  const insertIndex = indices[0]!;
  for (const index of [...indices].reverse()) {
    sourceSteps.splice(index, 1);
  }

  sourceSteps.splice(insertIndex, 0, {
    id: options.stepId(),
    label: `调用 ${sub.name}`,
    enabled: true,
    stepConfig: {
      type: "call",
      params: { targetSubFlowId: sub.id },
    },
  });

  let clearedRefs = 0;
  const allScannable = [
    ...flow.steps,
    ...(flow.subFlows ?? []).flatMap((item) => item.steps),
  ];
  for (const step of allScannable) {
    const c = step.stepConfig;
    const clearIfMoved = (field: string) => {
      const params = c.params as unknown as Record<string, string>;
      const val = params[field];
      if (typeof val === "string" && stepMap.has(val)) {
        params[field] = "";
        clearedRefs++;
      }
    };
    if (c.type === "goto") {
      clearIfMoved("targetStepId");
    } else if (c.type === "colorCheck") {
      clearIfMoved("matchGoto");
      clearIfMoved("mismatchGoto");
    } else if (c.type === "counter") {
      clearIfMoved("notReachedGotoId");
      clearIfMoved("reachedGotoId");
    } else if (c.type === "ocr") {
      clearIfMoved("matchGoto");
      clearIfMoved("mismatchGoto");
    }
  }

  return { subFlow: sub, clearedRefs: clearedRefs + clearedInternalRefs };
}
