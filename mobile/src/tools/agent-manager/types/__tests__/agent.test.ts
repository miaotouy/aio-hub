import { describe, expect, it } from "vitest";
import {
  AgentCategory,
  normalizeAgentAssetGroups,
  normalizeAgentCategory,
} from "../agent";

describe("normalizeAgentCategory", () => {
  it("maps legacy custom data to the desktop-compatible Other category", () => {
    expect(normalizeAgentCategory("custom")).toBe(AgentCategory.Other);
  });

  it("keeps all current categories valid", () => {
    expect(normalizeAgentCategory(AgentCategory.Assistant)).toBe(
      AgentCategory.Assistant
    );
    expect(normalizeAgentCategory(AgentCategory.Creative)).toBe(
      AgentCategory.Creative
    );
    expect(normalizeAgentCategory(AgentCategory.Workflow)).toBe(
      AgentCategory.Workflow
    );
  });

  it("does not claim unknown future categories are current values", () => {
    expect(normalizeAgentCategory("future-category")).toBeUndefined();
  });
});

describe("normalizeAgentAssetGroups", () => {
  it("returns an empty list for legacy non-array payloads", () => {
    expect(normalizeAgentAssetGroups(undefined)).toEqual([]);
    expect(normalizeAgentAssetGroups(null)).toEqual([]);
    expect(normalizeAgentAssetGroups({ id: "bgm" })).toEqual([]);
  });

  it("keeps valid groups and their extra fields while dropping unusable entries", () => {
    const result = normalizeAgentAssetGroups([
      "legacy-string",
      42,
      null,
      ["nested"],
      { displayName: "缺少 id" },
      { id: "  ", displayName: "空 id" },
      {
        id: "bgm",
        displayName: "背景音乐",
        description: "循环音乐",
        icon: "music",
        sortOrder: 2,
        desktopOnly: true,
      },
    ]);

    expect(result).toEqual([
      {
        id: "bgm",
        displayName: "背景音乐",
        description: "循环音乐",
        icon: "music",
        sortOrder: 2,
        desktopOnly: true,
      },
    ]);
  });

  it("falls back to the id when displayName is missing or blank", () => {
    expect(normalizeAgentAssetGroups([{ id: "emoji" }])).toEqual([
      { id: "emoji", displayName: "emoji" },
    ]);
    expect(
      normalizeAgentAssetGroups([{ id: "emoji", displayName: "   " }])
    ).toEqual([{ id: "emoji", displayName: "emoji" }]);
  });
});
