// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { describeContextMessageSource } from "../contextMessageSource";

describe("context message provenance", () => {
  it("identifies runtime injections without requiring a preset array index", () => {
    expect(
      describeContextMessageSource({
        sourceType: "anchor_injection",
        sourceId: "recall:auto",
        _name: "自动召回",
      })
    ).toEqual({ source: "injection", sourceLabel: "记忆召回" });
    expect(
      describeContextMessageSource({
        sourceType: "anchor_injection",
        sourceId: "auto-tool-context",
        _name: "工具运行环境",
      })
    ).toEqual({ source: "injection", sourceLabel: "工具运行环境" });
    expect(
      describeContextMessageSource({ sourceType: "depth_injection" })
    ).toEqual({ source: "injection", sourceLabel: "深度注入" });
  });
  it("keeps preset provenance even when detailed preview information is unavailable", () => {
    expect(
      describeContextMessageSource({
        sourceType: "agent_preset",
        sourceIndex: 7,
      })
    ).toEqual({ source: "agent_preset", sourceLabel: "预设" });
    expect(
      describeContextMessageSource({
        sourceType: "anchor_injection",
        sourceIndex: 7,
      })
    ).toEqual({ source: "agent_preset", sourceLabel: "预设 · 锚点注入" });
  });
  it("retains distinct origins through nested role merges", () => {
    expect(
      describeContextMessageSource({
        sourceType: "merged",
        _mergedSources: [
          { sourceType: "agent_preset" },
          {
            sourceType: "merged",
            _mergedSources: [
              { sourceType: "session_history" },
              {
                sourceType: "anchor_injection",
                _snapshotIdentity: { type: "recall" },
              },
            ],
          },
        ],
      })
    ).toEqual({ source: "mixed", sourceLabel: "预设 / 历史 / 记忆召回" });
  });
});
