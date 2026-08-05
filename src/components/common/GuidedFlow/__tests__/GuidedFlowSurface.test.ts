// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { mount } from "@vue/test-utils";
import { type Component } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import type { GuidedFlowRuntime } from "@/services/guided-flow";
import GuidedFlowSurface from "../GuidedFlowSurface.vue";

const StepComponent = {} as Component;
const runtime: GuidedFlowRuntime = {
  definition: {
    id: "test-flow",
    version: "1",
    title: "测试流程",
    trigger: "manual",
    priority: 1,
    resumable: true,
    dismissible: true,
    steps: [{ id: "one", title: "第一步", component: StepComponent }],
  },
  state: {
    flowId: "test-flow",
    flowVersion: "1",
    status: "in-progress",
    currentStepId: "one",
    completedStepIds: [],
    context: {},
  },
  steps: [{ id: "one", title: "第一步", component: StepComponent }],
  mode: "persistent",
};

const wrappers: Array<ReturnType<typeof mount>> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

describe("GuidedFlowSurface", () => {
  it("renders a titlebar-bounded modal surface only while a runtime is active", async () => {
    const wrapper = mount(GuidedFlowSurface, {
      attachTo: document.body,
      props: {
        runtime: null,
        busy: false,
        runStepAction: async () => {},
      },
      global: {
        stubs: { GuidedFlowShell: true },
      },
    });
    wrappers.push(wrapper);

    expect(document.querySelector(".guided-flow-surface")).toBeNull();

    await wrapper.setProps({ runtime });
    const surface = document.querySelector(".guided-flow-surface");
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("role")).toBe("dialog");
    expect(surface?.getAttribute("aria-label")).toBe("测试流程");
  });
});
