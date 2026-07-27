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

import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import {
  guidedFlowPersistence,
  type GuidedFlowPersistence,
} from "./guidedFlowPersistence";
import {
  guidedFlowRegistry,
  type GuidedFlowRegistry,
} from "./guidedFlowRegistry";
import type {
  GuidedFlowDefinition,
  GuidedFlowOpenOptions,
  GuidedFlowRuntime,
  GuidedFlowRuntimeMode,
  GuidedFlowSnapshot,
  GuidedFlowState,
  GuidedFlowStep,
  GuidedFlowStepAction,
  GuidedFlowTerminalStatus,
} from "./types";

const logger = createModuleLogger("services/guided-flow/manager");
const errorHandler = createModuleErrorHandler("services/guided-flow/manager");

type SnapshotListener = (snapshot: GuidedFlowSnapshot) => void;

function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function now(): string {
  return new Date().toISOString();
}

export class GuidedFlowManager {
  private states: Record<string, GuidedFlowState> = {};
  private queue: string[] = [];
  private activeFlowId: string | null = null;
  private activeMode: GuidedFlowRuntimeMode = "persistent";
  private replayState: GuidedFlowState | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private busy = false;
  private readonly listeners = new Set<SnapshotListener>();

  constructor(
    private readonly registry: GuidedFlowRegistry = guidedFlowRegistry,
    private readonly persistence: GuidedFlowPersistence = guidedFlowPersistence
  ) {}

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeInternal().finally(() => {
        this.initializationPromise = null;
      });
    }
    await this.initializationPromise;
  }

  private async initializeInternal(): Promise<void> {
    try {
      this.states = await this.persistence.load();
      this.initialized = true;
      this.restoreQueue();
      await this.activateNext();
      logger.info("Guided Flow 状态已恢复", {
        persistedStateCount: Object.keys(this.states).length,
        queuedFlowCount: this.queue.length,
      });
    } catch (error) {
      errorHandler.error(error, "恢复引导流程状态失败", { showToUser: false });
      this.states = {};
      this.initialized = true;
    } finally {
      this.emit();
    }
  }

  async trigger(flowId: string): Promise<void> {
    await this.initialize();
    await this.run("触发引导流程", async () => {
      const definition = this.requireDefinition(flowId);
      const state = this.states[flowId];

      if (
        state &&
        state.flowVersion === definition.version &&
        (state.status === "completed" || state.status === "skipped")
      ) {
        return;
      }

      if (
        state &&
        state.flowVersion === definition.version &&
        definition.resumable
      ) {
        this.enqueue(flowId);
      } else {
        this.states[flowId] = await this.createInitialState(definition);
        this.enqueue(flowId);
      }

      await this.persist();
      await this.activateNext();
    });
  }

  async open(
    flowId: string,
    options: GuidedFlowOpenOptions = {}
  ): Promise<void> {
    await this.initialize();
    await this.run("打开引导流程", async () => {
      const definition = this.requireDefinition(flowId);
      const mode = options.mode ?? (options.restart ? "restart" : "resume");

      if (mode === "replay") {
        if (this.activeFlowId) {
          throw new Error("当前已有正在展示的 Guided Flow，暂时无法打开回放。");
        }

        const state = await this.createInitialState(
          definition,
          options.context
        );
        const steps = this.getVisibleSteps(definition, state);
        state.status = "in-progress";
        state.currentStepId = steps[0]?.id;
        state.startedAt = now();
        state.updatedAt = now();
        this.activeFlowId = flowId;
        this.activeMode = "replay";
        this.replayState = state;
        await this.enterStep(
          definition,
          state,
          this.requireCurrentStep(this.getRuntime(flowId)!)
        );
        return;
      }

      const existing = this.states[flowId];
      const shouldRestart =
        mode === "restart" ||
        !definition.resumable ||
        existing?.flowVersion !== definition.version;

      if (!existing || shouldRestart) {
        this.states[flowId] = await this.createInitialState(
          definition,
          options.context
        );
      } else {
        const state = existing;
        const steps = this.getVisibleSteps(definition, state);
        state.status = "in-progress";
        state.currentStepId ??= steps[steps.length - 1]?.id;
        state.updatedAt = now();
        state.lastError = undefined;
      }

      this.enqueue(flowId);
      await this.persist();
      await this.activateNext();
    });
  }

  async next(): Promise<void> {
    await this.run("进入下一引导步骤", async () => {
      const runtime = this.requireActiveFlow();
      const { definition, state } = runtime;
      const currentStep = this.requireCurrentStep(runtime);
      const context = this.getContext(state);

      if (currentStep.validate && !(await currentStep.validate(context))) {
        state.lastError = "请先完成当前步骤的必填内容。";
        state.updatedAt = now();
        await this.persistActiveState();
        return;
      }

      await currentStep.onNext?.(context);
      this.markStepCompleted(state, currentStep.id);
      state.lastError = undefined;
      state.updatedAt = now();

      const currentDefinitionIndex = definition.steps.findIndex(
        (step) => step.id === currentStep.id
      );
      const nextStep = definition.steps
        .slice(currentDefinitionIndex + 1)
        .find((step) => step.when?.(context) ?? true);
      if (!nextStep) {
        await this.completeActiveFlow();
        return;
      }

      state.currentStepId = nextStep.id;
      this.emit();
      await this.enterStep(definition, state, nextStep);
      await this.persistActiveState();
    });
  }

  async back(): Promise<void> {
    await this.run("返回上一引导步骤", async () => {
      const runtime = this.requireActiveFlow();
      const currentStep = this.requireCurrentStep(runtime);
      const visibleSteps = runtime.steps;
      const currentIndex = visibleSteps.findIndex(
        (step) => step.id === currentStep.id
      );
      if (currentIndex <= 0) return;

      const context = this.getContext(runtime.state);
      await currentStep.onBack?.(context);
      const previousStep = visibleSteps[currentIndex - 1];
      runtime.state.currentStepId = previousStep.id;
      runtime.state.lastError = undefined;
      this.emit();
      runtime.state.updatedAt = now();
      await this.enterStep(runtime.definition, runtime.state, previousStep);
      await this.persistActiveState();
    });
  }

  async requestClose(): Promise<boolean> {
    if (!this.activeFlowId || this.busy) return false;
    const runtime = this.requireActiveFlow();
    if (!runtime.definition.dismissible) return false;

    await this.run("延后引导流程", async () => {
      await this.notifyTerminal(runtime, "deferred");
      runtime.state.status = "deferred";
      runtime.state.updatedAt = now();
      await this.persistActiveState();
      await this.closeActiveFlow();
    });
    return true;
  }

  async skip(): Promise<boolean> {
    if (!this.activeFlowId || this.busy) return false;
    const runtime = this.requireActiveFlow();
    if (!runtime.definition.skippable) return false;

    await this.run("跳过引导流程", async () => {
      await this.notifyTerminal(runtime, "skipped");
      runtime.state.status = "skipped";
      runtime.state.completedAt = now();
      runtime.state.updatedAt = now();
      runtime.state.lastError = undefined;
      await this.persistActiveState();
      await this.closeActiveFlow();
    });
    return true;
  }

  async retry(): Promise<void> {
    await this.run("重试引导步骤", async () => {
      const runtime = this.requireActiveFlow();
      const currentStep = this.requireCurrentStep(runtime);
      runtime.state.lastError = undefined;
      runtime.state.status = "in-progress";
      runtime.state.updatedAt = now();
      await this.enterStep(runtime.definition, runtime.state, currentStep);
      await this.persistActiveState();
    });
  }

  async updateActiveContext(updates: Record<string, unknown>): Promise<void> {
    await this.run("更新引导流程上下文", async () => {
      const runtime = this.requireActiveFlow();
      const context = this.getContext(runtime.state);
      Object.assign(context, cloneValue(updates));
      runtime.state.context = context;
      runtime.state.updatedAt = now();
      await this.persistActiveState();
    });
  }

  async runActiveStepAction(
    action: string,
    operation: Parameters<GuidedFlowStepAction<Record<string, unknown>>>[1]
  ): Promise<void> {
    await this.run(action, async () => {
      const runtime = this.requireActiveFlow();
      await operation(this.getContext(runtime.state));
      runtime.state.lastError = undefined;
      runtime.state.updatedAt = now();
      await this.persistActiveState();
    });
  }

  async failActiveFlow(error: unknown): Promise<void> {
    await this.run("记录引导流程失败", async () => {
      const runtime = this.requireActiveFlow();
      runtime.state.status = "failed";
      runtime.state.lastError =
        error instanceof Error ? error.message : String(error);
      runtime.state.updatedAt = now();
      await this.persistActiveState();
    });
  }

  getSnapshot(): GuidedFlowSnapshot {
    return {
      activeFlow: this.activeFlowId
        ? this.getRuntime(this.activeFlowId, true)
        : null,
      queuedFlowIds: [...this.queue],
      isInitialized: this.initialized,
      isBusy: this.busy,
    };
  }

  getState(flowId: string): GuidedFlowState | undefined {
    const state = this.states[flowId];
    return state ? cloneValue(state) : undefined;
  }

  private async run(
    action: string,
    operation: () => Promise<void>
  ): Promise<void> {
    if (this.busy) throw new Error("引导流程正在处理当前操作，请稍候。");
    this.busy = true;
    this.emit();

    try {
      await operation();
    } catch (error) {
      const activeState = this.activeFlowId
        ? this.getRuntime(this.activeFlowId)?.state
        : undefined;
      if (activeState) {
        activeState.lastError =
          error instanceof Error ? error.message : String(error);
        activeState.updatedAt = now();
        await this.persistActiveState();
      }
      errorHandler.error(error, `${action}失败`, { showToUser: false });
      throw error;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  private restoreQueue(): void {
    for (const definition of this.registry.getAll()) {
      const state = this.states[definition.id];
      if (
        !state ||
        state.flowVersion !== definition.version ||
        !definition.resumable
      )
        continue;
      if (
        ["pending", "in-progress", "failed", "deferred"].includes(state.status)
      ) {
        this.enqueue(definition.id);
      }
    }
  }

  private enqueue(flowId: string): void {
    if (this.activeFlowId === flowId || this.queue.includes(flowId)) return;
    this.queue.push(flowId);
    this.queue.sort((left, right) => {
      const leftPriority =
        this.registry.get(left)?.priority ?? Number.NEGATIVE_INFINITY;
      const rightPriority =
        this.registry.get(right)?.priority ?? Number.NEGATIVE_INFINITY;
      return rightPriority - leftPriority;
    });
  }

  private async activateNext(): Promise<void> {
    if (this.activeFlowId) return;

    const flowId = this.queue.shift();
    if (!flowId) return;

    const definition = this.requireDefinition(flowId);
    const state = this.states[flowId];
    if (!state) return;
    const steps = this.getVisibleSteps(definition, state);
    if (steps.length === 0) {
      throw new Error(`Guided Flow ${flowId} 当前没有可展示的步骤`);
    }

    state.status = "in-progress";
    state.currentStepId = steps.some((step) => step.id === state.currentStepId)
      ? state.currentStepId
      : steps[0].id;
    state.startedAt ??= now();
    state.updatedAt = now();
    this.activeFlowId = flowId;
    this.activeMode = "persistent";
    this.replayState = null;
    await this.enterStep(
      definition,
      state,
      this.requireCurrentStep(this.getRuntime(flowId)!)
    );
    await this.persist();
  }

  private async completeActiveFlow(): Promise<void> {
    const runtime = this.requireActiveFlow();
    await this.notifyTerminal(runtime, "completed");
    runtime.state.status = "completed";
    runtime.state.completedAt = now();
    runtime.state.updatedAt = now();
    runtime.state.lastError = undefined;
    await this.persistActiveState();
    await this.closeActiveFlow();
  }

  private async closeActiveFlow(): Promise<void> {
    this.activeFlowId = null;
    this.activeMode = "persistent";
    this.replayState = null;
    await this.activateNext();
  }

  private async createInitialState(
    definition: GuidedFlowDefinition,
    contextUpdates?: Record<string, unknown>
  ): Promise<GuidedFlowState> {
    const createdContext = definition.createContext
      ? await definition.createContext()
      : {};
    const context = {
      ...(cloneValue(createdContext) as Record<string, unknown>),
      ...cloneValue(contextUpdates ?? {}),
    };
    const state: GuidedFlowState = {
      flowId: definition.id,
      flowVersion: definition.version,
      status: "pending",
      completedStepIds: [],
      context,
      updatedAt: now(),
    };
    const steps = this.getVisibleSteps(definition, state);
    if (steps.length === 0) {
      throw new Error(`Guided Flow ${definition.id} 当前没有可展示的步骤`);
    }
    state.currentStepId = steps[0].id;
    return state;
  }

  private getRuntime(
    flowId: string,
    cloneState = false
  ): GuidedFlowRuntime | null {
    const definition = this.registry.get(flowId);
    const state =
      this.activeFlowId === flowId && this.activeMode === "replay"
        ? this.replayState
        : this.states[flowId];
    if (!definition || !state) return null;
    return {
      definition,
      state: cloneState ? cloneValue(state) : state,
      steps: this.getVisibleSteps(definition, state),
      mode:
        this.activeFlowId === flowId
          ? this.activeMode
          : ("persistent" as const),
    };
  }

  private getVisibleSteps(
    definition: GuidedFlowDefinition,
    state: GuidedFlowState
  ): GuidedFlowStep<Record<string, unknown>>[] {
    const context = this.getContext(state);
    return definition.steps.filter(
      (step) => step.when?.(context) ?? true
    ) as GuidedFlowStep<Record<string, unknown>>[];
  }

  private getContext(state: GuidedFlowState): Record<string, unknown> {
    if (!state.context) state.context = {};
    return state.context as Record<string, unknown>;
  }

  private requireDefinition(flowId: string): GuidedFlowDefinition {
    const definition = this.registry.get(flowId);
    if (!definition) throw new Error(`未注册的 Guided Flow: ${flowId}`);
    return definition;
  }

  private requireActiveFlow(): GuidedFlowRuntime {
    if (!this.activeFlowId) throw new Error("当前没有正在展示的 Guided Flow");
    const runtime = this.getRuntime(this.activeFlowId);
    if (!runtime)
      throw new Error(`找不到当前 Guided Flow: ${this.activeFlowId}`);
    return runtime;
  }

  private requireCurrentStep(
    runtime: GuidedFlowRuntime
  ): GuidedFlowStep<Record<string, unknown>> {
    const step = runtime.steps.find(
      (item) => item.id === runtime.state.currentStepId
    );
    if (!step)
      throw new Error(`Guided Flow ${runtime.definition.id} 缺少当前步骤`);
    return step as GuidedFlowStep<Record<string, unknown>>;
  }

  private async enterStep(
    definition: GuidedFlowDefinition,
    state: GuidedFlowState,
    step: GuidedFlowStep<Record<string, unknown>>
  ): Promise<void> {
    await step.onEnter?.(this.getContext(state));
    state.flowVersion = definition.version;
    state.status = "in-progress";
    state.updatedAt = now();
  }

  private async notifyTerminal(
    runtime: GuidedFlowRuntime,
    status: GuidedFlowTerminalStatus
  ): Promise<void> {
    const callback =
      status === "completed"
        ? runtime.definition.onCompleted
        : status === "skipped"
          ? runtime.definition.onSkipped
          : runtime.definition.onDeferred;
    if (!callback) return;

    const state = cloneValue(runtime.state);
    state.status = status;
    if (status === "completed" || status === "skipped") {
      state.completedAt = now();
    }
    await callback({
      mode: runtime.mode,
      status,
      state,
      context: cloneValue(this.getContext(runtime.state)),
    });
  }

  private markStepCompleted(state: GuidedFlowState, stepId: string): void {
    if (!state.completedStepIds.includes(stepId))
      state.completedStepIds.push(stepId);
  }

  private async persistActiveState(): Promise<void> {
    if (this.activeMode === "replay") return;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.persistence.save(cloneValue(this.states));
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const guidedFlowManager = new GuidedFlowManager();
