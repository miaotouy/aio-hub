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

  it("advances past a current step that becomes hidden after its action", async () => {
    const registry = new GuidedFlowRegistry();
    const flow = createFlow("current-step-hidden");
    flow.steps.splice(1, 1, {
      id: "cleanup",
      title: "清理",
      component: TestStep,
      when: (context) => context.showOptional === true,
      onNext: (context) => {
        context.showOptional = false;
      },
    });
    registry.register(flow);
    const manager = new GuidedFlowManager(registry, new MemoryPersistence());

    await manager.trigger("current-step-hidden");
    await manager.next();
    expect(manager.getSnapshot().activeFlow?.state.currentStepId).toBe("cleanup");

    await manager.next();
    expect(manager.getSnapshot().activeFlow?.state.currentStepId).toBe("finish");
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

  it("opens a replay without overwriting the persisted terminal state", async () => {
    const registry = new GuidedFlowRegistry();
    registry.register(createFlow("replay"));
    const persistence = new MemoryPersistence({
      replay: {
        flowId: "replay",
        flowVersion: "1.0.0",
        status: "completed",
        currentStepId: "finish",
        completedStepIds: ["start", "optional", "finish"],
        context: { showOptional: true, preserved: true },
      },
    });
    const manager = new GuidedFlowManager(registry, persistence);

    await manager.open("replay", {
      mode: "replay",
      context: { showOptional: false, replayed: true },
    });

    expect(manager.getSnapshot().activeFlow).toMatchObject({
      mode: "replay",
      state: {
        status: "in-progress",
        currentStepId: "start",
        context: { showOptional: false, replayed: true },
      },
    });

    await manager.requestClose();

    expect(manager.getSnapshot().activeFlow).toBeNull();
    expect(persistence.snapshot().replay).toMatchObject({
      status: "completed",
      currentStepId: "finish",
      context: { showOptional: true, preserved: true },
    });
  });

  it("emits persistent terminal events for completion and explicit skip", async () => {
    const registry = new GuidedFlowRegistry();
    const completedEvents: string[] = [];
    const skippedEvents: string[] = [];
    const completedFlow = createFlow("terminal-completed");
    completedFlow.onCompleted = (event) => {
      completedEvents.push(`${event.mode}:${event.status}`);
    };
    const skippedFlow = createFlow("terminal-skipped");
    skippedFlow.skippable = true;
    skippedFlow.onSkipped = (event) => {
      skippedEvents.push(`${event.mode}:${event.status}`);
    };
    registry.register(completedFlow);
    registry.register(skippedFlow);
    const persistence = new MemoryPersistence();
    const manager = new GuidedFlowManager(registry, persistence);

    await manager.trigger("terminal-completed");
    await manager.next();
    await manager.next();
    await manager.next();

    await manager.trigger("terminal-skipped");
    expect(await manager.skip()).toBe(true);

    expect(completedEvents).toEqual(["persistent:completed"]);
    expect(skippedEvents).toEqual(["persistent:skipped"]);
    expect(persistence.snapshot()["terminal-skipped"]).toMatchObject({
      status: "skipped",
    });
  });

  it("deduplicates concurrent initialization calls", async () => {
    const registry = new GuidedFlowRegistry();
    let loadCount = 0;
    let releaseLoad: (() => void) | undefined;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const persistence: GuidedFlowPersistence = {
      async load() {
        loadCount += 1;
        await loadGate;
        return {};
      },
      async save() {},
    };
    const manager = new GuidedFlowManager(registry, persistence);

    const first = manager.initialize();
    const second = manager.initialize();
    releaseLoad?.();
    await Promise.all([first, second]);

    expect(loadCount).toBe(1);
  });
});

describe("GuidedFlowRegistry", () => {
  it("replaces an existing definition after validating the new version", () => {
    const registry = new GuidedFlowRegistry();
    registry.register(createFlow("replaceable"));
    const replacement = createFlow("replaceable");
    replacement.version = "2.0.0";

    registry.replace(replacement);

    expect(registry.get("replaceable")?.version).toBe("2.0.0");
  });

  it("keeps the previous definition if replacement validation fails", () => {
    const registry = new GuidedFlowRegistry();
    registry.register(createFlow("replaceable"));
    const invalid = createFlow("replaceable");
    invalid.steps.push({
      id: "start",
      title: "duplicate",
      component: TestStep,
    });

    expect(() => registry.replace(invalid)).toThrow(/重复/);
    expect(registry.get("replaceable")?.version).toBe("1.0.0");
  });
});
