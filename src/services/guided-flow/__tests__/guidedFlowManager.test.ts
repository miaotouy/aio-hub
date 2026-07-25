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

import { describe, expect, it } from "vitest";
import type { Component } from "vue";
import { GuidedFlowManager } from "../guidedFlowManager";
import { GuidedFlowRegistry } from "../guidedFlowRegistry";
import type { GuidedFlowPersistence } from "../guidedFlowPersistence";
import type { GuidedFlowDefinition, GuidedFlowState } from "../types";

class MemoryPersistence implements GuidedFlowPersistence {
  constructor(private states: Record<string, GuidedFlowState> = {}) {}

  async load() {
    return structuredClone(this.states);
  }

  async save(states: Record<string, GuidedFlowState>) {
    this.states = structuredClone(states);
  }

  snapshot() {
    return structuredClone(this.states);
  }
}

const TestStep = {} as Component;

function createFlow(
  id: string,
  priority = 0
): GuidedFlowDefinition<Record<string, unknown>> {
  return {
    id,
    version: "1.0.0",
    title: id,
    trigger: "manual",
    priority,
    resumable: true,
    dismissible: true,
    createContext: () => ({ showOptional: true }),
    steps: [
      { id: "start", title: "开始", component: TestStep },
      {
        id: "optional",
        title: "可选",
        component: TestStep,
        when: (context) => context.showOptional === true,
      },
      { id: "finish", title: "完成", component: TestStep },
    ],
  };
}

describe("GuidedFlowManager", () => {
  it("restores pending flows in priority order and keeps only one active flow", async () => {
    const registry = new GuidedFlowRegistry();
    registry.register(createFlow("low", 1));
    registry.register(createFlow("high", 10));
    const persistence = new MemoryPersistence({
      low: {
        flowId: "low",
        flowVersion: "1.0.0",
        status: "deferred",
        currentStepId: "start",
        completedStepIds: [],
        context: { showOptional: true },
      },
      high: {
        flowId: "high",
        flowVersion: "1.0.0",
        status: "pending",
        currentStepId: "start",
        completedStepIds: [],
        context: { showOptional: true },
      },
    });
    const manager = new GuidedFlowManager(registry, persistence);

    await manager.initialize();

    expect(manager.getSnapshot().activeFlow?.definition.id).toBe("high");
    expect(manager.getSnapshot().queuedFlowIds).toEqual(["low"]);
  });

  it("recalculates conditional steps after a step action and persists completion", async () => {
    const registry = new GuidedFlowRegistry();
    const flow = createFlow("conditional");
    flow.steps[0].onNext = (context) => {
      context.showOptional = false;
    };
    registry.register(flow);
    const persistence = new MemoryPersistence();
    const manager = new GuidedFlowManager(registry, persistence);

    await manager.trigger("conditional");
    await manager.next();

    expect(manager.getSnapshot().activeFlow?.state.currentStepId).toBe(
      "finish"
    );
    await manager.next();

    expect(manager.getSnapshot().activeFlow).toBeNull();
    expect(persistence.snapshot().conditional).toMatchObject({
      status: "completed",
      currentStepId: "finish",
      completedStepIds: ["start", "finish"],
    });
  });

  it("defers a resumable flow and restores its current step", async () => {
    const registry = new GuidedFlowRegistry();
    registry.register(createFlow("resume"));
    const persistence = new MemoryPersistence();
    const manager = new GuidedFlowManager(registry, persistence);

    await manager.trigger("resume");
    await manager.next();
    await manager.requestClose();

    expect(persistence.snapshot().resume).toMatchObject({
      status: "deferred",
      currentStepId: "optional",
    });

    const restored = new GuidedFlowManager(registry, persistence);
    await restored.initialize();
    expect(restored.getSnapshot().activeFlow?.state.currentStepId).toBe(
      "optional"
    );
  });

  it("recreates state when a manual reopen uses a newer flow version", async () => {
    const registry = new GuidedFlowRegistry();
    const flow = createFlow("versioned");
    flow.version = "2.0.0";
    registry.register(flow);
    const persistence = new MemoryPersistence({
      versioned: {
        flowId: "versioned",
        flowVersion: "1.0.0",
        status: "in-progress",
        currentStepId: "optional",
        completedStepIds: ["start"],
        context: { showOptional: false, stale: true },
      },
    });
    const manager = new GuidedFlowManager(registry, persistence);

    await manager.open("versioned");

    expect(manager.getSnapshot().activeFlow?.state).toMatchObject({
      flowVersion: "2.0.0",
      currentStepId: "start",
      completedStepIds: [],
      context: { showOptional: true },
    });
  });
});
