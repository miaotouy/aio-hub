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

import type { Component } from "vue";

export type GuidedFlowTrigger =
  | "first-install"
  | "version-changed"
  | "pending-migration"
  | "module-first-use"
  | "manual";

export type GuidedFlowStatus =
  "pending" | "in-progress" | "completed" | "skipped" | "failed" | "deferred";

export type GuidedFlowBlockingScope = "none" | "module" | "application";

export type GuidedFlowRuntimeMode = "persistent" | "replay";

export type GuidedFlowTerminalStatus = "completed" | "skipped" | "deferred";

export type GuidedFlowStepAction<TContext> = (
  action: string,
  operation: (context: TContext) => Promise<void> | void
) => Promise<void>;

export interface GuidedFlowStepComponentProps<TContext> {
  context: TContext;
  flowState: GuidedFlowState;
  updateContext: (updates: Partial<TContext>) => Promise<void>;
}

export interface GuidedFlowStep<TContext> {
  id: string;
  title: string;
  description?: string;
  nextLabel?: string;
  backLabel?: string;
  footer?: "default" | "step";
  component: Component;
  when?: (context: TContext) => boolean;
  onEnter?: (context: TContext) => Promise<void> | void;
  validate?: (context: TContext) => Promise<boolean> | boolean;
  onNext?: (context: TContext) => Promise<void> | void;
  onBack?: (context: TContext) => Promise<void> | void;
}

export interface GuidedFlowTerminalEvent<TContext> {
  mode: GuidedFlowRuntimeMode;
  status: GuidedFlowTerminalStatus;
  state: GuidedFlowState<TContext>;
  context: TContext;
}

export interface GuidedFlowDefinition<TContext = Record<string, unknown>> {
  id: string;
  version: string;
  title: string;
  description?: string;
  trigger: GuidedFlowTrigger;
  priority: number;
  resumable: boolean;
  dismissible: boolean;
  dismissLabel?: string;
  skippable?: boolean;
  skipLabel?: string;
  blockingScope?: GuidedFlowBlockingScope;
  createContext?: () => Promise<TContext> | TContext;
  onCompleted?: (
    event: GuidedFlowTerminalEvent<TContext>
  ) => Promise<void> | void;
  onSkipped?: (
    event: GuidedFlowTerminalEvent<TContext>
  ) => Promise<void> | void;
  onDeferred?: (
    event: GuidedFlowTerminalEvent<TContext>
  ) => Promise<void> | void;
  steps: GuidedFlowStep<TContext>[];
}

export interface GuidedFlowState<TContext = Record<string, unknown>> {
  flowId: string;
  flowVersion: string;
  status: GuidedFlowStatus;
  currentStepId?: string;
  completedStepIds: string[];
  context?: TContext;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  lastError?: string;
}

export interface GuidedFlowRuntime<TContext = Record<string, unknown>> {
  definition: GuidedFlowDefinition<TContext>;
  state: GuidedFlowState<TContext>;
  steps: GuidedFlowStep<TContext>[];
  mode: GuidedFlowRuntimeMode;
}

export interface GuidedFlowSnapshot {
  activeFlow: GuidedFlowRuntime | null;
  queuedFlowIds: string[];
  isInitialized: boolean;
  isBusy: boolean;
}

export interface GuidedFlowOpenOptions {
  /** @deprecated 使用 mode: "restart"。 */
  restart?: boolean;
  mode?: "resume" | "restart" | "replay";
  context?: Record<string, unknown>;
}
