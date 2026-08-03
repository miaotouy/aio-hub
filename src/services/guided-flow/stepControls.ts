// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { inject, type InjectionKey, type Ref } from "vue";
import type { GuidedFlowStepAction } from "./types";

export interface GuidedFlowStepControls<TContext = Record<string, unknown>> {
  isBusy: Readonly<Ref<boolean>>;
  canGoBack: Readonly<Ref<boolean>>;
  canDefer: Readonly<Ref<boolean>>;
  runAction: GuidedFlowStepAction<TContext>;
  requestNext: () => void | Promise<void>;
  requestBack: () => void | Promise<void>;
  requestDefer: () => void | Promise<void>;
}

export const guidedFlowStepControlsKey: InjectionKey<GuidedFlowStepControls> =
  Symbol("guided-flow-step-controls");

export function useGuidedFlowStepControls<
  TContext = Record<string, unknown>,
>(): GuidedFlowStepControls<TContext> {
  const controls = inject(guidedFlowStepControlsKey);
  if (!controls) {
    throw new Error("当前组件不在 Guided Flow 步骤上下文中");
  }
  return controls as GuidedFlowStepControls<TContext>;
}
