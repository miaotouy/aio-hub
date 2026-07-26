// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { describe, expect, it } from "vitest";
import type { Component } from "vue";
import type { UpgradeContributionDefinition } from "../types";
import { composeUpgradeFlowDefinition } from "../upgradeFlowComposer";

const StepComponent = {} as Component;
const contribution: UpgradeContributionDefinition = {
  id: "migration",
  revision: 1,
  title: "Migration",
  order: 1,
  appliesTo: () => true,
  detect: async () => null,
  steps: [{ id: "execute", title: "Execute", component: StepComponent }],
};

function compose(status: "pending" | "unavailable") {
  return composeUpgradeFlowDefinition({
    currentVersion: "0.7.0-alpha.1",
    transition: "upgrade",
    manifests: [],
    contributions: {
      migration: {
        instanceKey: "migration:1",
        revision: 1,
        title: "Migration",
        blockingScope: "module",
        status,
        snapshot: null,
      },
    },
    contributionDefinitions: [contribution],
  });
}

describe("composeUpgradeFlowDefinition", () => {
  it("includes pending contribution steps", async () => {
    const definition = compose("pending");
    const context = await definition.createContext!();
    const visibleIds = definition.steps
      .filter((step) => step.when?.(context) ?? true)
      .map((step) => step.id);

    expect(visibleIds).toEqual([
      "summary",
      "contribution:migration:execute",
      "complete",
    ]);
  });

  it("hides contribution steps when detection is unavailable", async () => {
    const definition = compose("unavailable");
    const context = await definition.createContext!();
    const visibleIds = definition.steps
      .filter((step) => step.when?.(context) ?? true)
      .map((step) => step.id);

    expect(visibleIds).toEqual(["summary", "complete"]);
  });
});
