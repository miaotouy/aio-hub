// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { Component } from "vue";
import GuidedFlowStepper from "../GuidedFlowStepper.vue";

const StepComponent = {} as Component;
const steps = [
  { id: "summary", title: "版本概览", component: StepComponent },
  { id: "plan", title: "迁移方案与确认", component: StepComponent },
  { id: "result", title: "迁移与校验", component: StepComponent },
];

describe("GuidedFlowStepper", () => {
  it("renders the complete rail while preserving the current-step label", () => {
    const wrapper = mount(GuidedFlowStepper, {
      props: { steps, currentStepId: "plan" },
    });

    expect(wrapper.findAll(".step-title").map((item) => item.text())).toEqual([
      "版本概览",
      "迁移方案与确认",
      "迁移与校验",
    ]);
    expect(wrapper.find('[aria-current="step"]').text()).toContain(
      "第 2 步：迁移方案与确认"
    );
    expect(wrapper.findAll(".step-marker")).toHaveLength(3);
    expect(wrapper.findAll(".step-connector")).toHaveLength(2);
  });
});
