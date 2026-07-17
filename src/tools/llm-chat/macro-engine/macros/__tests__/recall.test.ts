// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { afterEach, describe, expect, it } from "vitest";
import { createMacroContext } from "../../MacroContext";
import { getMacroRegistry } from "../../MacroRegistry";
import { registerRecallMacros } from "../recall";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";

function context() {
  const agent = {
    recallConfig: {
      enabled: true,
      bindings: [
        {
          recallId: "collection/1",
          recallName: "Engineering",
          enabled: true,
          profile: "semantic",
          limit: 4,
        },
      ],
    },
  } as ChatAgent;
  return createMacroContext({ agent });
}

describe("Recall macros", () => {
  const registry = getMacroRegistry();

  afterEach(() => registry.clear());

  it("uses named arguments and emits canonical placeholders", async () => {
    registerRecallMacros(registry);
    const macro = registry.getMacro("recall");

    expect(
      macro?.execute(context(), [
        "limit=8",
        "collection=collection%2F1",
        "profile=associative",
      ])
    ).toBe(
      "【recall::collection=collection%2F1::profile=associative::limit=8】"
    );
  });

  it("rejects positional arguments instead of reviving the legacy protocol", () => {
    registerRecallMacros(registry);
    const macro = registry.getMacro("recall");

    expect(() => macro?.execute(context(), ["collection/1", "8"])).toThrow();
  });
});
