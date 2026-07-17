// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { describe, expect, it } from "vitest";
import {
  engineRequiresEmbedding,
  profileDefaults,
} from "../engineCapabilities";

describe("Recall engine capabilities", () => {
  it("covers every embedding-backed engine", () => {
    for (const id of ["vector", "lens", "blender", "semantic", "associative"]) {
      expect(engineRequiresEmbedding(id)).toBe(true);
    }
    expect(engineRequiresEmbedding("keyword")).toBe(false);
  });

  it("prefers registered backend capabilities", () => {
    expect(
      engineRequiresEmbedding("custom", [
        {
          id: "custom",
          name: "Custom",
          description: "",
          icon: null,
          supportedPayloadTypes: ["vector"],
          requiresEmbedding: true,
          parameters: [],
        },
      ])
    ).toBe(true);
  });

  it("uses stricter associative defaults", () => {
    expect(profileDefaults("associative")).toEqual({
      limit: 4,
      minScore: 0.45,
    });
    expect(profileDefaults("semantic")).toEqual({ limit: 5, minScore: 0.3 });
  });
});
