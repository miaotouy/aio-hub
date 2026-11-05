// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  MacroRegistry,
  MacroPhase,
  MacroType,
} from "../../macro-engine/MacroRegistry";
import { registerDateTimeMacros } from "../../macro-engine/macros/datetime";
import { registerVariableMacros } from "../../macro-engine/macros/variables";
import { getContextDynamicMacros } from "../contextDynamicMacros";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
const registry = MacroRegistry.getInstance();
beforeAll(() => {
  registerDateTimeMacros(registry);
  registerVariableMacros(registry);
});

describe("message-level dynamic macro diagnostics", () => {
  it("retains local and VCP macro names from merged original templates without evaluating them", () => {
    const execute = vi.fn(() => "changed");
    registry.register({
      name: "diagnostic_probe",
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: "fixture",
      acceptsArgs: false,
      dynamic: true,
      execute,
    });
    try {
      expect(
        getContextDynamicMacros({
          sourceType: "merged",
          content: "expanded",
          _mergedSources: [
            {
              sourceType: "agent_preset",
              content: "18:00",
              _originalContent:
                "{{time}} {{getvar::score}} {{user}} \\{{date}} {{diagnostic_probe}}",
            },
            {
              sourceType: "anchor_injection",
              content: "{{Time}} {{Date}} {{Today}} {{Festival}} {{time}}",
            },
          ],
        })
      ).toEqual([
        "time",
        "getvar",
        "diagnostic_probe",
        "Time",
        "Date",
        "Today",
        "Festival",
      ]);
      expect(execute).toHaveBeenCalledTimes(0);
    } finally {
      registry.unregister("diagnostic_probe");
    }
  });
  it("treats history as literal while recognizing the retained template of pending input", () => {
    expect(
      getContextDynamicMacros({
        sourceType: "session_history",
        content: "演示 {{time}}",
      })
    ).toEqual([]);
    expect(
      getContextDynamicMacros({
        sourceType: "session_history",
        content: "18:00",
        _originalContent: "{{time}}",
      })
    ).toEqual(["time"]);
  });
});
