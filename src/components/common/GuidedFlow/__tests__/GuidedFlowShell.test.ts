// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { mount } from "@vue/test-utils";
import { defineComponent, type Component } from "vue";
import { describe, expect, it } from "vitest";
import type { GuidedFlowRuntime } from "@/services/guided-flow";
import GuidedFlowShell from "../GuidedFlowShell.vue";

const DefaultStep = defineComponent({
  template: '<div class="default-step">Default</div>',
});
const ManagedStep = defineComponent({
  template: '<div class="managed-step">Managed</div>',
});

function createRuntime(
  component: Component,
  footer: "default" | "step" = "default"
): GuidedFlowRuntime {
  const step = {
    id: "current",
    title: "当前步骤",
    description: "步骤说明",
    component,
    footer,
  };
  return {
    definition: {
      id: "test-flow",
      version: "1",
      title: "测试流程",
      trigger: "manual",
      priority: 1,
      resumable: true,
      dismissible: true,
      steps: [step],
    },
    state: {
      flowId: "test-flow",
      flowVersion: "1",
      status: "in-progress",
      currentStepId: "current",
      completedStepIds: [],
      context: {},
    },
    steps: [step],
    mode: "persistent",
  };
}

const global = {
  stubs: {
    "el-button": {
      template: "<button><slot /></button>",
    },
    "el-icon": {
      template: "<span><slot /></span>",
    },
  },
};

describe("GuidedFlowShell", () => {
  it("uses the shell as the only primary scroll and footer owner by default", () => {
    const wrapper = mount(GuidedFlowShell, {
      props: {
        runtime: createRuntime(DefaultStep),
        busy: false,
        runStepAction: async () => {},
      },
      global,
    });

    expect(wrapper.attributes("data-footer-owner")).toBe("shell");
    expect(
      wrapper.find(".guided-flow-content").attributes("data-scroll-owner")
    ).toBe("shell");
    expect(wrapper.find(".guided-flow-footer").exists()).toBe(true);
  });

  it("hands both scroll and footer ownership to a managed step", () => {
    const wrapper = mount(GuidedFlowShell, {
      props: {
        runtime: createRuntime(ManagedStep, "step"),
        busy: false,
        runStepAction: async () => {},
      },
      global,
    });

    expect(wrapper.attributes("data-footer-owner")).toBe("step");
    expect(
      wrapper.find(".guided-flow-content").attributes("data-scroll-owner")
    ).toBe("step");
    expect(wrapper.find(".guided-flow-footer").exists()).toBe(false);
    expect(wrapper.find(".managed-step").exists()).toBe(true);
  });
});
