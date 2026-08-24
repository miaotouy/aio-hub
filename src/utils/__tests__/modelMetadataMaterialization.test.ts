// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { describe, expect, it } from "vitest";
import type { ModelMetadataProperties } from "@/types/model-metadata";
import {
  detachModifiedMetadataPaths,
  materializeModelMetadata,
} from "../modelMetadataMaterialization";

describe("materializeModelMetadata", () => {
  const properties = {
    group: "OpenAI",
    icon: "/model-icons/openai-color.svg",
    description: "A configured model",
    tokenizer: "gpt4o",
    contextLength: 128_000,
    capabilities: { vision: true, toolUse: true },
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [],
      },
    },
  } satisfies ModelMetadataProperties;

  it("fills missing model fields and snapshots media generation parameters", () => {
    const { model, changes, binding } = materializeModelMetadata(
      { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      properties,
      { sourceRevision: "2026.08.24.1", appliedRuleIds: ["openai-gpt"] }
    );

    expect(model).toMatchObject({
      group: "OpenAI",
      tokenizerProfileId: "gpt4o",
      apiFamily: "openai",
      tokenLimits: { contextLength: 128_000 },
      capabilities: { vision: true, toolUse: true },
      mediaGenParams: properties.mediaGenParams,
    });
    expect(model.mediaGenParams).not.toBe(properties.mediaGenParams);
    expect(binding.managedPaths).toEqual(
      expect.arrayContaining(["group", "tokenLimits.contextLength"])
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "capabilities.vision", next: true }),
      ])
    );
  });

  it("preserves explicit values in fillMissing mode and only refreshes tracked fields", () => {
    const source = {
      id: "gpt-4o",
      name: "GPT-4o",
      group: "My Group",
      tokenLimits: { contextLength: 32_000 },
      metadataBinding: {
        mode: "followSource" as const,
        managedPaths: ["description"],
      },
    };
    const { model } = materializeModelMetadata(source, {
      ...properties,
      description: "Updated description",
      group: "Incoming Group",
      contextLength: 256_000,
    });

    expect(model.group).toBe("My Group");
    expect(model.tokenLimits?.contextLength).toBe(32_000);
    expect(model.description).toBe("Updated description");
  });

  it("leaves manual bindings untouched", () => {
    const source = {
      id: "gpt-4o",
      name: "GPT-4o",
      group: "Manual",
      metadataBinding: { mode: "manual" as const },
    };
    const { model } = materializeModelMetadata(source, properties);
    expect(model).toEqual(source);
  });
  it("detaches only metadata-managed fields changed by the user", () => {
    const baseline = {
      id: "gpt-4o",
      name: "GPT-4o",
      group: "OpenAI",
      icon: "/model-icons/openai-color.svg",
      metadataBinding: {
        mode: "followSource" as const,
        managedPaths: ["group", "icon"],
      },
    };

    const model = detachModifiedMetadataPaths(baseline, {
      ...baseline,
      group: "My Models",
    });

    expect(model.metadataBinding?.managedPaths).toEqual(["icon"]);
  });
});
