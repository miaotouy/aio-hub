// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { guidedFlowStepControlsKey } from "@/services/guided-flow/stepControls";
import type { RecallMigrationFlowContext } from "../types";
import MigrationStep from "../components/MigrationStep.vue";

const context: RecallMigrationFlowContext = {
  migration: {
    preview: {
      migrationId: "knowledge-to-recall-v2",
      sourceFingerprint: "fingerprint",
      sourcePath: "C:/legacy/bases",
      legacyDataPath: "C:/legacy",
      targetDescription: "Recall SQLite",
      sourceCollections: 1,
      sourceEntries: 1,
      sourceVectors: 0,
      preservedFields: [],
      rebuiltFields: [],
      unsupportedFields: [],
      warnings: [],
      requiresBackup: true,
      mainStatus: "not_started",
      vectorStatus: "not_started",
      pendingVectors: 0,
      issueCount: 0,
    },
    backupConfirmed: false,
    executionStatus: "pending",
    cleanupChoice: "keep",
    cleanupConfirmation: "",
  },
};

const controls = {
  isBusy: ref(false),
  canGoBack: ref(false),
  canDefer: ref(true),
  runAction: async () => undefined,
  requestNext: () => undefined,
  requestBack: () => undefined,
  requestDefer: () => undefined,
};

describe("MigrationStep", () => {
  it("relies on the flow rail instead of rendering a second substep progress bar", () => {
    const wrapper = mount(MigrationStep, {
      props: { context },
      global: {
        provide: { [guidedFlowStepControlsKey as symbol]: controls },
        stubs: {
          MigrationPlanStep: {
            template: '<div class="migration-plan-stub" />',
          },
          "el-button": { template: "<button><slot /></button>" },
        },
      },
    });

    expect(wrapper.find('[aria-label="迁移进度"]').exists()).toBe(false);
    expect(wrapper.find(".migration-plan-stub").exists()).toBe(true);
  });
});
