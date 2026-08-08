// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { describe, expect, it } from "vitest";
import fixture from "../../__fixtures__/recall-pipeline-migration-v1.json";
import {
  LEGACY_RETRIEVAL_PRESET_MAP,
  migrateLegacyRetrievalSelection,
  type LegacyRetrievalMigrationInput,
} from "../retrievalPipelineMigration";

describe("Recall retrieval pipeline legacy migration v1", () => {
  it.each(fixture.cases)(
    "migrates $name deterministically",
    ({ input, expected }) => {
      expect(
        migrateLegacyRetrievalSelection(input as LegacyRetrievalMigrationInput)
      ).toEqual(expected);
    }
  );

  it("freezes all six built-in legacy IDs without exposing them as presets", () => {
    expect(LEGACY_RETRIEVAL_PRESET_MAP).toEqual({
      keyword: "algorithmic",
      vector: "comprehensive",
      lens: "comprehensive",
      blender: "comprehensive",
      semantic: "comprehensive",
      associative: "comprehensive",
    });
  });

  it("migrates the persisted Playground shape and invalidates slot results", () => {
    expect(
      migrateLegacyRetrievalSelection({
        source: "workspace-playground",
        selectorField: "engineId",
        targetField: "presetId",
        legacyId: "blender",
        fields: {
          globalQuery: "Rust migration",
          selectedRecallIds: ["recall-1"],
          slots: [
            {
              id: "slot-1",
              engineId: "blender",
              config: { embeddingModel: "model-1", maxResidualLayers: 4 },
              results: [{ entryId: "stale" }],
            },
          ],
        },
      })
    ).toMatchObject({
      status: "migrated",
      targetPresetId: "comprehensive",
      preservedFields: {
        globalQuery: "Rust migration",
        selectedRecallIds: ["recall-1"],
        slots: [
          {
            id: "slot-1",
            presetId: "comprehensive",
            limit: 6,
          },
        ],
      },
      invalidatedFields: ["slots[].config", "slots[].results"],
    });
  });
});
