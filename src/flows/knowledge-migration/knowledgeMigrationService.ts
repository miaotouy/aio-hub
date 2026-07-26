// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { invoke } from "@tauri-apps/api/core";
import type { RecallMigrationPreview, RecallMigrationReport } from "./types";

export const knowledgeMigrationService = {
  inspect(): Promise<RecallMigrationReport | null> {
    return invoke("recall_inspect_legacy_migration");
  },

  preview(): Promise<RecallMigrationPreview | null> {
    return invoke("recall_preview_legacy_migration");
  },

  run(
    migrationId: string,
    sourceFingerprint: string
  ): Promise<RecallMigrationReport> {
    return invoke("recall_run_legacy_migration", {
      confirmation: {
        migrationId,
        sourceFingerprint,
        confirmed: true,
      },
    });
  },

  cleanup(sourceFingerprint: string): Promise<string[]> {
    return invoke("recall_confirm_legacy_cleanup", {
      sourceFingerprint,
      confirmed: true,
    });
  },
};
